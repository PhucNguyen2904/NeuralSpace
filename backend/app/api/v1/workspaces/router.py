"""Workspace API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    QuotaExceededError,
    WorkspaceNotFoundError,
    WorkspaceNotOwnedError,
    WorkspaceNotRunningError,
)
from app.core.logging import audit_event, get_logger
from app.dependencies import (
    UserContext,
    get_current_user,
    get_db,
    get_k8s_service,
    get_redis,
)
from app.schemas.workspace import (
    HeartbeatResponse,
    WorkspaceCreateAcceptedResponse,
    WorkspaceCreateRequest,
    WorkspaceDetailResponse,
    WorkspaceListResponse,
    WorkspaceOperationResponse,
    WorkspaceStatusPollResponse,
    WorkspaceStopRequest,
)
from app.services.k8s_service import K8sService
from app.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces", tags=["workspaces"])
logger = get_logger(__name__)


def _translate_workspace_error(exc: Exception) -> HTTPException:
    if isinstance(exc, WorkspaceNotFoundError):
        return HTTPException(status_code=404, detail=exc.message)
    if isinstance(exc, WorkspaceNotOwnedError):
        return HTTPException(status_code=403, detail=exc.message)
    if isinstance(exc, QuotaExceededError):
        return HTTPException(status_code=429, detail=exc.message)
    if isinstance(exc, WorkspaceNotRunningError):
        return HTTPException(status_code=409, detail=exc.message)
    return HTTPException(status_code=500, detail="Internal workspace error")


@router.post("", response_model=WorkspaceCreateAcceptedResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_workspace(
    payload: WorkspaceCreateRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: UserContext = Depends(get_current_user),
):
    try:
        workspace = await WorkspaceService.create_workspace(db, redis, current_user.user_id, payload)
        audit_event(
            logger,
            "workspace.create",
            user_id=current_user.user_id,
            workspace_id=workspace.id,
            workspace_name=workspace.name,
            tier=workspace.tier,
        )
        return WorkspaceCreateAcceptedResponse(
            workspace_id=workspace.id,
            status=workspace.status,
            estimated_ready_in_seconds=30,
            poll_url=f"/api/v1/workspaces/{workspace.id}/status",
        )
    except Exception as exc:
        audit_event(
            logger,
            "workspace.create_failed",
            user_id=current_user.user_id,
            error=str(exc),
        )
        raise _translate_workspace_error(exc) from exc


@router.get("", response_model=WorkspaceListResponse)
async def list_workspaces(
    status_filter: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: UserContext = Depends(get_current_user),
):
    items, total = await WorkspaceService.list_workspaces(
        db=db,
        redis=redis,
        user_id=current_user.user_id,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )
    return WorkspaceListResponse(
        items=[WorkspaceDetailResponse.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{id}", response_model=WorkspaceDetailResponse)
async def get_workspace_detail(
    id: str,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: UserContext = Depends(get_current_user),
):
    try:
        workspace = await WorkspaceService.get_workspace_detail(db, redis, id, current_user.user_id)
        return WorkspaceDetailResponse.model_validate(workspace)
    except Exception as exc:
        raise _translate_workspace_error(exc) from exc


@router.get("/{id}/status", response_model=WorkspaceStatusPollResponse)
async def get_workspace_status(
    id: str,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: UserContext = Depends(get_current_user),
):
    try:
        return await WorkspaceService.get_workspace_status_poll(db, redis, id, current_user.user_id)
    except Exception as exc:
        raise _translate_workspace_error(exc) from exc


@router.post("/{id}/stop", response_model=WorkspaceOperationResponse, status_code=status.HTTP_202_ACCEPTED)
async def stop_workspace(
    id: str,
    payload: WorkspaceStopRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    k8s_service: K8sService = Depends(get_k8s_service),
    current_user: UserContext = Depends(get_current_user),
):
    try:
        workspace = await WorkspaceService.stop_workspace(
            db=db,
            redis=redis,
            k8s_service=k8s_service,
            workspace_id=id,
            user_id=current_user.user_id,
            save=payload.save_notebooks,
        )
        audit_event(
            logger,
            "workspace.stop",
            user_id=current_user.user_id,
            workspace_id=workspace.id,
            status=workspace.status,
            save_notebooks=payload.save_notebooks,
        )
        return WorkspaceOperationResponse(
            workspace_id=workspace.id,
            status=workspace.status,
            message="Stop requested",
        )
    except Exception as exc:
        audit_event(
            logger,
            "workspace.stop_failed",
            user_id=current_user.user_id,
            workspace_id=id,
            error=str(exc),
        )
        raise _translate_workspace_error(exc) from exc


@router.post("/{id}/restart", response_model=WorkspaceOperationResponse)
async def restart_workspace(
    id: str,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    k8s_service: K8sService = Depends(get_k8s_service),
    current_user: UserContext = Depends(get_current_user),
):
    try:
        workspace = await WorkspaceService.restart_workspace(
            db=db,
            redis=redis,
            k8s_service=k8s_service,
            workspace_id=id,
            user_id=current_user.user_id,
        )
        audit_event(
            logger,
            "workspace.restart",
            user_id=current_user.user_id,
            workspace_id=workspace.id,
            status=workspace.status,
        )
        return WorkspaceOperationResponse(workspace_id=workspace.id, status=workspace.status, message="Kernel restarted")
    except Exception as exc:
        audit_event(
            logger,
            "workspace.restart_failed",
            user_id=current_user.user_id,
            workspace_id=id,
            error=str(exc),
        )
        raise _translate_workspace_error(exc) from exc


@router.delete("/{id}", status_code=status.HTTP_202_ACCEPTED)
async def delete_workspace(
    id: str,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: UserContext = Depends(get_current_user),
):
    try:
        await WorkspaceService.delete_workspace(db, id, current_user.user_id)
        audit_event(
            logger,
            "workspace.delete",
            user_id=current_user.user_id,
            workspace_id=id,
        )
        return {"workspace_id": id, "message": "Workspace deletion scheduled"}
    except Exception as exc:
        audit_event(
            logger,
            "workspace.delete_failed",
            user_id=current_user.user_id,
            workspace_id=id,
            error=str(exc),
        )
        raise _translate_workspace_error(exc) from exc


@router.post("/{id}/heartbeat", response_model=HeartbeatResponse)
async def heartbeat_workspace(
    id: str,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: UserContext = Depends(get_current_user),
):
    try:
        result = await WorkspaceService.process_heartbeat(db, redis, id, current_user.user_id)
        audit_event(
            logger,
            "workspace.heartbeat",
            user_id=current_user.user_id,
            workspace_id=id,
            status=result.status,
        )
        return result
    except Exception as exc:
        audit_event(
            logger,
            "workspace.heartbeat_failed",
            user_id=current_user.user_id,
            workspace_id=id,
            error=str(exc),
        )
        raise _translate_workspace_error(exc) from exc
