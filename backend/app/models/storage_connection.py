"""Storage Connection ORM model."""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import Boolean

from app.models.base import Base


class StorageConnection(Base):
    """Connection to a remote storage provider via rclone."""

    __tablename__ = "storage_connections"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False) # e.g. gdrive, s3, dropbox
    remote_name: Mapped[str] = mapped_column(String(100), nullable=False) # e.g. my-gdrive
    config_path: Mapped[str] = mapped_column(Text, nullable=False) # path to rclone.conf
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    encrypted_credentials: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="connected", server_default="connected")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
