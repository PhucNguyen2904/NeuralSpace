"""ORM model for ML Models."""

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, BigInteger, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator, VARCHAR
import enum

from app.db.base import Base, TimestampMixin


class SourceType(str, enum.Enum):
    """Enum for model source types."""
    HUGGINGFACE = "huggingface"
    GITHUB_RELEASE = "github_release"
    DIRECT_URL = "direct_url"


class ModelStatus(str, enum.Enum):
    """Enum for model status."""
    READY = "ready"
    CORRUPT = "corrupt"
    DELETED = "deleted"


class MLModel(Base, TimestampMixin):
    """ORM model for ml_models table."""
    __tablename__ = "models"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_type: Mapped[SourceType] = mapped_column(
        VARCHAR,
        nullable=False,
    )
    source_identifier: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    storage_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True, unique=True)
    sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    model_metadata: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[ModelStatus] = mapped_column(
        VARCHAR,
        default=ModelStatus.READY,
        nullable=False,
    )
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        nullable=True,
    )

    __table_args__ = (
        Index("idx_models_status", "status"),
        Index("idx_models_tags", "tags"),
    )
