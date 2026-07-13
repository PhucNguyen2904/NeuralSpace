
"""Workspace event ORM model."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class WorkspaceEventType(str, Enum):
    """Workspace event type."""

    START_REQUESTED = "START_REQUESTED"
    RUNNING = "RUNNING"
    STOP_REQUESTED = "STOP_REQUESTED"
    STOPPED = "STOPPED"
    IDLE_KILL = "IDLE_KILL"
    RESTART = "RESTART"
    ERROR = "ERROR"
    HEARTBEAT_MISSED = "HEARTBEAT_MISSED"


class WorkspaceEvent(Base):
    """Audit events for workspace lifecycle and operations."""

    __tablename__ = "workspace_events"
    __table_args__ = (
        Index("ix_workspace_events_workspace_id_created_at_desc", "workspace_id", text("created_at DESC")),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(
        String(20),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    actor: Mapped[str] = mapped_column(String(50), nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="events")
