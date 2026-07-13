"""SyncJob ORM model — tracks async background sync/DVC operations."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SyncJob(Base):
    """
    Background sync job — rclone sync, DVC push/pull, upload, download.

    Status machine: pending → running → (completed | failed | cancelled)
    """

    __tablename__ = "sync_jobs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    connection_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("storage_connections.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── Job Definition ───────────────────────────────────────────────────
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)
    """
    'dvc_push' | 'dvc_pull' | 'dvc_fetch' | 'dvc_gc'
    | 'rclone_sync' | 'rclone_copy' | 'upload' | 'download'
    """

    source_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    dest_path: Mapped[str | None] = mapped_column(Text, nullable=True)

    params: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    """Extra params: {"targets": [...], "jobs": 4, "all_branches": false}"""

    # ── Execution ────────────────────────────────────────────────────────
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending", server_default="pending"
    )
    """'pending' | 'running' | 'completed' | 'failed' | 'cancelled'"""

    priority: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=5, server_default="5"
    )
    """1 (highest) → 10 (lowest)"""

    task_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    """ARQ / Celery task ID để track và cancel"""

    # ── Progress ─────────────────────────────────────────────────────────
    progress_pct: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    bytes_transferred: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    files_transferred: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ── Timing ───────────────────────────────────────────────────────────
    scheduled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Result ───────────────────────────────────────────────────────────
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    """{"files": 42, "bytes": 102400, "skipped": 3, "errors": []}"""

    # ── Retry ────────────────────────────────────────────────────────────
    retry_count: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0"
    )
    max_retries: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=3, server_default="3"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
