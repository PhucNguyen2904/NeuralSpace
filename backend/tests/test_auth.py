"""Authentication and rate-limit tests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from jose import jwt

from app.config import get_settings
from app.core.security import create_ws_token, verify_ws_token
from app.dependencies import get_redis_client
from app.main import create_app


class FakeRedis:
    def __init__(self) -> None:
        self._store: dict[str, str] = {}
        self._expires_at: dict[str, int] = {}
        self._now = 0
        self._counters: dict[str, int] = {}

    def advance(self, seconds: int) -> None:
        self._now += seconds

    async def set(self, key: str, value: str, ex: int | None = None):
        self._store[key] = value
        if ex is not None:
            self._expires_at[key] = self._now + ex

    async def get(self, key: str):
        if key in self._expires_at and self._now >= self._expires_at[key]:
            self._store.pop(key, None)
            self._expires_at.pop(key, None)
            self._counters.pop(key, None)
            return None
        value = self._store.get(key)
        return value.encode() if value is not None else None

    async def delete(self, key: str):
        self._store.pop(key, None)
        self._expires_at.pop(key, None)
        self._counters.pop(key, None)

    async def incr(self, key: str):
        await self.get(key)
        count = self._counters.get(key, 0) + 1
        self._counters[key] = count
        self._store[key] = str(count)
        return count

    async def expire(self, key: str, seconds: int):
        self._expires_at[key] = self._now + seconds

    async def ttl(self, key: str):
        if key not in self._expires_at:
            return -1
        remaining = self._expires_at[key] - self._now
        return remaining if remaining >= 0 else -2


def _create_jwt(sub: str = "user-1", exp_delta: int = 300, secret: str | None = None) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(seconds=exp_delta)
    payload = {"sub": sub, "email": "user@example.com", "roles": ["user"], "exp": expire}
    return jwt.encode(payload, secret or settings.SECRET_KEY, algorithm=settings.ALGORITHM)


@pytest.fixture
def fake_redis() -> FakeRedis:
    return FakeRedis()


@pytest.fixture
async def auth_client(monkeypatch: pytest.MonkeyPatch, fake_redis: FakeRedis):
    app = create_app()

    monkeypatch.setattr("app.dependencies.get_redis_client", lambda: fake_redis)
    monkeypatch.setattr("app.middleware.rate_limit_middleware.get_redis_client", lambda: fake_redis)
    monkeypatch.setattr("app.core.security.get_redis_client", lambda: fake_redis, raising=False)
    app.dependency_overrides = {
        get_redis_client: lambda: fake_redis,
    }

    transport = ASGITransport(app=app, lifespan="off")
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
async def test_valid_jwt_passes(auth_client: AsyncClient):
    token = _create_jwt()
    response = await auth_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    body = response.json()
    assert body["user_id"] == "user-1"
    assert body["email"] == "user@example.com"


@pytest.mark.asyncio
async def test_expired_jwt_returns_401(auth_client: AsyncClient):
    token = _create_jwt(exp_delta=-10)
    response = await auth_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_invalid_signature_returns_401(auth_client: AsyncClient):
    token = _create_jwt(secret="wrong-secret")
    response = await auth_client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_missing_auth_header_returns_401(auth_client: AsyncClient):
    response = await auth_client.get("/api/v1/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_ws_token_is_one_time_use(fake_redis: FakeRedis, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.dependencies.get_redis_client", lambda: fake_redis)
    ws_token = await create_ws_token("ws_abcd1234", "user-1")

    first_use = await verify_ws_token("ws_abcd1234", ws_token, fake_redis)
    second_use = await verify_ws_token("ws_abcd1234", ws_token, fake_redis)
    assert first_use is True
    assert second_use is False


@pytest.mark.asyncio
async def test_ws_token_expires_after_300s(fake_redis: FakeRedis, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.dependencies.get_redis_client", lambda: fake_redis)
    ws_token = await create_ws_token("ws_abcd1234", "user-1")
    fake_redis.advance(301)
    valid = await verify_ws_token("ws_abcd1234", ws_token, fake_redis)
    assert valid is False


@pytest.mark.asyncio
async def test_rate_limit_triggers_429(auth_client: AsyncClient):
    token = _create_jwt()
    headers = {"Authorization": f"Bearer {token}"}
    last_response = None
    for _ in range(11):
        last_response = await auth_client.post("/api/v1/workspaces", headers=headers)
    assert last_response is not None
    assert last_response.status_code == 429
    assert "Retry-After" in last_response.headers
