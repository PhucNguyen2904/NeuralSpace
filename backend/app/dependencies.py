"""FastAPI dependency injection configuration."""

from dataclasses import dataclass
from typing import AsyncGenerator

import redis.asyncio as redis
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.core.logging import get_logger
from app.core.security import verify_jwt

logger = get_logger(__name__)

_db_engine = None
_redis_pool = None
_async_session_maker = None


@dataclass
class UserContext:
    """User context extracted from JWT."""

    user_id: str
    email: str
    roles: list[str]
    exp: int | None = None


async def init_db() -> None:
    global _db_engine, _async_session_maker
    settings = get_settings()
    _db_engine = create_async_engine(
        settings.DATABASE_URL,
        echo=settings.ENVIRONMENT == "development",
        pool_size=20,
        max_overflow=0,
    )
    _async_session_maker = async_sessionmaker(_db_engine, class_=AsyncSession, expire_on_commit=False)


async def init_redis() -> None:
    global _redis_pool
    settings = get_settings()
    _redis_pool = redis.ConnectionPool.from_url(settings.REDIS_URL)


async def close_db() -> None:
    global _db_engine
    if _db_engine:
        await _db_engine.dispose()


async def close_redis() -> None:
    global _redis_pool
    if _redis_pool:
        await _redis_pool.disconnect()


def get_db_engine():
    """Return initialized async engine for cross-cutting integrations."""
    return _db_engine


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    if _async_session_maker is None:
        raise RuntimeError("Database not initialized. Call init_db() on startup.")
    async with _async_session_maker() as session:
        yield session


async def get_redis() -> redis.Redis:
    if _redis_pool is None:
        raise RuntimeError("Redis not initialized. Call init_redis() on startup.")
    return redis.Redis(connection_pool=_redis_pool)


def get_redis_client() -> redis.Redis:
    if _redis_pool is None:
        raise RuntimeError("Redis not initialized. Call init_redis() on startup.")
    return redis.Redis(connection_pool=_redis_pool)


async def get_current_user(request: Request, authorization: str = Depends(lambda: None)) -> UserContext:
    state_user = getattr(request.state, "user", None)
    if state_user is not None:
        return UserContext(
            user_id=state_user.user_id,
            email=state_user.email,
            roles=state_user.roles,
            exp=getattr(state_user, "exp", None),
        )

    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization scheme")

    payload = verify_jwt(token)
    return UserContext(
        user_id=payload.user_id,
        email=payload.email,
        roles=payload.roles,
        exp=payload.exp,
    )


def require_role(required_role: str):
    async def check_role(user: UserContext = Depends(get_current_user)) -> UserContext:
        if required_role not in user.roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User does not have required role: {required_role}",
            )
        return user

    return check_role
