"""Workspace ORM model."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from enum import Enum
from secrets import token_hex
from typing import Any

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class WorkspaceStatus(str, Enum):
    """Workspace lifecycle state."""

    PROVISIONING = "PROVISIONING"
    RUNNING = "RUNNING"
    STOPPING = "STOPPING"
    STOPPED = "STOPPED"
    ERROR = "ERROR"


class Workspace(TimestampMixin, Base):
    """Workspace model for allocated Jupyter environments."""

    __tablename__ = "workspaces"
    __table_args__ = (
        Index("ix_workspaces_user_id_status", "user_id", "status"),
        Index(
            "ix_workspaces_status_auto_kill_at_running",
            "status",
            "auto_kill_at",
            postgresql_where=text("status = 'RUNNING'"),
        ),
        Index("ix_workspaces_k8s_namespace_lookup", "k8s_namespace"),
    )

    id: Mapped[str] = mapped_column(String(20), primary_key=True, default=lambda: Workspace.generate_id())
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[WorkspaceStatus] = mapped_column(
        SQLEnum(WorkspaceStatus, name="workspace_status", create_constraint=False),
        nullable=False,
        default=WorkspaceStatus.PROVISIONING,
        server_default=WorkspaceStatus.PROVISIONING.value,
    )
    tier: Mapped[str] = mapped_column(String(30), nullable=False)
    k8s_namespace: Mapped[str | None] = mapped_column(String(63), nullable=True)
    k8s_pod_name: Mapped[str | None] = mapped_column(String(63), nullable=True)
    pod_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    access_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    jupyter_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dataset_ids: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    model_ids: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    environment_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    resource_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_heartbeat: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_kernel_activity: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    auto_kill_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    events: Mapped[list["WorkspaceEvent"]] = relationship(
        "WorkspaceEvent",
        back_populates="workspace",
        cascade="all, delete-orphan",
    )

    def is_owned_by(self, user_id: str) -> bool:
        """Check workspace ownership."""
        return self.user_id == user_id

    def is_running(self) -> bool:
        """Check whether workspace is running."""
        return self.status == WorkspaceStatus.RUNNING

    def time_until_kill(self) -> timedelta | None:
        """Return remaining time until auto-kill."""
        if self.auto_kill_at is None:
            return None
        return self.auto_kill_at - datetime.now(timezone.utc)

    @classmethod
    def generate_id(cls) -> str:
        """Generate workspace id as ws_<8 hex chars>."""
        return f"ws_{token_hex(4)}"
