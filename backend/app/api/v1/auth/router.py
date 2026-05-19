"""Auth and identity endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_ws_token
from app.dependencies import UserContext, get_current_user, get_db
from app.models.workspace import WorkspaceStatus
from app.repositories.workspace_repository import WorkspaceRepository
from app.schemas.workspace import WorkspaceTokenResponse

router = APIRouter(tags=["auth"])


class MeResponse(BaseModel):
    user_id: str
    email: str
    roles: list[str]
    token_expires_at: datetime


@router.get("/auth/me", response_model=MeResponse)
async def get_me(current_user: UserContext = Depends(get_current_user)) -> MeResponse:
    state_user = current_user
    exp = getattr(state_user, "exp", None)
    token_expires_at = datetime.fromtimestamp(exp, tz=timezone.utc) if exp else datetime.now(timezone.utc)
    return MeResponse(
        user_id=state_user.user_id,
        email=state_user.email,
        roles=state_user.roles,
        token_expires_at=token_expires_at,
    )


@router.get("/workspaces/{id}/token", response_model=WorkspaceTokenResponse)
async def get_workspace_ws_token(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> WorkspaceTokenResponse:
    workspace = await WorkspaceRepository.get_by_id_and_user(db, id, current_user.user_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    if workspace.status != WorkspaceStatus.RUNNING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Workspace is not running")

    ws_token = await create_ws_token(workspace_id=workspace.id, user_id=current_user.user_id)
    access_url = workspace.access_url or ""
    websocket_url = access_url.replace("https://", "wss://").replace("http://", "ws://")
    return WorkspaceTokenResponse(
        ws_token=ws_token,
        expires_in=300,
        websocket_url=websocket_url,
    )
