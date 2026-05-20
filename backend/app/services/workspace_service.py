"""Business logic layer for workspace operations."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.upstream_client import UpstreamClient
from app.config import get_settings
from app.core.exceptions import (
    QuotaExceededError,
    WorkspaceNotFoundError,
    WorkspaceNotOwnedError,
    WorkspaceNotRunningError,
)
from app.core.logging import get_logger
from app.models.workspace import Workspace, WorkspaceStatus
from app.models.workspace_event import WorkspaceEventType
from app.repositories.workspace_repository import WorkspaceRepository
from app.schemas.workspace import (
    HeartbeatResponse,
    WorkspaceCreateRequest,
    WorkspaceStatusPollResponse,
    WorkspaceStatusResponse,
)
from app.services.k8s_service import K8sService
from app.workers.tasks import spawn_workspace, stop_workspace_task

logger = get_logger(__name__)


class WorkspaceService:
    """Workspace business logic."""

    @staticmethod
    async def create_workspace(
        db: AsyncSession,
        redis: Redis,
        user_id: str,
        request: WorkspaceCreateRequest,
    ) -> Workspace:
        settings = get_settings()
        running_count = await WorkspaceRepository.count_running_by_user(db, user_id)
        if running_count >= settings.MAX_WORKSPACES_PER_USER:
            raise QuotaExceededError(current=running_count, max=settings.MAX_WORKSPACES_PER_USER)

        upstream_client = UpstreamClient()
        try:
            await upstream_client.validate_dataset_ids(request.dataset_ids, user_id)
            await upstream_client.validate_model_ids(request.model_ids, user_id)
        except Exception as exc:
            logger.warning("Upstream validation failed, continuing", user_id=user_id, error=str(exc))

        workspace = await WorkspaceRepository.create(db=db, user_id=user_id, data=request)
        workspace.status = WorkspaceStatus.PROVISIONING
        await WorkspaceRepository.add_event(
            db=db,
            workspace_id=workspace.id,
            event_type=WorkspaceEventType.START_REQUESTED.value,
            actor=f"user:{user_id}",
            details={"tier": request.tier},
        )
        await db.commit()
        spawn_workspace.delay(workspace.id)
        return workspace

    @staticmethod
    async def get_workspace_status(
        db: AsyncSession,
        redis: Redis,
        workspace_id: str,
        user_id: str,
    ) -> WorkspaceStatusResponse:
        workspace = await WorkspaceService._get_owned_workspace(db, workspace_id, user_id)
        resource_usage: dict[str, Any] = {}
        if workspace.status == WorkspaceStatus.RUNNING:
            usage_raw = await redis.get(f"workspace:resource_usage:{workspace.id}")
            if usage_raw:
                try:
                    import json

                    resource_usage = json.loads(usage_raw.decode())
                except Exception:
                    resource_usage = {}

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
        resource_usage: dict[str, Any] = {}
        if workspace.status == WorkspaceStatus.RUNNING:
            usage_raw = await redis.get(f"workspace:resource_usage:{workspace.id}")
            if usage_raw:
                import json

                resource_usage = json.loads(usage_raw.decode())

        return WorkspaceStatusPollResponse(
            workspace_id=workspace.id,
            status=workspace.status,
            access_url=workspace.access_url,
            created_at=workspace.created_at,
            idle_since=workspace.last_kernel_activity,
            auto_kill_at=workspace.auto_kill_at,
            resource_usage=resource_usage,
        )

    @staticmethod
    async def stop_workspace(
        db: AsyncSession,
        redis: Redis,
        k8s_service: K8sService,
        workspace_id: str,
        user_id: str,
        save: bool = True,
    ) -> Workspace:
        workspace = await WorkspaceService._get_owned_workspace(db, workspace_id, user_id)
        if workspace.status != WorkspaceStatus.RUNNING:
            raise WorkspaceNotRunningError(workspace_id=workspace.id, current_status=workspace.status.value)

        workspace = await WorkspaceRepository.update_status(db, workspace.id, WorkspaceStatus.STOPPING)
        await WorkspaceRepository.add_event(
            db=db,
            workspace_id=workspace.id,
            event_type=WorkspaceEventType.STOP_REQUESTED.value,
            actor=f"user:{user_id}",
            details={"save_notebooks": save},
        )
        await db.commit()
        stop_workspace_task.delay(workspace.id, save_notebooks=save)
        return workspace

    @staticmethod
    async def process_heartbeat(
        db: AsyncSession,
        redis: Redis,
        workspace_id: str,
        user_id: str,
    ) -> HeartbeatResponse:
        settings = get_settings()
        workspace = await WorkspaceService._get_owned_workspace(db, workspace_id, user_id)
        if workspace.status != WorkspaceStatus.RUNNING:
            raise WorkspaceNotRunningError(workspace_id=workspace.id, current_status=workspace.status.value)

        now = datetime.now(timezone.utc)
        next_kill = now + timedelta(seconds=settings.IDLE_TIMEOUT_SECONDS)
        workspace.last_heartbeat = now
        workspace.auto_kill_at = next_kill
        await db.flush()
        await db.commit()
        await redis.set(f"workspace:last_activity:{workspace.id}", now.isoformat(), ex=settings.IDLE_TIMEOUT_SECONDS)
        return HeartbeatResponse(workspace_id=workspace.id, next_kill_at=next_kill, message="Session extended")

    @staticmethod
    async def restart_workspace(
        db: AsyncSession,
        redis: Redis,
        k8s_service: K8sService,
        workspace_id: str,
        user_id: str,
    ) -> Workspace:
        workspace = await WorkspaceService._get_owned_workspace(db, workspace_id, user_id)
        if workspace.status != WorkspaceStatus.RUNNING:
            raise WorkspaceNotRunningError(workspace_id=workspace.id, current_status=workspace.status.value)
        if not workspace.pod_ip:
            raise WorkspaceNotRunningError(workspace_id=workspace.id, current_status=workspace.status.value)

        kernel_id = "default"
        await k8s_service.restart_kernel(workspace.pod_ip, kernel_id=kernel_id)
        await WorkspaceRepository.add_event(
            db=db,
            workspace_id=workspace.id,
            event_type=WorkspaceEventType.RESTART.value,
            actor=f"user:{user_id}",
            details={"kernel_id": kernel_id},
        )
        await db.commit()
        return workspace

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
