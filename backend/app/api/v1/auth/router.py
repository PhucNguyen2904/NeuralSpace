"""Auth and identity endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security import create_access_token, create_ws_token, hash_password, verify_password
from app.dependencies import UserContext, get_current_user, get_db
from app.repositories.user_repository import UserRepository
from app.models.workspace import WorkspaceStatus
from app.repositories.workspace_repository import WorkspaceRepository
from app.schemas.auth import AuthTokenResponse, AuthUserResponse, LoginRequest, RegisterRequest
from app.schemas.workspace import WorkspaceTokenResponse

router = APIRouter(tags=["auth"])


class MeResponse(BaseModel):
    user_id: str
    email: str
    roles: list[str]
    token_expires_at: datetime


def _auth_response(user_id: str, email: str, created_at: datetime | None = None) -> AuthTokenResponse:
    settings = get_settings()
    expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    token = create_access_token(
        {
            "sub": user_id,
            "email": email,
            "roles": ["user"],
        }
    )
    return AuthTokenResponse(
        access_token=token,
        expires_in=expires_in,
        user=AuthUserResponse(
            user_id=user_id,
            email=email,
            roles=["user"],
            created_at=created_at,
        ),
    )


def _normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid email format")
    return normalized


@router.post("/auth/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)) -> AuthTokenResponse:
    email = _normalize_email(payload.email)
    existing = await UserRepository.get_by_email(db, email)
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    password_encoded = hash_password(payload.password)
    user = await UserRepository.create(db, email=email, password_hash=password_encoded)
    await db.commit()

    return _auth_response(user_id=user.id, email=user.email or email, created_at=user.created_at)


@router.post("/auth/login", response_model=AuthTokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> AuthTokenResponse:
    email = _normalize_email(payload.email)
    user = await UserRepository.get_by_email(db, email)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return _auth_response(user_id=user.id, email=user.email or email, created_at=user.created_at)


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
