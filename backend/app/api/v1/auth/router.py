"""Auth and identity endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.logging import audit_event, get_logger
from app.core.security import create_access_token, create_ws_token, hash_password, verify_password, verify_token
from app.dependencies import UserContext, get_current_user, get_db
from app.repositories.user_repository import UserRepository
from app.models.workspace import WorkspaceStatus
from app.repositories.workspace_repository import WorkspaceRepository
from app.schemas.auth import AuthTokenResponse, AuthUserResponse, LoginRequest, RegisterRequest
from app.schemas.workspace import WorkspaceTokenResponse

router = APIRouter(tags=["auth"])
logger = get_logger(__name__)


class MeResponse(BaseModel):
    user_id: str
    email: str
    roles: list[str]
    token_expires_at: datetime


class UpdateProfileRequest(BaseModel):
    full_name: str


class UpdateProfileResponse(BaseModel):
    full_name: str


def _auth_response(user_id: str, email: str, full_name: str | None = None, created_at: datetime | None = None) -> AuthTokenResponse:
    settings = get_settings()
    expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    refresh_expires_in = 7 * 24 * 60 * 60
    token = create_access_token(
        {
            "sub": user_id,
            "email": email,
            "roles": ["user"],
            "type": "access",
        }
    )
    return AuthTokenResponse(
        access_token=token,
        expires_in=expires_in,
        refresh_expires_in=refresh_expires_in,
        user=AuthUserResponse(
            user_id=user_id,
            email=email,
            full_name=full_name,
            roles=["user"],
            created_at=created_at,
        ),
    )


def _set_refresh_cookie(response: Response, refresh_token: str, max_age_seconds: int) -> None:
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=max_age_seconds,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/api/v1/auth",
    )


def _normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid email format")
    return normalized


@router.post("/auth/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)) -> AuthTokenResponse:
    email = _normalize_email(payload.email)
    existing = await UserRepository.get_by_email(db, email)
    if existing is not None:
        audit_event(logger, "auth.register_conflict", email=email)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    password_encoded = hash_password(payload.password)
    user = await UserRepository.create(
        db,
        email=email,
        password_hash=password_encoded,
        full_name=payload.name.strip(),
    )
    await db.commit()

    auth = _auth_response(
        user_id=user.id,
        email=user.email or email,
        full_name=user.full_name,
        created_at=user.created_at,
    )
    refresh_token = create_access_token(
        {"sub": user.id, "email": user.email or email, "roles": ["user"], "type": "refresh"},
        expires_delta=timedelta(seconds=auth.refresh_expires_in),
    )
    _set_refresh_cookie(response, refresh_token, auth.refresh_expires_in)
    audit_event(logger, "auth.register_success", user_id=user.id, email=user.email or email)
    return auth


@router.post("/auth/refresh", response_model=AuthTokenResponse)
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)) -> AuthTokenResponse:
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        audit_event(logger, "auth.refresh_missing_cookie")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")
    try:
        claims = verify_token(refresh_token)
    except Exception as exc:
        audit_event(logger, "auth.refresh_invalid")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc

    if claims.get("type") != "refresh":
        audit_event(logger, "auth.refresh_wrong_type")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token type")

    user_id = claims.get("sub")
    email = claims.get("email")
    if not user_id or not email:
        audit_event(logger, "auth.refresh_malformed")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed refresh token")

    user = await UserRepository.get_by_email(db, str(email))
    if user is None or user.id != user_id:
        audit_event(logger, "auth.refresh_user_not_found", user_id=user_id, email=str(email))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token user not found")

    auth = _auth_response(
        user_id=user.id,
        email=user.email or str(email),
        full_name=user.full_name,
        created_at=user.created_at,
    )
    next_refresh_token = create_access_token(
        {"sub": user.id, "email": user.email or str(email), "roles": ["user"], "type": "refresh"},
        expires_delta=timedelta(seconds=auth.refresh_expires_in),
    )
    _set_refresh_cookie(response, next_refresh_token, auth.refresh_expires_in)
    audit_event(logger, "auth.refresh_success", user_id=user.id, email=user.email or str(email))
    return auth


@router.post("/auth/login", response_model=AuthTokenResponse)
async def login(payload: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)) -> AuthTokenResponse:
    email = _normalize_email(payload.email)
    user = await UserRepository.get_by_email(db, email)
    if user is None or not verify_password(payload.password, user.password_hash):
        audit_event(logger, "auth.login_failed", email=email)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    auth = _auth_response(
        user_id=user.id,
        email=user.email or email,
        full_name=user.full_name,
        created_at=user.created_at,
    )
    refresh_token = create_access_token(
        {"sub": user.id, "email": user.email or email, "roles": ["user"], "type": "refresh"},
        expires_delta=timedelta(seconds=auth.refresh_expires_in),
    )
    _set_refresh_cookie(response, refresh_token, auth.refresh_expires_in)
    audit_event(logger, "auth.login_success", user_id=user.id, email=user.email or email)
    return auth


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


@router.patch("/auth/profile", response_model=UpdateProfileResponse)
async def update_profile(
    payload: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> UpdateProfileResponse:
    """Update the authenticated user's display name."""
    full_name = payload.full_name.strip()
    if len(full_name) < 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Name must be at least 2 characters")
    await UserRepository.update_full_name(db, current_user.user_id, full_name)
    await db.commit()
    audit_event(logger, "auth.profile_updated", user_id=current_user.user_id)
    return UpdateProfileResponse(full_name=full_name)


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
