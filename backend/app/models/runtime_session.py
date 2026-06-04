"""External compute runtime session model."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class RuntimeSessionStatus(str, Enum):
    CREATED = "CREATED"
    CONNECTED = "CONNECTED"
    REVOKED = "REVOKED"
    EXPIRED = "EXPIRED"


class ExternalRuntimeSession(TimestampMixin, Base):
    """A scoped connection from an untrusted external runtime."""

    __tablename__ = "external_runtime_sessions"
    __table_args__ = (
        Index("ix_runtime_sessions_user_status", "user_id", "status"),
        Index("ix_runtime_sessions_workspace_created", "workspace_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()))
    workspace_id: Mapped[str] = mapped_column(
        String(20), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(30), nullable=False, server_default="google_colab")
    status: Mapped[RuntimeSessionStatus] = mapped_column(
        SQLEnum(RuntimeSessionStatus, name="runtime_session_status", create_constraint=False),
        nullable=False,
        default=RuntimeSessionStatus.CREATED,
        server_default=RuntimeSessionStatus.CREATED.value,
    )
    token_jti: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    capabilities: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoke_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
