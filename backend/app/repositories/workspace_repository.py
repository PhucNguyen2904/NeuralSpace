"""Repository layer for workspaces and workspace events."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workspace import Workspace, WorkspaceStatus
from app.models.workspace_event import WorkspaceEvent
from app.schemas.workspace import WorkspaceCreateRequest


class WorkspaceRepository:
    """Repository implementation for workspace persistence."""

    @staticmethod
    async def create(db: AsyncSession, user_id: str, data: WorkspaceCreateRequest) -> Workspace:
        workspace = Workspace(
            user_id=user_id,
            name=data.name,
            tier=data.tier,
            dataset_ids=data.dataset_ids,
            model_ids=data.model_ids,
            environment_config=data.environment.model_dump(),
        )
        db.add(workspace)
        await db.flush()
        await db.refresh(workspace)
        return workspace

    @staticmethod
    async def get_by_id(db: AsyncSession, workspace_id: str) -> Workspace | None:
        stmt = select(Workspace).where(Workspace.id == workspace_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_id_and_user(db: AsyncSession, workspace_id: str, user_id: str) -> Workspace | None:
        stmt = select(Workspace).where(Workspace.id == workspace_id, Workspace.user_id == user_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_by_user(
        db: AsyncSession,
        user_id: str,
        status_filter: WorkspaceStatus | str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[Workspace]:
        stmt: Select[tuple[Workspace]] = (
            select(Workspace)
            .where(Workspace.user_id == user_id)
            .order_by(Workspace.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if status_filter:
            stmt = stmt.where(Workspace.status == WorkspaceStatus(status_filter))
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def update_status(
        db: AsyncSession,
        workspace_id: str,
        status: WorkspaceStatus | str,
        **kwargs: Any,
    ) -> Workspace:
        workspace = await WorkspaceRepository.get_by_id(db, workspace_id)
        if workspace is None:
            raise ValueError(f"Workspace not found: {workspace_id}")

        workspace.status = WorkspaceStatus(status)
        for key, value in kwargs.items():
            if hasattr(workspace, key):
                setattr(workspace, key, value)
        await db.flush()
        await db.refresh(workspace)
        return workspace

    @staticmethod
    async def get_running_by_user(db: AsyncSession, user_id: str) -> list[Workspace]:
        stmt = (
            select(Workspace)
            .where(Workspace.user_id == user_id, Workspace.status == WorkspaceStatus.RUNNING)
            .order_by(Workspace.started_at.desc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def get_idle_workspaces(db: AsyncSession, before_datetime: datetime) -> list[Workspace]:
        stmt = (
            select(Workspace)
            .where(
                Workspace.status == WorkspaceStatus.RUNNING,
                Workspace.last_kernel_activity.is_not(None),
                Workspace.last_kernel_activity < before_datetime,
            )
            .order_by(Workspace.last_kernel_activity.asc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def count_running_by_user(db: AsyncSession, user_id: str) -> int:
        stmt = select(func.count(Workspace.id)).where(
            Workspace.user_id == user_id,
            Workspace.status == WorkspaceStatus.RUNNING,
        )
        result = await db.execute(stmt)
        return int(result.scalar_one())

    @staticmethod
    async def add_event(
        db: AsyncSession,
        workspace_id: str,
        event_type: str,
        actor: str,
        details: dict[str, Any] | None = None,
    ) -> WorkspaceEvent:
        event = WorkspaceEvent(
            workspace_id=workspace_id,
            event_type=event_type,
            actor=actor,
            details=details or {},
        )
        db.add(event)
        await db.flush()
        await db.refresh(event)
        return event
