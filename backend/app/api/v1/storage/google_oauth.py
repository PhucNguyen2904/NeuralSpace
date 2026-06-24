"""Google OAuth API router for Storage Providers."""

from __future__ import annotations

import logging
import urllib.parse
from typing import Dict, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.config import get_settings, Settings
from app.dependencies import UserContext, get_current_user, get_db
from app.models.storage_provider import StorageProvider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/google/oauth", tags=["google-oauth"])

@router.get("/login")
async def google_oauth_login(
    request: Request,
    settings: Settings = Depends(get_settings),
    current_user: UserContext = Depends(get_current_user),
) -> dict[str, str]:
    """Return Google OAuth consent screen URL."""
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_REDIRECT_URI:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google OAuth is not configured on the server."
        )

    # Use a state parameter to prevent CSRF. In a real app, this should be a signed token.
    # We pass the user_id in the state so we know who to assign the storage provider to.
    state = f"user:{current_user.user_id}"

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/drive.file",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }

    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    return {"url": url}

@router.get("/callback")
async def google_oauth_callback(
    code: str = Query(..., description="Authorization code from Google"),
    state: str = Query(None, description="State parameter from login"),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    error_redirect = f"{frontend_url}/settings#storage?error="

    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET or not settings.GOOGLE_REDIRECT_URI:
        return RedirectResponse(f"{error_redirect}not_configured")

    if not state or not state.startswith("user:"):
        return RedirectResponse(f"{error_redirect}invalid_state")

    user_id = state.split(":", 1)[1]

    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(token_url, data=data)
            response.raise_for_status()
            token_data = response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Google OAuth token exchange failed: {e.response.text}")
            return RedirectResponse(f"{error_redirect}token_exchange_failed")
        except Exception as e:
            logger.error(f"Google OAuth error: {str(e)}")
            return RedirectResponse(f"{error_redirect}authentication_failed")

    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")

    if not access_token:
        return RedirectResponse(f"{error_redirect}no_access_token")
    
    provider_name = "Google Drive"
    
    row = StorageProvider(
        name=provider_name,
        type="gdrive",
        config={
            "access_token": access_token,
            "refresh_token": refresh_token,
            "folder_id": "root", # Default folder
        },
        created_by=user_id,
        is_active=True,
    )
    db.add(row)
    
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        import uuid
        row.name = f"Google Drive ({uuid.uuid4().hex[:8]})"
        db.add(row)
        await db.commit()

    return RedirectResponse(f"{frontend_url}/settings#storage")
