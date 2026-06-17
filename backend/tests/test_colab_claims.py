"""Security tests for the Google Colab claim-code flow."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.api.v1.colab.router import (
    _append_runtime_asset,
    _dashboard_session_status,
    _owned_run,
    _runtime_run_status,
    _sync_runtime_output_models,
    create_colab_claim,
    exchange_colab_claim,
)
from app.config import Settings
from app.core.security import create_access_token
from app.dependencies import UserContext
from app.main import create_app
from app.models.runtime_session import RuntimeSessionStatus
from app.models.model_registry import ModelRegistry
from app.models.workspace_assets import WorkspaceModel
from app.schemas.colab import ColabAssetsResponse, ColabClaimExchangeRequest, RuntimeRunAssetRequest
from app.services.colab_claim_service import ColabClaimService
from app.services.runtime_session_service import RuntimeSessionService


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.expires: dict[str, int] = {}
        self.now = 0
        self.lock = asyncio.Lock()

    async def set(self, key: str, value: str, ex: int | None = None):
        self.store[key] = value
        if ex is not None:
            self.expires[key] = self.now + ex

    async def get(self, key: str):
        if key in self.expires and self.now >= self.expires[key]:
            await self.delete(key)
            return None
        value = self.store.get(key)
        return value.encode() if value is not None else None

    async def getdel(self, key: str):
        async with self.lock:
            value = await self.get(key)
            await self.delete(key)
            return value

    async def eval(
        self,
        _script: str,
        _numkeys: int,
        active_key: str,
        claim_key: str,
        prefix: str,
        value: str,
        claim_hash: str,
        expires_in: int,
    ):
        async with self.lock:
            previous_hash = await self.get(active_key)
            if previous_hash:
                await self.delete(f"{prefix}{previous_hash.decode('utf-8')}")
            await self.set(claim_key, value, ex=expires_in)
            await self.set(active_key, claim_hash, ex=expires_in)
            return 1

    async def delete(self, key: str):
        self.store.pop(key, None)
        self.expires.pop(key, None)

    def advance(self, seconds: int) -> None:
        self.now += seconds


async def _create_claim(redis: FakeRedis, session_id: str = "session-1") -> str:
    return await ColabClaimService.create(
        redis,
        session_id=session_id,
        workspace_id="ws_12345678",
        user_id="user-1",
        expires_in=120,
    )


@pytest.mark.asyncio
async def test_claim_is_one_time_and_only_hash_is_stored() -> None:
    redis = FakeRedis()
    code = await _create_claim(redis)

    assert code not in " ".join(redis.store.values())
    assert await ColabClaimService.consume(redis, code) is not None
    assert await ColabClaimService.consume(redis, code) is None


@pytest.mark.asyncio
async def test_expired_and_wrong_claims_are_rejected() -> None:
    redis = FakeRedis()
    code = await _create_claim(redis)
    redis.advance(121)

    assert await ColabClaimService.consume(redis, code) is None
    assert await ColabClaimService.consume(redis, "NS-WRNG-WRNG-WRNG") is None


@pytest.mark.asyncio
async def test_new_claim_invalidates_previous_workspace_claim() -> None:
    redis = FakeRedis()
    first = await _create_claim(redis, "session-1")
    second = await _create_claim(redis, "session-2")

    assert await ColabClaimService.consume(redis, first) is None
    assert (await ColabClaimService.consume(redis, second))["session_id"] == "session-2"


@pytest.mark.asyncio
async def test_concurrent_exchange_has_one_winner() -> None:
    redis = FakeRedis()
    code = await _create_claim(redis)

    results = await asyncio.gather(
        ColabClaimService.consume(redis, code),
        ColabClaimService.consume(redis, code),
    )
    assert sum(result is not None for result in results) == 1


@pytest.mark.asyncio
async def test_concurrent_claim_creation_leaves_one_active_claim() -> None:
    redis = FakeRedis()
    claims = await asyncio.gather(
        _create_claim(redis, "session-1"),
        _create_claim(redis, "session-2"),
    )

    results = await asyncio.gather(*(ColabClaimService.consume(redis, code) for code in claims))
    assert sum(result is not None for result in results) == 1


def test_notebook_url_is_public_clean_and_pinned() -> None:
    settings = Settings(
        COLAB_TEMPLATE_ORGANIZATION="neuralspace-ai",
        COLAB_TEMPLATE_REPOSITORY="colab-templates",
        COLAB_TEMPLATE_REF="v1.2.3",
        COLAB_TEMPLATE_NOTEBOOK_PATH="notebooks/bootstrap.ipynb",
    )
    url = settings.get_colab_notebook_url()

    assert url == "https://colab.research.google.com/github/neuralspace-ai/colab-templates/blob/v1.2.3/notebooks/bootstrap.ipynb"
    assert "?" not in url
    assert all(secret not in url for secret in ("token", "claim", "user", "workspace", "api_base_url"))


def test_production_rejects_unpinned_branch() -> None:
    with pytest.raises(ValueError):
        Settings(ENVIRONMENT="production", COLAB_TEMPLATE_REF="main")


def test_runtime_asset_helpers_store_colab_lineage() -> None:
    run = SimpleNamespace(tags_snapshot={"runtime_session_id": "session-1"})
    payload = RuntimeRunAssetRequest(asset_type="dataset", asset_id="dataset-1", role="training_dataset")

    assert _append_runtime_asset(run, "inputs", payload) == {
        "asset_type": "dataset",
        "asset_id": "dataset-1",
        "role": "training_dataset",
    }
    _append_runtime_asset(run, "inputs", payload)

    assert run.tags_snapshot["runtime_session_id"] == "session-1"
    assert run.tags_snapshot["colab_lineage"]["inputs"] == [
        {"asset_type": "dataset", "asset_id": "dataset-1", "role": "training_dataset"}
    ]


def test_runtime_run_status_maps_colab_helper_values() -> None:
    assert _runtime_run_status("success") == "FINISHED"
    assert _runtime_run_status("FAILED") == "FAILED"
    assert _runtime_run_status("unexpected") == "FAILED"


def test_dashboard_session_status_marks_stale_connected_session_disconnected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.api.v1.colab.router.get_settings", lambda: SimpleNamespace(COLAB_HEARTBEAT_STALE_SECONDS=90))
    now = datetime.now(timezone.utc)

    fresh = SimpleNamespace(
        status=RuntimeSessionStatus.CONNECTED,
        last_heartbeat_at=now - timedelta(seconds=30),
        connected_at=now - timedelta(minutes=5),
        expires_at=now + timedelta(hours=1),
    )
    stale = SimpleNamespace(
        status=RuntimeSessionStatus.CONNECTED,
        last_heartbeat_at=now - timedelta(seconds=120),
        connected_at=now - timedelta(minutes=5),
        expires_at=now + timedelta(hours=1),
    )
    expired = SimpleNamespace(
        status=RuntimeSessionStatus.CONNECTED,
        last_heartbeat_at=now,
        connected_at=now - timedelta(minutes=5),
        expires_at=now - timedelta(seconds=1),
    )

    assert _dashboard_session_status(fresh) == "CONNECTED"
    assert _dashboard_session_status(stale) == "DISCONNECTED"
    assert _dashboard_session_status(expired) == "EXPIRED"


@pytest.mark.asyncio
async def test_runtime_output_model_syncs_registry_metrics() -> None:
    class Result:
        def scalar_one_or_none(self):
            return None

    class FakeDB:
        def __init__(self):
            self.models = {}
            self.workspace_links = []

        async def get(self, model, key):
            if model is ModelRegistry:
                return self.models.get(key)
            return None

        async def execute(self, _statement):
            return Result()

        def add(self, row):
            if isinstance(row, ModelRegistry):
                self.models[row.id] = row
            elif isinstance(row, WorkspaceModel):
                self.workspace_links.append(row)

    db = FakeDB()
    run = SimpleNamespace(
        id="run-1",
        name="Colab run",
        status="FINISHED",
        metrics_snapshot={"accuracy": 0.92, "loss": 0.2, "debug": True},
        tags_snapshot={
            "colab_lineage": {
                "outputs": [{"asset_type": "model", "asset_id": "colab-output-run-1", "role": "fine_tuned_model"}]
            }
        },
    )
    identity = SimpleNamespace(
        user_id="user-1",
        session=SimpleNamespace(id="session-1", workspace_id="ws_12345678"),
    )

    await _sync_runtime_output_models(db, run, identity)

    row = db.models["colab-output-run-1"]
    assert row.primary_metric_name == "accuracy"
    assert row.primary_metric_value == 0.92
    assert row.all_metrics == {"accuracy": 0.92, "loss": 0.2}
    assert row.status == "trained"
    assert row.source_payload["last_colab_run_id"] == "run-1"
    assert row.source_payload["metrics"] == {"accuracy": 0.92, "loss": 0.2}
    assert row.source_payload["colab_runs"][0]["metrics"] == {"accuracy": 0.92, "loss": 0.2}
    assert db.workspace_links[0].model_id == "colab-output-run-1"


@pytest.mark.asyncio
async def test_user_cannot_create_claim_for_another_users_workspace(monkeypatch: pytest.MonkeyPatch) -> None:
    async def no_workspace(*_args, **_kwargs):
        return None

    monkeypatch.setattr("app.api.v1.colab.router.WorkspaceRepository.get_by_id_and_user", no_workspace)
    with pytest.raises(HTTPException) as exc:
        await create_colab_claim(
            "ws_other",
            db=object(),
            redis=FakeRedis(),
            current_user=UserContext(user_id="user-a", email="a@example.com", roles=["user"]),
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_exchange_colab_claim_returns_bootstrap(monkeypatch: pytest.MonkeyPatch) -> None:
    redis = FakeRedis()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    code = await ColabClaimService.create(
        redis,
        session_id="session-1",
        workspace_id="ws_12345678",
        user_id="user-1",
        expires_in=120,
    )

    async def get_workspace(_db, workspace_id, user_id):
        return SimpleNamespace(id=workspace_id, user_id=user_id)

    async def get_session(_db, session_id):
        return SimpleNamespace(
            id=session_id,
            workspace_id="ws_12345678",
            user_id="user-1",
            status=RuntimeSessionStatus.CREATED,
        )

    async def connect_session(_db, session_id, _user_id):
        return (
            SimpleNamespace(
                id=session_id,
                capabilities=["dataset:read"],
                expires_at=expires_at,
            ),
            "runtime-token",
        )

    async def notify_started(*_args, **_kwargs):
        return None

    async def assets_payload(*_args, **_kwargs):
        return ColabAssetsResponse()

    monkeypatch.setattr("app.api.v1.colab.router.WorkspaceRepository.get_by_id_and_user", get_workspace)
    monkeypatch.setattr(RuntimeSessionService, "get", get_session)
    monkeypatch.setattr(RuntimeSessionService, "connect", connect_session)
    monkeypatch.setattr("app.api.v1.colab.router.NotificationService.notify_workspace_started", notify_started)
    monkeypatch.setattr("app.api.v1.colab.router._workspace_assets_payload", assets_payload)

    response = await exchange_colab_claim(
        ColabClaimExchangeRequest(claim_code=code),
        request=SimpleNamespace(client=SimpleNamespace(host="127.0.0.1")),
        db=object(),
        redis=redis,
    )

    assert response.session_id == "session-1"
    assert response.runtime_token == "runtime-token"
    assert response.capabilities == ["dataset:read"]
    assert response.datasets == []
    assert response.models == []


@pytest.mark.asyncio
async def test_runtime_session_cannot_access_another_users_run() -> None:
    class Result:
        def scalar_one_or_none(self):
            return None

    class FakeDB:
        async def execute(self, _statement):
            return Result()

    with pytest.raises(HTTPException) as exc:
        identity = SimpleNamespace(
            user_id="user-a",
            session=SimpleNamespace(id="session-a", workspace_id="ws-a"),
        )
        await _owned_run(FakeDB(), "run-b", identity)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_runtime_token_cannot_call_web_api(monkeypatch: pytest.MonkeyPatch) -> None:
    class RateRedis:
        async def incr(self, _key): return 1
        async def expire(self, _key, _seconds): return True
        async def ttl(self, _key): return 60

    fake_redis = RateRedis()
    monkeypatch.setattr("app.middleware.rate_limit_middleware.get_redis_client", lambda: fake_redis)
    runtime_token = create_access_token(
        {"type": "external_runtime", "sub": "user-1", "session_id": "session-1", "jti": "jti-1"}
    )
    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {runtime_token}"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_revoked_session_rejects_runtime_token(monkeypatch: pytest.MonkeyPatch) -> None:
    token = create_access_token(
        {"type": "external_runtime", "sub": "user-1", "session_id": "session-1", "jti": "jti-1"}
    )
    session = SimpleNamespace(
        status=RuntimeSessionStatus.REVOKED,
        token_jti="jti-1",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )

    async def get_session(_db, _session_id):
        return session

    monkeypatch.setattr(RuntimeSessionService, "get", get_session)
    with pytest.raises(HTTPException) as exc:
        await RuntimeSessionService.authenticate(object(), token)
    assert exc.value.status_code == 401
