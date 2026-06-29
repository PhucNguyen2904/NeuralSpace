"""Storage OAuth API routes."""

import json
from datetime import timedelta
import urllib.parse
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.security import create_access_token, decrypt_credentials, encrypt_credentials, verify_token
from app.dependencies import get_current_user, UserContext, get_db
from app.models.storage_connection import StorageConnection
from app.services.storage_service import StorageService

router = APIRouter(tags=["storage-oauth"])

def get_storage_service(db: AsyncSession = Depends(get_db)) -> StorageService:
    return StorageService(db)

@router.get("/google/oauth/url")
async def get_google_oauth_url(
    display_name: str,
    client_id: str | None = None,
    client_secret: str | None = None,
    current_user: UserContext = Depends(get_current_user),
):
    """Generate Google OAuth authorization URL."""
    settings = get_settings()
    
    # State holds the user context and custom client secrets if provided
    state_payload = {
        "sub": str(current_user.user_id),
        "display_name": display_name,
        "client_id": client_id,
        "client_secret": client_secret,
    }
    state = create_access_token(state_payload, expires_delta=timedelta(minutes=15))
    
    # Use provided client_id or fallback to default
    used_client_id = client_id or settings.GOOGLE_CLIENT_ID
    if not used_client_id:
        raise HTTPException(status_code=400, detail="Google Client ID not configured")
        
    redirect_uri = settings.GOOGLE_REDIRECT_URI
    
    # Standard Google Drive OAuth scope
    scope = "https://www.googleapis.com/auth/drive"
    
    params = {
        "client_id": used_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope,
        "access_type": "offline",
        "prompt": "consent",
        "state": state
    }
    
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    return {"url": auth_url}

@router.get("/google/oauth/callback")
async def google_oauth_callback(
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
    service: StorageService = Depends(get_storage_service)
):
    """Handle Google OAuth callback and exchange code for tokens."""
    settings = get_settings()
    
    try:
        payload = verify_token(state)
        user_id = payload.get("sub")
        display_name = payload.get("display_name")
        custom_client_id = payload.get("client_id")
        custom_client_secret = payload.get("client_secret")
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid state parameter")
        
    if not user_id or not display_name:
        raise HTTPException(status_code=400, detail="Malformed state payload")

    used_client_id = custom_client_id or settings.GOOGLE_CLIENT_ID
    used_client_secret = custom_client_secret or settings.GOOGLE_CLIENT_SECRET
    
    # Exchange code for tokens
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "client_id": used_client_id,
        "client_secret": used_client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
    }
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(token_url, data=data)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Failed to exchange token: {resp.text}")
        token_data = resp.json()
        
    # The rclone format requires a JSON string containing the access_token, refresh_token, token_type, and expiry
    # Wait, Google returns 'expires_in' (seconds). We need an absolute expiry time for rclone usually,
    # but rclone can also handle it if we just pass the raw json and let it figure it out, or we can format it.
    from datetime import datetime, timezone
    import time
    expiry = datetime.fromtimestamp(time.time() + token_data.get("expires_in", 3600), timezone.utc).isoformat()
    
    rclone_token_json = {
        "access_token": token_data["access_token"],
        "token_type": token_data.get("token_type", "Bearer"),
        "refresh_token": token_data.get("refresh_token", ""),
        "expiry": expiry
    }
    
    encrypted_creds = encrypt_credentials(json.dumps(rclone_token_json))
    
    # Ensure config path
    config_path = service._get_user_config_path(user_id)
    import os
    os.makedirs(os.path.dirname(config_path), exist_ok=True)
    
    # Save to database
    from app.schemas.storage import StorageConnectRequest
    # We create a dummy params object for the service
    # Wait, we need to inject the token into rclone.conf via service.provider
    remote_name = f"gdrive_{uuid4().hex[:8]}"
    
    params = {
        "client_id": used_client_id or "",
        "client_secret": used_client_secret or "",
        "token": json.dumps(rclone_token_json)
    }
    
    connect_request = StorageConnectRequest(
        provider="gdrive",
        remote_name=remote_name,
        display_name=display_name,
        params=params
    )
    
    # We call the service to create the connection in DB and in rclone config
    connection = await service.connect(user_id, connect_request)
    
    # Now update the connection with encrypted credentials
    connection.encrypted_credentials = encrypted_creds
    connection.status = "connected"
    
    await db.commit()
    
    # Redirect to frontend settings page with storage tab active
    frontend_url = settings.FRONTEND_URL
    return RedirectResponse(url=f"{frontend_url}/settings#storage")
