from __future__ import annotations

import importlib
from types import SimpleNamespace

import pytest
from httpx import AsyncClient

from app.main import create_app
from app.core.security import create_access_token
from app.dependencies import get_current_user, get_db, UserContext


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


def _noop_ensure_staging_file_exists(_path: str) -> None:
    return None


def _fake_dvc_client(**_kwargs):
    return object()


def _fake_track_delay(**_kwargs):
    return SimpleNamespace(id="task-1")


def _get_fake_redis():
    return _Redis()


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


@pytest.mark.asyncio
async def test_dataset_endpoints_happy_path(api_client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    dataset_router = importlib.import_module("app.api.v1.datasets.router")
    rate_limit = importlib.import_module("app.middleware.rate_limit_middleware")

    class _Svc:
        def __init__(self, _db):
            self.db = _db

        async def create_dataset(self, payload, user):
            return SimpleNamespace(
                id="ds1", name=payload.name, description=payload.description, type=payload.type,
                owner_id=user.user_id, team_id=payload.team_id, dvc_repo_url=payload.dvc_repo_url,
                storage_path=payload.storage_path, tags=payload.tags, status="active",
                created_at="2026-01-01T00:00:00Z", updated_at="2026-01-01T00:00:00Z",
            )

        async def list_datasets(self, **_kwargs):
            row = SimpleNamespace(
                id="ds1", name="dataset-a", description="d", type="tabular", owner_id="u1", team_id=None,
                dvc_repo_url=None, storage_path=None, tags=[], status="active",
                created_at="2026-01-01T00:00:00Z", updated_at="2026-01-01T00:00:00Z",
            )
            return [row], 1

        async def get_dataset(self, _dataset_id):
            return SimpleNamespace(
                id="ds1", name="dataset-a", description="d", type="tabular", owner_id="00000000-0000-0000-0000-000000000001", team_id=None,
                dvc_repo_url=None, storage_path="datasets/a", tags=[], status="active",
                created_at="2026-01-01T00:00:00Z", updated_at="2026-01-01T00:00:00Z",
            )

        async def update_dataset(self, dataset_id, payload, user):
            return await self.get_dataset(dataset_id)

        async def archive_dataset(self, dataset_id, user):
            row = await self.get_dataset(dataset_id)
            row.status = "archived"
            return row

        async def list_versions(self, _dataset_id):
            return [SimpleNamespace(id="v1", dataset_id="ds1", version="v1.0", dvc_md5="abc", dvc_commit="c1", storage_path="x.dvc", size_bytes=12, changelog="init", is_latest=True, status="validated", created_by="u1", created_at="2026-01-01T00:00:00Z")]

        async def get_version(self, _dataset_id, _version_id):
            return SimpleNamespace(id="v1", dataset_id="ds1", version="v1.0", dvc_md5="abc", dvc_commit="c1", storage_path="x.dvc", size_bytes=12, changelog="init", is_latest=True, status="validated", created_by="u1", created_at="2026-01-01T00:00:00Z")

        async def patch_version(self, dataset_id, version_id, payload):
            return await self.get_version(dataset_id, version_id)

        async def validate_integrity(self, version, dvc):
            return {"is_valid": True, "checked_at": "2026-01-01T00:00:00Z", "details": {"db_md5": "abc", "actual_md5": "abc"}}

        async def lineage(self, _version):
            return ([{"run_id": "r1"}], [{"model_version_id": "m1"}])

        async def pull_version(self, _version, _dvc, target):
            return {"workspace_path": target, "size_bytes": 12}

        async def diff_versions(self, _dataset_id, _a, _b, _dvc):
            return {"changed": True, "modified": 1}

    monkeypatch.setattr(dataset_router, "DatasetService", _Svc)
    monkeypatch.setattr(dataset_router, "ensure_staging_file_exists", _noop_ensure_staging_file_exists)
    monkeypatch.setattr(dataset_router, "DVCClient", _fake_dvc_client)
    monkeypatch.setattr(dataset_router.track_dataset_version_task, "delay", _fake_track_delay)
    monkeypatch.setattr(rate_limit, "get_redis_client", _get_fake_redis)

    r = await api_client.post("/api/v1/datasets/", json={"name": "d1", "type": "tabular", "tags": []})
    assert r.status_code == 201

    assert (await api_client.get("/api/v1/datasets/")).status_code == 200
    assert (await api_client.get("/api/v1/datasets/ds1")).status_code == 200
    assert (await api_client.patch("/api/v1/datasets/ds1", json={"description": "x"})).status_code == 200
    assert (await api_client.delete("/api/v1/datasets/ds1")).status_code == 200

    r = await api_client.post("/api/v1/datasets/ds1/versions", json={"local_path": "/tmp/x", "dataset_name": "datasets/x", "commit_message": "c"})
    assert r.status_code == 202

    assert (await api_client.get("/api/v1/datasets/ds1/versions")).status_code == 200
    assert (await api_client.get("/api/v1/datasets/ds1/versions/v1")).status_code == 200
    assert (await api_client.patch("/api/v1/datasets/ds1/versions/v1", json={"changelog": "x"})).status_code == 200
    assert (await api_client.post("/api/v1/datasets/ds1/versions/v1/validate")).status_code == 200
    assert (await api_client.get("/api/v1/datasets/ds1/versions/v1/lineage")).status_code == 200
    assert (await api_client.post("/api/v1/datasets/ds1/versions/v1/pull", json={"workspace_path": "/tmp/target"})).status_code == 200
    assert (await api_client.get("/api/v1/datasets/ds1/diff?version_a=v1.0&version_b=v1.1")).status_code == 200
