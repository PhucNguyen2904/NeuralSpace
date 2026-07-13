"""StorageAuditLog ORM model — immutable audit trail cho storage operations."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class StorageAuditLog(Base):
    """
    Immutable audit log cho mọi storage operation.

    Dùng cho: compliance, debugging, usage analytics.
    KHÔNG xóa records này — append-only.
    """

    __tablename__ = "storage_audit_logs"

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

    # ── Action ───────────────────────────────────────────────────────────
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    """
    'connect' | 'disconnect' | 'upload' | 'download' | 'delete'
    | 'mkdir' | 'sync_start' | 'sync_complete' | 'sync_failed'
    | 'credential_refresh' | 'credential_expired'
    | 'dvc_push' | 'dvc_pull' | 'dvc_fetch' | 'dvc_gc'
    | 'validate'
    """

    resource_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    """File/folder path liên quan đến action"""

    resource_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    """Kích thước bytes (cho upload/download)"""

    # ── Result ───────────────────────────────────────────────────────────
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="success", server_default="success"
    )
    """'success' | 'failure'"""

    error_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    """'AuthenticationFailed' | 'PermissionDenied' | 'StorageUnavailable' | ..."""

    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Context ──────────────────────────────────────────────────────────
    metadata_: Mapped[dict] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        default=dict,
        server_default="{}",
    )
    """
    Extra context: {
        "provider": "drive",
        "remote_name": "my-drive",
        "duration_ms": 342,
        "job_id": "...",
        "files_count": 5
    }
    """

    ip_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
