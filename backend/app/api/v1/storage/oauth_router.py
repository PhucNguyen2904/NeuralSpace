"""
OAuth2 Storage Router — Server-side headless OAuth2 flow.

Endpoints:
  POST /storage/oauth/init     → Khởi tạo flow, trả auth_url
  GET  /storage/oauth/callback → Provider redirect về đây sau khi user authorize
"""

from __future__ import annotations

import json
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, verify_token
from app.dependencies import UserContext, get_current_user, get_db
from app.schemas.storage import OAuthInitRequest, OAuthInitResponse, StorageConnectionResponse
from app.services.storage.auth.oauth2_strategy import OAUTH2_PROVIDER_CONFIGS, OAuth2AuthStrategy
from app.services.storage_service import StorageService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["storage-oauth"])


def get_storage_service(db: AsyncSession = Depends(get_db)) -> StorageService:
    return StorageService(db)


def _get_oauth_redirect_uri(request: Request, provider: str) -> str:
    """Build OAuth callback URL dựa trên request host."""
    from app.config import get_settings
    settings = get_settings()

    # Production: dùng BACKEND_URL từ config
    backend_url = settings.BACKEND_URL or str(request.base_url).rstrip("/")
    return f"{backend_url}/api/v1/storage/oauth/callback"


def _encode_state(
    user_id: str,
    provider: str,
    remote_name: str,
    display_name: str,
) -> str:
    """
    Encode state token dưới dạng signed JWT.
    Chứa thông tin cần thiết để hoàn tất connect trong callback.
    """
    payload = {
        "sub": user_id,
        "provider": provider,
        "remote_name": remote_name,
        "display_name": display_name,
        "nonce": secrets.token_hex(8),  # CSRF protection
        "type": "oauth_state",
    }
    # Hết hạn sau 10 phút
    return create_access_token(payload, expires_delta=timedelta(minutes=10))


def _decode_state(state: str) -> dict:
    """Decode và verify state JWT."""
    try:
        payload = verify_token(state)
        if payload.get("type") != "oauth_state":
            raise ValueError("Invalid state token type")
        return payload
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid OAuth state: {e}")


@router.post(
    "/oauth/init",
    response_model=OAuthInitResponse,
    summary="Khởi tạo OAuth2 flow",
    description="""
Bắt đầu OAuth2 Authorization Code Flow cho Google Drive, OneDrive, hoặc Dropbox.

Trả về `auth_url` — frontend redirect user đến URL này để authorize.
Sau khi user authorize, provider sẽ redirect về `/storage/oauth/callback`.
""",
)
async def oauth_init(
    request_body: OAuthInitRequest,
    request: Request,
    current_user: UserContext = Depends(get_current_user),
) -> OAuthInitResponse:
    """Khởi tạo OAuth2 Authorization Code Flow."""
    provider = request_body.provider.lower()

    if provider not in OAUTH2_PROVIDER_CONFIGS:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{provider}' không hỗ trợ OAuth2. "
                   f"Supported: {', '.join(OAUTH2_PROVIDER_CONFIGS.keys())}",
        )

    strategy = OAuth2AuthStrategy(provider)
    redirect_uri = _get_oauth_redirect_uri(request, provider)

    state = _encode_state(
        user_id=str(current_user.user_id),
        provider=provider,
        remote_name=request_body.remote_name,
        display_name=request_body.display_name,
    )

    auth_url = strategy.build_auth_url(state=state, redirect_uri=redirect_uri)

    logger.info(
        "OAuth2 flow initiated",
        user_id=current_user.user_id,
        provider=provider,
        remote_name=request_body.remote_name,
    )

    return OAuthInitResponse(
        state=state,
        auth_url=auth_url,
        provider=provider,
        expires_in=600,
    )


@router.get(
    "/oauth/callback",
    summary="OAuth2 callback",
    description="""
Endpoint này nhận authorization code từ OAuth2 provider sau khi user authorize.

Tự động:
1. Verify state token (CSRF protection)
2. Exchange code → access_token + refresh_token
3. Tạo StorageConnection trong DB
4. Redirect về frontend với kết quả
""",
    include_in_schema=True,
)
async def oauth_callback(
    request: Request,
    code: str = Query(None, description="Authorization code từ provider"),
    state: str = Query(None, description="State token để verify"),
    error: str = Query(None, description="Error từ provider nếu user từ chối"),
    error_description: str = Query(None),
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """OAuth2 callback endpoint — provider redirect về đây."""
    from app.config import get_settings
    settings = get_settings()
    frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
    storage_page = f"{frontend_url}/settings/storage"

    # User từ chối authorize
    if error:
        logger.warning(f"OAuth2 callback error: {error} — {error_description}")
        return RedirectResponse(
            url=f"{storage_page}?status=error&error={error}",
            status_code=302,
        )

    if not code or not state:
        return RedirectResponse(
            url=f"{storage_page}?status=error&error=missing_code_or_state",
            status_code=302,
        )

    # Decode state
    try:
        state_data = _decode_state(state)
    except HTTPException:
        return RedirectResponse(
            url=f"{storage_page}?status=error&error=invalid_state",
            status_code=302,
        )

    user_id = state_data["sub"]
    provider = state_data["provider"]
    remote_name = state_data["remote_name"]
    display_name = state_data["display_name"]

    # Exchange code → tokens
    redirect_uri = _get_oauth_redirect_uri(request, provider)
    strategy = OAuth2AuthStrategy(provider)

    try:
        credential = await strategy.authenticate({
            "code": code,
            "redirect_uri": redirect_uri,
        })
    except Exception as e:
        logger.error(f"OAuth2 token exchange failed: {e}", provider=provider)
        return RedirectResponse(
            url=f"{storage_page}?status=error&error=token_exchange_failed",
            status_code=302,
        )

    # Tạo StorageConnection
    try:
        service = StorageService(db)
        connection = await service.complete_oauth_connect(
            user_id=user_id,
            provider=provider,
            remote_name=remote_name,
            display_name=display_name,
            credential=credential,
            ip_address=request.client.host if request.client else None,
        )

        logger.info(
            "OAuth2 storage connected successfully",
            user_id=user_id,
            provider=provider,
            connection_id=connection.id,
        )

        return RedirectResponse(
            url=f"{storage_page}?status=connected&id={connection.id}&provider={provider}",
            status_code=302,
        )

    except HTTPException as e:
        logger.error(f"Failed to create storage connection: {e.detail}")
        return RedirectResponse(
            url=f"{storage_page}?status=error&error=connection_failed",
            status_code=302,
        )
    except Exception as e:
        logger.exception(f"Unexpected error in OAuth callback: {e}")
        return RedirectResponse(
            url=f"{storage_page}?status=error&error=internal_error",
            status_code=302,
        )
