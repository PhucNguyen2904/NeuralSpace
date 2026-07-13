"""Storage Connection ORM model."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class StorageConnection(Base):
    """Connection to a remote storage provider via rclone."""

    __tablename__ = "storage_connections"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # ── Provider info ────────────────────────────────────────────────────
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    """rclone type: 'drive', 's3', 'onedrive', 'dropbox', 'minio', 'r2'"""

    remote_name: Mapped[str] = mapped_column(String(100), nullable=False)
    """Unique name for rclone remote section, e.g. 'my-gdrive'. UNIQUE per user."""

    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    """User-friendly name, e.g. 'Work Google Drive (user@gmail.com)'"""

    # ── Credential storage ───────────────────────────────────────────────
    encrypted_credentials: Mapped[str | None] = mapped_column(Text, nullable=True)
    """
    Fernet-encrypted JSON blob chứa toàn bộ credentials.
    Xem AuthCredential.to_encrypted_blob() / from_encrypted_blob().
    """

    credential_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    """
    'oauth2' | 'access_key' | 'service_account' | 'sas_token'
    Dùng để biết cách refresh/validate mà không cần decrypt toàn bộ.
    """

    credential_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    """
    Thời điểm hết hạn của credential (chỉ OAuth2 + SAS Token).
    NULL = không hết hạn (S3 key, service account).
    INDEX này được TokenManager dùng để query hiệu quả.
    """

    # ── Config file ──────────────────────────────────────────────────────
    config_path: Mapped[str] = mapped_column(Text, nullable=False)
    """
    Absolute path tới rclone.conf của user.
    Pattern: /storage-configs/{user_id}/rclone.conf
    File này là EPHEMERAL — có thể xóa và tái tạo từ encrypted_credentials.
    """

    # ── Status ───────────────────────────────────────────────────────────
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="connected", server_default="connected"
    )
    """'connected' | 'expired' | 'error' | 'disconnected' | 'pending_oauth'"""

    status_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    """Error message hoặc status detail."""

    is_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    """Chỉ 1 connection là default per user."""

    # ── Usage tracking ───────────────────────────────────────────────────
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_validated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    total_bytes_synced: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )

    # ── Timestamps ───────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
