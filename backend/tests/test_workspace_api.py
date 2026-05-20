"""Workspace API endpoint tests."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt

from app.config import get_settings
from app.core.exceptions import (
    QuotaExceededError,
    WorkspaceNotFoundError,
    WorkspaceNotOwnedError,
    WorkspaceNotRunningError,
)
from app.dependencies import get_db, get_k8s_service, get_redis
from app.main import create_app
from app.models.workspace import WorkspaceStatus
from app.services.workspace_service import WorkspaceService


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, bytes] = {}

    async def get(self, key: str):
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None):
        self.store[key] = value.encode() if isinstance(value, str) else value

    async def incr(self, key: str) -> int:
        val = self.store.get(key, b"0")
        new_val = int(val) + 1
        self.store[key] = str(new_val).encode()
        return new_val

    async def expire(self, key: str, time: int):
        return True


class FakeDB:
    async def commit(self):
        return None

    async def flush(self):
        return None

    async def refresh(self, _obj):
        return None

    async def delete(self, _obj):
        return None


@dataclass
class FakeWorkspace:
    id: str
    user_id: str
    name: str | None
    status: WorkspaceStatus
    tier: str
    created_at: datetime
    updated_at: datetime
    access_url: str | None = None
    pod_ip: str | None = "10.0.0.1"
    last_kernel_activity: datetime | None = None
    auto_kill_at: datetime | None = None
    last_heartbeat: datetime | None = None
    started_at: datetime | None = None
    stopped_at: datetime | None = None
    k8s_namespace: str | None = None
    k8s_pod_name: str | None = None
    dataset_ids: list[str] | None = None
    model_ids: list[str] | None = None
    environment_config: dict | None = None
    resource_config: dict | None = None
    error_message: str | None = None

    def is_owned_by(self, user_id: str) -> bool:
        return self.user_id == user_id


class DummyK8sService:
    def __init__(self):
        self.restarted = False

    async def restart_kernel(self, pod_ip: str, kernel_id: str) -> None:
        self.restarted = True


def _token(user_id: str) -> str:
    settings = get_settings()
    payload = {
        "sub": user_id,
        "email": "user@example.com",
        "roles": ["user"],
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


@pytest_asyncio.fixture
async def workspace_client(monkeypatch: pytest.MonkeyPatch):
    app = create_app()
    redis = FakeRedis()
    db = FakeDB()
    k8s = DummyK8sService()
    user_id = str(uuid4())
    ws_id = "ws_7f3a9b2c"
    workspace = FakeWorkspace(
        id=ws_id,
        user_id=user_id,
        name="demo",
        status=WorkspaceStatus.RUNNING,
        tier="cpu-standard",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        access_url="https://lab.platform.com/ws/ws_7f3a9b2c/lab",
        auto_kill_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        dataset_ids=[],
        model_ids=[],
        environment_config={},
        resource_config={},
    )

    monkeypatch.setattr("app.dependencies.get_redis_client", lambda: redis)
    monkeypatch.setattr("app.middleware.rate_limit_middleware.get_redis_client", lambda: redis)
    monkeypatch.setattr("app.services.workspace_service.spawn_workspace.delay", lambda *_a, **_k: None)
    monkeypatch.setattr("app.services.workspace_service.stop_workspace_task.delay", lambda *_a, **_k: None)
    async def _ok(*_a, **_k):
        return True

    async def _zero(*_a, **_k):
        return 0

    async def _create(*_a, **_k):
        import copy
        return copy.copy(workspace)

    async def _event(*_a, **_k):
        return None

    async def _list(*_a, **_k):
        return [workspace]

    async def _get(*_a, **_k):
        return workspace

    async def _update(*_a, **_k):
        return SimpleNamespace(id=workspace.id, status=WorkspaceStatus.STOPPING)

    monkeypatch.setattr("app.services.workspace_service.UpstreamClient.validate_dataset_ids", _ok)
    monkeypatch.setattr("app.services.workspace_service.UpstreamClient.validate_model_ids", _ok)
    monkeypatch.setattr("app.repositories.workspace_repository.WorkspaceRepository.count_running_by_user", _zero)
    monkeypatch.setattr("app.repositories.workspace_repository.WorkspaceRepository.create", _create)
    monkeypatch.setattr("app.repositories.workspace_repository.WorkspaceRepository.add_event", _event)
    monkeypatch.setattr("app.repositories.workspace_repository.WorkspaceRepository.list_by_user", _list)
    monkeypatch.setattr("app.repositories.workspace_repository.WorkspaceRepository.get_by_id", _get)
    monkeypatch.setattr("app.repositories.workspace_repository.WorkspaceRepository.update_status", _update)

    async def _get_db():
        yield db

    async def _get_redis():
        return redis

    app.dependency_overrides = {}
    app.dependency_overrides[get_db] = _get_db
    app.dependency_overrides[get_redis] = _get_redis
    app.dependency_overrides[get_k8s_service] = lambda: k8s

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, workspace, user_id, redis


@pytest.mark.asyncio
async def test_workspace_endpoints_happy_path(workspace_client):
    client, workspace, user_id, redis = workspace_client
    headers = {"Authorization": f"Bearer {_token(user_id)}"}
    redis.store[f"workspace:resource_usage:{workspace.id}"] = b'{"cpu_percent":12.5,"memory_mb":1024,"memory_limit_mb":4096}'

    r_create = await client.post("/api/v1/workspaces", headers=headers, json={"tier": "cpu-standard"})
    assert r_create.status_code == 202

    r_list = await client.get("/api/v1/workspaces", headers=headers)
    assert r_list.status_code == 200
    assert len(r_list.json()["items"]) == 1

    r_detail = await client.get(f"/api/v1/workspaces/{workspace.id}", headers=headers)
    assert r_detail.status_code == 200

    r_status = await client.get(f"/api/v1/workspaces/{workspace.id}/status", headers=headers)
    assert r_status.status_code == 200
    assert r_status.json()["status"] == "RUNNING"

    r_heartbeat = await client.post(f"/api/v1/workspaces/{workspace.id}/heartbeat", headers=headers)
    assert r_heartbeat.status_code == 200
    assert r_heartbeat.json()["workspace_id"] == workspace.id

    r_stop = await client.post(f"/api/v1/workspaces/{workspace.id}/stop", headers=headers, json={"save_notebooks": True})
    assert r_stop.status_code == 202

    r_restart = await client.post(f"/api/v1/workspaces/{workspace.id}/restart", headers=headers)
    assert r_restart.status_code == 200

    r_delete = await client.delete(f"/api/v1/workspaces/{workspace.id}", headers=headers)
    assert r_delete.status_code == 202


@pytest.mark.asyncio
async def test_quota_exceeded_returns_429(workspace_client, monkeypatch: pytest.MonkeyPatch):
    client, _, user_id, _ = workspace_client
    headers = {"Authorization": f"Bearer {_token(user_id)}"}
    async def _raise_quota(*_a, **_k):
        raise QuotaExceededError(current=2, max=2)

    monkeypatch.setattr(WorkspaceService, "create_workspace", staticmethod(_raise_quota))
    response = await client.post("/api/v1/workspaces", headers=headers, json={"tier": "cpu-standard"})
    assert response.status_code == 429


@pytest.mark.asyncio
async def test_wrong_owner_returns_403(workspace_client, monkeypatch: pytest.MonkeyPatch):
    client, workspace, user_id, _ = workspace_client
    headers = {"Authorization": f"Bearer {_token(user_id)}"}
    async def _raise_owned(*_a, **_k):
        raise WorkspaceNotOwnedError(workspace.id, user_id)

    monkeypatch.setattr(WorkspaceService, "get_workspace_detail", staticmethod(_raise_owned))
    response = await client.get(f"/api/v1/workspaces/{workspace.id}", headers=headers)
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_workspace_not_found_returns_404(workspace_client, monkeypatch: pytest.MonkeyPatch):
    client, _, user_id, _ = workspace_client
    headers = {"Authorization": f"Bearer {_token(user_id)}"}
    async def _raise_missing(*_a, **_k):
        raise WorkspaceNotFoundError("ws_missing")

    monkeypatch.setattr(WorkspaceService, "get_workspace_detail", staticmethod(_raise_missing))
    response = await client.get("/api/v1/workspaces/ws_missing", headers=headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_stop_workspace_not_running_returns_409(workspace_client, monkeypatch: pytest.MonkeyPatch):
    client, workspace, user_id, _ = workspace_client
    headers = {"Authorization": f"Bearer {_token(user_id)}"}
    async def _raise_not_running(*_a, **_k):
        raise WorkspaceNotRunningError(workspace_id=workspace.id, current_status="STOPPED")

    monkeypatch.setattr(WorkspaceService, "stop_workspace", staticmethod(_raise_not_running))
    response = await client.post(f"/api/v1/workspaces/{workspace.id}/stop", headers=headers, json={"save_notebooks": True})
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_heartbeat_extends_auto_kill_at(workspace_client):
    client, workspace, user_id, _ = workspace_client
    headers = {"Authorization": f"Bearer {_token(user_id)}"}
    before = datetime.now(timezone.utc)
    response = await client.post(f"/api/v1/workspaces/{workspace.id}/heartbeat", headers=headers)
    assert response.status_code == 200
    next_kill_at = datetime.fromisoformat(response.json()["next_kill_at"].replace("Z", "+00:00"))
    assert next_kill_at > before
