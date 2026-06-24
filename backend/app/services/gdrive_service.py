"""Google Drive token management for DVC."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models.storage_provider import StorageProvider

logger = logging.getLogger(__name__)

class GDriveTokenManager:
    def __init__(self, db: AsyncSession, settings: Settings):
        self.db = db
        self.settings = settings

    async def get_gdrive_provider(self, user_id: str) -> StorageProvider | None:
        stmt = select(StorageProvider).where(
            StorageProvider.type == "gdrive",
            (StorageProvider.created_by == user_id) | (StorageProvider.created_by.is_(None))
        ).order_by(StorageProvider.created_at.desc()).limit(1)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def write_credentials_file(self, repo_path: str, provider: StorageProvider) -> None:
        """Writes the PyDrive2 compatible credentials.json file for DVC."""
        creds_path = Path(repo_path) / ".dvc" / "gdrive_credentials.json"
        
        config = provider.config
        access_token = config.get("access_token")
        refresh_token = config.get("refresh_token")
        
        creds = {
            "access_token": access_token,
            "client_id": self.settings.GOOGLE_CLIENT_ID,
            "client_secret": self.settings.GOOGLE_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "token_expiry": "2030-01-01T00:00:00Z", # Dummy expiry to force use of access token or refresh
            "token_uri": "https://oauth2.googleapis.com/token",
            "user_agent": None,
            "revoke_uri": "https://oauth2.googleapis.com/revoke",
            "id_token": None,
            "id_token_jwt": None,
            "token_response": {
                "access_token": access_token,
                "expires_in": 3599,
                "refresh_token": refresh_token,
                "scope": "https://www.googleapis.com/auth/drive.file",
                "token_type": "Bearer"
            },
            "scopes": ["https://www.googleapis.com/auth/drive.file"]
        }
        
        # Write file atomically or just directly
        creds_path.parent.mkdir(parents=True, exist_ok=True)
        creds_path.write_text(json.dumps(creds), encoding="utf-8")

    async def refresh_token(self, provider: StorageProvider) -> bool:
        """Explicitly refresh the Google Drive token and update the DB."""
        refresh_token = provider.config.get("refresh_token")
        if not refresh_token:
            logger.error("No refresh token available for Google Drive Storage Provider")
            return False

        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "client_id": self.settings.GOOGLE_CLIENT_ID,
            "client_secret": self.settings.GOOGLE_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(token_url, data=data)
                response.raise_for_status()
                token_data = response.json()
            except Exception as e:
                logger.error(f"Failed to refresh Google Drive token: {e}")
                return False

        new_access_token = token_data.get("access_token")
        if new_access_token:
            new_config = dict(provider.config)
            new_config["access_token"] = new_access_token
            # Sometimes refresh_token is rotated
            if "refresh_token" in token_data:
                new_config["refresh_token"] = token_data["refresh_token"]
                
            provider.config = new_config
            
            # Use flag_modified if using JSONB to ensure SQLAlchemy detects it
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(provider, "config")
            
            self.db.add(provider)
            await self.db.commit()
            return True
            
        return False
