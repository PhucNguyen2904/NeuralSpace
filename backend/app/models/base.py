"""Base ORM model definitions."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column


class Base(DeclarativeBase):
    """Base class for all ORM models."""


class TimestampMixin:
    """Reusable timestamp columns."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class UUIDPrimaryKeyMixin:
    """Reusable UUID primary key column."""

    @declared_attr
    def id(cls) -> Mapped[str]:
        return mapped_column(
            UUID(as_uuid=False),
            primary_key=True,
            default=lambda: str(uuid4()),
        )


class BaseModel(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Abstract base model with UUID id and timestamps."""

    __abstract__ = True
