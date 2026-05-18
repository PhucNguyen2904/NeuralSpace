"""Test configuration and fixtures."""

import pytest
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.services.storage_service import StorageService


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def db_session():
    """Create in-memory test database session."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        yield session

    await engine.dispose()


@pytest.fixture
def storage_service(tmp_path):
    """Create storage service with temp path."""
    import os
    os.environ["STORAGE_BASE_PATH"] = str(tmp_path / "models")
    os.environ["TEMP_DOWNLOAD_PATH"] = str(tmp_path / "temp")

    svc = StorageService()
    svc.base_path.mkdir(parents=True, exist_ok=True)
    svc.temp_path.mkdir(parents=True, exist_ok=True)

    return svc
