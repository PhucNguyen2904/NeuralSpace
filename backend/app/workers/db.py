"""Synchronous DB session utilities for Celery worker context."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def _sync_database_url() -> str:
    settings = get_settings()
    url = settings.DATABASE_URL
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
    if url.startswith("sqlite+aiosqlite://"):
        return url.replace("sqlite+aiosqlite://", "sqlite://", 1)
    return url


def get_sync_session_factory() -> sessionmaker[Session]:
    global _engine, _session_factory
    if _session_factory is None:
        _engine = create_engine(_sync_database_url(), future=True, pool_pre_ping=True)
        _session_factory = sessionmaker(bind=_engine, autoflush=False, autocommit=False, expire_on_commit=False)
    return _session_factory


@contextmanager
def get_db_session() -> Iterator[Session]:
    factory = get_sync_session_factory()
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
