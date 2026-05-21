"""Integration tests for full workspace lifecycle."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.dependencies import close_db, close_redis, init_db, init_redis
from app.main import create_app
from app.models.workspace import Workspace, WorkspaceStatus
from app.models.workspace_event import WorkspaceEvent
from app.workers.gc_tasks import scan_and_kill_idle_workspaces
from app.workers.db import get_db_session


def _token(user_id: str) -> str:
    settings = get_settings()
    payload = {
        "sub": user_id,
        "email": "integration@example.com",
        "roles": ["user"],
        "exp": datetime.now(timezone.utc) + timedelta(minutes=20),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


@pytest_asyncio.fixture
async def integration_client(monkeypatch: pytest.MonkeyPatch):
    """
    Requires docker-compose services (Postgres/Redis) up.

    Kubernetes is mocked; Celery dispatch is mocked to run inline state transition.
    """
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5433/cloud_ide_test")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6380/0")
    get_settings.cache_clear()

    app = create_app()
    await init_db()
    await init_redis()
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with maker() as session:
        await session.execute(text("CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY)"))
        await session.commit()

    def _spawn_delay(workspace_id: str):
        with get_db_session() as session:
            ws = session.get(Workspace, workspace_id)
            if ws is None:
                return SimpleNamespace()
            ws.status = WorkspaceStatus.RUNNING
            ws.pod_ip = "10.42.0.10"
            ws.k8s_namespace = f"ws-{workspace_id}"
            ws.k8s_pod_name = f"pod-{workspace_id}"
            ws.access_url = f"http://{ws.pod_ip}:8888"
            ws.started_at = datetime.now(timezone.utc)
            ws.auto_kill_at = datetime.now(timezone.utc) + timedelta(minutes=30)
            session.add(
                WorkspaceEvent(
                    workspace_id=workspace_id,
                    event_type="RUNNING",
                    actor="system",
                    details={},
                )
            )
        return SimpleNamespace()

    def _stop_delay(workspace_id: str, save_notebooks: bool = True):
        from app.workers.provisioning_tasks import stop_workspace_task

        stop_workspace_task.run(workspace_id, save_notebooks=save_notebooks)
        return SimpleNamespace()

    monkeypatch.setattr("app.services.workspace_service.spawn_workspace.delay", _spawn_delay)
    monkeypatch.setattr("app.services.workspace_service.stop_workspace_task.delay", _stop_delay)
    class DummyK8s:
        async def delete_namespace(self, namespace: str) -> None:
            _ = namespace
            return None

    monkeypatch.setattr("app.workers.provisioning_tasks.KubernetesService", lambda *a, **k: DummyK8s())

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, maker, engine

    await close_db()
    await close_redis()
    await engine.dispose()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_create_run_stop_workspace(integration_client):
    client, maker, _ = integration_client
    user_id = str(uuid4())

    async with maker() as session:
        await session.execute(text("INSERT INTO users (id) VALUES (:uid) ON CONFLICT DO NOTHING"), {"uid": user_id})
        await session.execute(text("DELETE FROM workspace_events"))
        await session.execute(text("DELETE FROM workspaces WHERE user_id = :uid"), {"uid": user_id})
        await session.commit()

    headers = {"Authorization": f"Bearer {_token(user_id)}"}
    create_resp = await client.post("/api/v1/workspaces", headers=headers, json={"tier": "cpu-standard"})
    assert create_resp.status_code == 202
    workspace_id = create_resp.json()["workspace_id"]

    status_resp = await client.get(f"/api/v1/workspaces/{workspace_id}/status", headers=headers)
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] == "RUNNING"

    hb_resp = await client.post(f"/api/v1/workspaces/{workspace_id}/heartbeat", headers=headers)
    assert hb_resp.status_code == 200

    stop_resp = await client.post(
        f"/api/v1/workspaces/{workspace_id}/stop",
        headers=headers,
        json={"save_notebooks": True},
    )
    assert stop_resp.status_code == 202

    status_resp2 = await client.get(f"/api/v1/workspaces/{workspace_id}/status", headers=headers)
    assert status_resp2.status_code == 200
    assert status_resp2.json()["status"] in {"STOPPING", "STOPPED"}

    async with maker() as session:
        rows = (
            await session.execute(
                text("SELECT event_type FROM workspace_events WHERE workspace_id = :wid"),
                {"wid": workspace_id},
            )
        ).all()
    event_types = {r[0] for r in rows}
    assert "START_REQUESTED" in event_types
    assert "RUNNING" in event_types
    assert "STOPPED" in event_types


@pytest.mark.integration
@pytest.mark.asyncio
async def test_quota_enforcement(integration_client):
    client, maker, _ = integration_client
    user_id = str(uuid4())
    headers = {"Authorization": f"Bearer {_token(user_id)}"}

    async with maker() as session:
        await session.execute(text("INSERT INTO users (id) VALUES (:uid) ON CONFLICT DO NOTHING"), {"uid": user_id})
        await session.execute(text("DELETE FROM workspaces WHERE user_id = :uid"), {"uid": user_id})
        await session.execute(text("DELETE FROM workspace_events"))
        await session.commit()

    r1 = await client.post("/api/v1/workspaces", headers=headers, json={"tier": "cpu-standard"})
    r2 = await client.post("/api/v1/workspaces", headers=headers, json={"tier": "cpu-standard"})
    r3 = await client.post("/api/v1/workspaces", headers=headers, json={"tier": "cpu-standard"})

    assert r1.status_code == 202
    assert r2.status_code == 202
    assert r3.status_code == 429


@pytest.mark.integration
@pytest.mark.asyncio
async def test_gc_kills_idle_workspace(integration_client, monkeypatch: pytest.MonkeyPatch):
    _client, maker, _ = integration_client
    user_id = str(uuid4())
    workspace_id = "ws_gc_e2e"

    async with maker() as session:
        await session.execute(text("INSERT INTO users (id) VALUES (:uid) ON CONFLICT DO NOTHING"), {"uid": user_id})
        await session.execute(text("DELETE FROM workspace_events WHERE workspace_id = :wid"), {"wid": workspace_id})
        await session.execute(text("DELETE FROM workspaces WHERE id = :wid"), {"wid": workspace_id})
        await session.execute(
            text(
                """
                INSERT INTO workspaces (
                  id, user_id, status, tier, k8s_namespace, k8s_pod_name, pod_ip,
                  dataset_ids, model_ids, environment_config, resource_config,
                  auto_kill_at, created_at, updated_at
                )
                VALUES (
                  :wid, :uid, 'RUNNING', 'cpu-standard', :ns, :pod, '10.42.0.10',
                  '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
                  :kill_at, now(), now()
                )
                """
            ),
            {
                "wid": workspace_id,
                "uid": user_id,
                "ns": f"ws-{workspace_id}",
                "pod": f"pod-{workspace_id}",
                "kill_at": datetime.now(timezone.utc) - timedelta(seconds=1),
            },
        )
        await session.commit()

    async def _fake_gc(workspace_id: str, pod_ip: str | None):
        _ = pod_ip
        from app.workers.provisioning_tasks import stop_workspace_task

        stop_workspace_task.run(workspace_id, save_notebooks=False)
        return {"action": "killed", "workspace_id": workspace_id}

    monkeypatch.setattr("app.workers.gc_tasks._run_gc_for_workspace", _fake_gc)
    result = scan_and_kill_idle_workspaces.run()
    assert result["killed"] >= 1

    async with maker() as session:
        ws = await session.get(Workspace, workspace_id)
        assert ws is not None
        assert ws.status == WorkspaceStatus.STOPPED
