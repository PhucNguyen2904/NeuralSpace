"""Security tests for the Google Colab claim-code flow."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.api.v1.colab.router import _owned_run, create_colab_claim
from app.config import Settings
from app.core.security import create_access_token
from app.dependencies import UserContext
from app.main import create_app
from app.models.runtime_session import RuntimeSessionStatus
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
