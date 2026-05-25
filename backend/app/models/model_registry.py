"""Model registry ORM model."""

from __future__ import annotations

from sqlalchemy import BigInteger, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ModelRegistry(TimestampMixin, Base):
    """Model metadata synced from upstream."""

    __tablename__ = "models"
    __table_args__ = (
        Index("ix_models_framework_status", "framework", "status"),
        Index("ix_models_name", "name"),
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    architecture: Mapped[str | None] = mapped_column(String(120), nullable=True)
    framework: Mapped[str] = mapped_column(String(40), nullable=False, server_default="generic")
    task_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="ready")
    version: Mapped[str | None] = mapped_column(String(40), nullable=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    parameter_count: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    primary_metric_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    primary_metric_value: Mapped[float | None] = mapped_column(nullable=True)
    all_metrics: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    tags: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    storage_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_payload: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )

    workspaces: Mapped[list["WorkspaceModel"]] = relationship(
        "WorkspaceModel",
        back_populates="model",
        cascade="all, delete-orphan",
    )

