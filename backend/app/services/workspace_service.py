"""Business logic layer for workspace operations."""

from __future__ import annotations

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    InvalidWorkspaceAssetsError,
    WorkspaceNotFoundError,
    WorkspaceNotOwnedError,
)
from app.core.logging import get_logger
from app.models.dataset import Dataset
from app.models.model_registry import ModelRegistry
from app.models.workspace import Workspace, WorkspaceStatus
from app.repositories.workspace_repository import WorkspaceRepository
from app.schemas.workspace import (
    WorkspaceAssetsUpdateRequest,
    WorkspaceCreateRequest,
    WorkspaceStatusPollResponse,
    WorkspaceStatusResponse,
)

logger = get_logger(__name__)


class WorkspaceService:
    """Workspace business logic."""

    @staticmethod
    async def _validate_assets(
        db: AsyncSession,
        user_id: str,
        dataset_ids_input: list[str],
        model_ids_input: list[str],
    ) -> tuple[list[str], list[str]]:
        dataset_ids = set(dataset_ids_input)
        model_ids = set(model_ids_input)
        found_dataset_ids = (
            set(
                (
                    await db.execute(
                        select(Dataset.id).where(Dataset.id.in_(dataset_ids))
                    )
                ).scalars().all()
            )
            if dataset_ids
            else set()
        )
        found_model_ids = (
            set(
                (
                    await db.execute(
                        select(ModelRegistry.id).where(ModelRegistry.id.in_(model_ids))
                    )
                ).scalars().all()
            )
            if model_ids
            else set()
        )
        missing_dataset_ids = sorted(dataset_ids - found_dataset_ids)
        missing_model_ids = sorted(model_ids - found_model_ids)
        if missing_dataset_ids or missing_model_ids:
            raise InvalidWorkspaceAssetsError(missing_dataset_ids, missing_model_ids)

        return list(dict.fromkeys(dataset_ids_input)), list(dict.fromkeys(model_ids_input))

    @staticmethod
    async def create_workspace(
        db: AsyncSession,
        redis: Redis,
        user_id: str,
        request: WorkspaceCreateRequest,
    ) -> Workspace:
        request.dataset_ids, request.model_ids = await WorkspaceService._validate_assets(
            db,
            user_id,
            request.dataset_ids,
            request.model_ids,
        )
        workspace = await WorkspaceRepository.create(db=db, user_id=user_id, data=request)
        workspace.status = WorkspaceStatus.READY
        await db.commit()
        await db.refresh(workspace)
        return workspace

    @staticmethod
    async def update_workspace_assets(
        db: AsyncSession,
        redis: Redis,
        workspace_id: str,
        user_id: str,
        request: WorkspaceAssetsUpdateRequest,
    ) -> Workspace:
        workspace = await WorkspaceService._get_owned_workspace(db, workspace_id, user_id)
        dataset_ids, model_ids = await WorkspaceService._validate_assets(
            db,
            user_id,
            request.dataset_ids,
            request.model_ids,
        )
        workspace = await WorkspaceRepository.replace_assets(db, workspace, user_id, dataset_ids, model_ids)
        await WorkspaceRepository.add_event(
            db,
            workspace_id=workspace.id,
            event_type="assets.updated",
            actor=user_id,
            details={"dataset_ids": dataset_ids, "model_ids": model_ids},
        )
        await db.commit()
        await db.refresh(workspace)
        return workspace

    @staticmethod
    async def get_workspace_status(
        db: AsyncSession,
        redis: Redis,
        workspace_id: str,
        user_id: str,
    ) -> WorkspaceStatusResponse:
        workspace = await WorkspaceService._get_owned_workspace(db, workspace_id, user_id)
        return WorkspaceStatusResponse(
            workspace_id=workspace.id,
            status=workspace.status,
            access_url=workspace.access_url,
            started_at=workspace.started_at,
            stopped_at=workspace.stopped_at,
            last_heartbeat=workspace.last_heartbeat,
            auto_kill_at=workspace.auto_kill_at,
        )

    @staticmethod
    async def get_workspace_status_poll(
        db: AsyncSession,
        redis: Redis,
        workspace_id: str,
        user_id: str,
    ) -> WorkspaceStatusPollResponse:
        workspace = await WorkspaceService._get_owned_workspace(db, workspace_id, user_id)
        return WorkspaceStatusPollResponse(
            workspace_id=workspace.id,
            status=workspace.status,
            access_url=workspace.access_url,
            created_at=workspace.created_at,
            idle_since=workspace.last_kernel_activity,
            auto_kill_at=workspace.auto_kill_at,
            resource_usage={},
        )

    @staticmethod
    async def delete_workspace(db: AsyncSession, workspace_id: str, user_id: str) -> None:
        workspace = await WorkspaceService._get_owned_workspace(db, workspace_id, user_id)
        await db.delete(workspace)
        await db.commit()

    @staticmethod
    async def get_workspace_detail(db: AsyncSession, redis: Redis, workspace_id: str, user_id: str) -> Workspace:
        return await WorkspaceService._get_owned_workspace(db, workspace_id, user_id)

    @staticmethod
    async def list_workspaces(
        db: AsyncSession,
        redis: Redis,
        user_id: str,
        status_filter: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Workspace], int]:
        items = await WorkspaceRepository.list_by_user(db, user_id, status_filter=status_filter, limit=limit, offset=offset)
        total = len(items) if offset == 0 else offset + len(items)
        return items, total

    @staticmethod
    async def _get_owned_workspace(db: AsyncSession, workspace_id: str, user_id: str) -> Workspace:
        workspace = await WorkspaceRepository.get_by_id(db, workspace_id)
        if workspace is None:
            raise WorkspaceNotFoundError(workspace_id=workspace_id)
        if not workspace.is_owned_by(user_id):
            raise WorkspaceNotOwnedError(workspace_id=workspace_id, user_id=user_id)
        return workspace
