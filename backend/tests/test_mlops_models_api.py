from __future__ import annotations

import importlib
from types import SimpleNamespace

import pytest
from httpx import AsyncClient

from app.main import create_app
from app.core.security import create_access_token
from app.dependencies import UserContext, get_current_user, get_db


class _DummySession:
    pass


async def _override_db():
    async for item in _dummy_db():
        yield item


def _override_current_user() -> UserContext:
    return UserContext(
        user_id="00000000-0000-0000-0000-000000000001",
        email="test@example.com",
        roles=["admin", "model_approver"],
    )


def _get_fake_redis():
    return _Redis()


def _fake_async_result(*_args, **_kwargs):
    return _Res()


@pytest.fixture()
async def api_client() -> AsyncClient:
    app = create_app()
    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_current_user
    token = create_access_token({"sub": "00000000-0000-0000-0000-000000000001", "email": "test@example.com", "roles": ["admin", "model_approver"]})
    async with AsyncClient(app=app, base_url="http://test") as client:
        client.headers.update({"Authorization": f"Bearer {token}"})
        yield client


async def _dummy_db():
    yield _DummySession()


class _Redis:
    async def incr(self, _key):
        return 1

    async def expire(self, _key, _ttl):
        return True


class _Res:
    status = "SUCCESS"
    result = {"dataset_version_id": "dv1"}

    def failed(self):
        return False


@pytest.mark.asyncio
async def test_models_and_tasks_happy_path(api_client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    model_router = importlib.import_module("app.api.v1.models.router")
    tasks_router = importlib.import_module("app.api.v1.tasks.router")
    rate_limit = importlib.import_module("app.middleware.rate_limit_middleware")

    class _Svc:
        def __init__(self, _db):
            pass

        async def list_models(self):
            return ["fraud-detector"]

        async def get_model_versions(self, _model_name):
            return [SimpleNamespace(id="mv1", mlflow_name="fraud-detector", mlflow_version=1, run_id="run1", stage="Staging", status="READY", created_by="u1", created_at="2026-01-01T00:00:00Z", updated_at="2026-01-01T00:00:00Z", metrics={}, tags={})]

        async def get_model_version(self, _model_name, _version):
            return SimpleNamespace(id="mv1", mlflow_name="fraud-detector", mlflow_version=1, run_id="run1", stage="Staging", status="READY", created_by="u1", created_at="2026-01-01T00:00:00Z", updated_at="2026-01-01T00:00:00Z", metrics={}, tags={})

        async def promote(self, **_kwargs):
            return "pending", "apr-1"

        async def rollback(self, **_kwargs):
            return 3, 2

        async def lineage(self, _row):
            return {"model_version": {"id": "mv1"}, "training_run": {"run_id": "run1"}, "dataset_versions": [{"version_id": "dv1", "link_type": "train"}]}

        async def audit(self, _row, **_kwargs):
            return [{"action": "promote"}]

        async def approval_action(self, **_kwargs):
            return "approved"

    monkeypatch.setattr(model_router, "ModelService", _Svc)
    monkeypatch.setattr(rate_limit, "get_redis_client", _get_fake_redis)
    monkeypatch.setattr(tasks_router, "AsyncResult", _fake_async_result)

    assert (await api_client.get("/api/v1/models/")).status_code == 200
    assert (await api_client.get("/api/v1/models/fraud-detector")).status_code == 200
    assert (await api_client.get("/api/v1/models/fraud-detector/versions")).status_code == 200
    assert (await api_client.get("/api/v1/models/fraud-detector/versions/1")).status_code == 200
    assert (await api_client.post("/api/v1/models/fraud-detector/versions/1/promote", json={"target_stage": "Production", "reason": "ok", "notify_team": True})).status_code == 202
    assert (await api_client.post("/api/v1/models/fraud-detector/versions/1/rollback", json={"reason": "rollback"})).status_code == 200
    assert (await api_client.get("/api/v1/models/fraud-detector/versions/1/lineage")).status_code == 200
    assert (await api_client.get("/api/v1/models/fraud-detector/versions/1/audit")).status_code == 200
    assert (await api_client.post("/api/v1/models/approval-requests/apr-1/approve", json={"note": "ok"})).status_code == 200
    assert (await api_client.post("/api/v1/models/approval-requests/apr-1/reject", json={"note": "no"})).status_code == 200

    assert (await api_client.get("/api/v1/tasks/task-1/status")).status_code == 200
