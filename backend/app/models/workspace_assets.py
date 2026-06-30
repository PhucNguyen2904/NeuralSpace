"""Workspace asset association models."""

from __future__ import annotations

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class WorkspaceDataset(TimestampMixin, Base):
    """Many-to-many between workspace and dataset."""

    __tablename__ = "workspace_datasets"
    __table_args__ = (
        Index("ix_workspace_datasets_workspace_id", "workspace_id"),
        Index("ix_workspace_datasets_dataset_id", "dataset_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(
        String(20),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    dataset_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("mlops.dataset_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    mount_path: Mapped[str] = mapped_column(String(255), nullable=False)
    mounted_by: Mapped[str | None] = mapped_column(String(64), nullable=True)

    workspace = relationship("Workspace")
    # Removed legacy back_populates


class WorkspaceModel(TimestampMixin, Base):
    """Many-to-many between workspace and model."""

    __tablename__ = "workspace_models"
    __table_args__ = (
        Index("ix_workspace_models_workspace_id", "workspace_id"),
        Index("ix_workspace_models_model_id", "model_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(
        String(20),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    model_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("mlops.model_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    mount_path: Mapped[str] = mapped_column(String(255), nullable=False)
    mounted_by: Mapped[str | None] = mapped_column(String(64), nullable=True)

    workspace = relationship("Workspace")
    # Removed legacy back_populates

