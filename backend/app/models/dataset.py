"""Dataset ORM model."""

from __future__ import annotations

from sqlalchemy import BigInteger, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Dataset(TimestampMixin, Base):
    """Dataset metadata synced from upstream."""

    __tablename__ = "datasets"
    __table_args__ = (
        Index("ix_datasets_type_status", "dataset_type", "status"),
        Index("ix_datasets_name_trgm", "name"),
    )

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    dataset_type: Mapped[str] = mapped_column(String(30), nullable=False, server_default="generic")
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default="ready")
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    item_count: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    label_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
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

    workspaces: Mapped[list["WorkspaceDataset"]] = relationship(
        "WorkspaceDataset",
        back_populates="dataset",
        cascade="all, delete-orphan",
    )

