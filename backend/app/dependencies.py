"""Dependency injection providers."""

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
import redis

from app.db.session import SessionLocal
from app.config import settings
from app.services.storage_service import StorageService


async def get_db() -> AsyncSession:
    """Get database session for dependency injection."""
    async with SessionLocal() as session:
        yield session


def get_redis_client() -> redis.Redis:
    """Get Redis client for dependency injection."""
    return redis.from_url(settings.REDIS_URL)


def get_storage_service() -> StorageService:
    """Get storage service for dependency injection."""
    return StorageService()
