"""Google Drive storage provider implementation."""

from __future__ import annotations
from typing import Any

from app.services.storage.base import BaseStorageProvider

class GoogleDriveProvider(BaseStorageProvider):
    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.folder_id = config.get("folder_id")
        self.access_token = config.get("access_token")
        self.refresh_token = config.get("refresh_token")

    async def _refresh_token(self):
        from app.config import get_settings
        import httpx
        settings = get_settings()
        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "refresh_token": self.refresh_token,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "grant_type": "refresh_token",
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(token_url, data=data)
            response.raise_for_status()
            token_data = response.json()
            if "access_token" in token_data:
                self.access_token = token_data["access_token"]

    async def upload_bytes(self, data: bytes, dest_path: str, content_type: str = "application/octet-stream") -> str:
        import httpx
        import json
        from pathlib import Path
        
        filename = Path(dest_path).name
        metadata = {"name": filename}
        if self.folder_id and self.folder_id != "root":
            metadata["parents"] = [self.folder_id]
            
        async def _do_upload():
            headers = {"Authorization": f"Bearer {self.access_token}"}
            files = {
                "metadata": (None, json.dumps(metadata), "application/json"),
                "file": (filename, data, content_type)
            }
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
                    headers=headers,
                    files=files,
                    timeout=120.0
                )
                resp.raise_for_status()
                return resp.json().get("id")

        try:
            file_id = await _do_upload()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401 and self.refresh_token:
                await self._refresh_token()
                file_id = await _do_upload()
            else:
                raise
                
        return f"gdrive://{file_id}"

    async def download(self, path: str) -> bytes:
        raise NotImplementedError("Direct Google Drive download is not implemented yet.")

    async def delete(self, path: str) -> None:
        import httpx
        
        file_id = path.replace("gdrive://", "")
        
        async def _do_delete():
            headers = {"Authorization": f"Bearer {self.access_token}"}
            async with httpx.AsyncClient() as client:
                resp = await client.delete(
                    f"https://www.googleapis.com/drive/v3/files/{file_id}",
                    headers=headers,
                    timeout=30.0
                )
                resp.raise_for_status()

        try:
            await _do_delete()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401 and self.refresh_token:
                await self._refresh_token()
                await _do_delete()
            elif e.response.status_code == 404:
                pass # Already deleted
            else:
                raise
