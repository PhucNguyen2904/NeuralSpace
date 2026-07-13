"""Workspace API endpoints."""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from redis.asyncio import Redis
from starlette.requests import Request
from starlette.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    InvalidWorkspaceAssetsError,
    WorkspaceNotFoundError,
    WorkspaceNotOwnedError,
)
from app.core.logging import audit_event, get_logger
from app.dependencies import UserContext, get_current_user, get_db, get_redis
from app.schemas.workspace import (
    WorkspaceAssetsUpdateRequest,
    WorkspaceCreateAcceptedResponse,
    WorkspaceCreateRequest,
    WorkspaceDetailResponse,
    WorkspaceListResponse,
    WorkspaceStatusPollResponse,
)
from app.services.workspace_service import WorkspaceService
from app.services.notification_service import WORKSPACE_EVENTS_CHANNEL, NotificationService

router = APIRouter(prefix="/workspaces", tags=["workspaces"])
logger = get_logger(__name__)


def _translate_workspace_error(exc: Exception) -> HTTPException:
    if isinstance(exc, WorkspaceNotFoundError):
        return HTTPException(status_code=404, detail=exc.message)
    if isinstance(exc, WorkspaceNotOwnedError):
        return HTTPException(status_code=403, detail=exc.message)
    if isinstance(exc, InvalidWorkspaceAssetsError):
        return HTTPException(status_code=422, detail=exc.message)
    return HTTPException(status_code=500, detail="Internal workspace error")


@router.post("", response_model=WorkspaceCreateAcceptedResponse, status_code=status.HTTP_201_CREATED)
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
        )
        return WorkspaceCreateAcceptedResponse(
            workspace_id=workspace.id,
            status=workspace.status,
            estimated_ready_in_seconds=0,
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


@router.patch("/{id}/assets", response_model=WorkspaceDetailResponse)
async def update_workspace_assets(
    id: str,
    payload: WorkspaceAssetsUpdateRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: UserContext = Depends(get_current_user),
):
    try:
        workspace = await WorkspaceService.update_workspace_assets(db, redis, id, current_user.user_id, payload)
        audit_event(
            logger,
            "workspace.assets_updated",
            user_id=current_user.user_id,
            workspace_id=workspace.id,
            dataset_count=len(workspace.dataset_ids or []),
            model_count=len(workspace.model_ids or []),
        )
        return WorkspaceDetailResponse.model_validate(workspace)
    except Exception as exc:
        audit_event(
            logger,
            "workspace.assets_update_failed",
            user_id=current_user.user_id,
            workspace_id=id,
            error=str(exc),
        )
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


@router.get("/{id}/events")
async def stream_workspace_events(
    id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: UserContext = Depends(get_current_user),
):
    try:
        await WorkspaceService.get_workspace_detail(db, redis, id, current_user.user_id)
    except Exception as exc:
        raise _translate_workspace_error(exc) from exc

    channel = WORKSPACE_EVENTS_CHANNEL.format(workspace_id=id)

    async def event_stream():
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            yield ": connected\n\n"
            while not await request.is_disconnected():
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=15.0)
                if message is None:
                    yield ": keep-alive\n\n"
                    continue

                data = message.get("data")
                if isinstance(data, bytes):
                    data = data.decode("utf-8")
                try:
                    payload = json.loads(data)
                except (TypeError, ValueError):
                    payload = {"type": "UNKNOWN", "message": str(data)}
                yield f"data: {json.dumps(payload)}\n\n"
                await asyncio.sleep(0)
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/{id}", status_code=status.HTTP_202_ACCEPTED)
async def delete_workspace(
    id: str,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: UserContext = Depends(get_current_user),
):
    try:
        await WorkspaceService.delete_workspace(db, id, current_user.user_id)
        await NotificationService.notify_workspace_killed(redis, id)
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
