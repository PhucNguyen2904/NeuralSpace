"""ORM model for Download Tasks."""

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, BigInteger, JSON, Index, SmallInteger, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator, VARCHAR
import enum

from app.db.base import Base, TimestampMixin


class TaskStatus(str, enum.Enum):
    """Enum for task status."""
    PENDING = "PENDING"
    DOWNLOADING = "DOWNLOADING"
    VERIFYING = "VERIFYING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    RETRYING = "RETRYING"
    CANCELLED = "CANCELLED"


class SourceType(str, enum.Enum):
    """Enum for source types."""
    HUGGINGFACE = "huggingface"
    GITHUB_RELEASE = "github_release"
    DIRECT_URL = "direct_url"


class DownloadTask(Base, TimestampMixin):
    """ORM model for download_tasks table."""
    __tablename__ = "download_tasks"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    model_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("models.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[TaskStatus] = mapped_column(
        VARCHAR,
        default=TaskStatus.PENDING,
        nullable=False,
    )
    source_type: Mapped[SourceType] = mapped_column(VARCHAR, nullable=False)
    source_identifier: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    priority: Mapped[int] = mapped_column(SmallInteger, default=1, nullable=False)
    progress_pct: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    downloaded_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    total_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    current_file: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    temp_file_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)
    max_retries: Mapped[int] = mapped_column(SmallInteger, default=3, nullable=False)
    celery_task_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    request_metadata: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    __table_args__ = (
        Index("idx_download_tasks_status_priority",
              "status", "priority", "created_at"),
        Index("idx_download_tasks_status_created",
              "status", "created_at"),
        Index("idx_download_tasks_celery_task_id",
              "celery_task_id"),
    )

    def is_retryable(self) -> bool:
        """Check if task can be retried."""
        return (
            self.status == TaskStatus.FAILED
            and self.retry_count < self.max_retries
        )
