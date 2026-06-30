"""Storage Service."""

import os
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage_exceptions import StorageException
from app.models.storage_connection import StorageConnection
from app.repositories.storage_connection_repository import StorageConnectionRepository
from app.schemas.storage import StorageConnectRequest
from app.services.storage.provider import RcloneStorageProvider, StorageProvider
from app.services.storage.rclone_service import RcloneService


class StorageService:
    """Business logic for remote storage management."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repository = StorageConnectionRepository(db)
        # In a real DI setup, RcloneService and RcloneStorageProvider would be injected
        self.rclone_service = RcloneService()
        self.provider: StorageProvider = RcloneStorageProvider(self.rclone_service)

    def _get_user_config_path(self, user_id: str) -> str:
        """Get the path to the user's rclone config file."""
        base_dir = os.environ.get("STORAGE_CONFIGS_DIR", "/storage-configs")
        return str(Path(base_dir) / str(user_id) / "rclone.conf")

    async def connect(self, user_id: str, request: StorageConnectRequest) -> StorageConnection:
        """Connect to a new storage provider."""
        config_path = self._get_user_config_path(user_id)
        
        # Save config via provider before saving to DB
        dummy_conn = StorageConnection(
            user_id=user_id,
            provider=request.provider,
            remote_name=request.remote_name,
            config_path=config_path,
        )
        try:
            self.provider.connect(dummy_conn, request.params)
        except StorageException as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))
            
        # Save to DB
        connection = await self.repository.create(user_id, config_path, request)
        
        # Save encrypted params so config can be regenerated if lost
        import json
        from app.core.security import encrypt_credentials
        connection.encrypted_credentials = encrypt_credentials(json.dumps(request.params))
        await self.db.commit()
        await self.db.refresh(connection)
        return connection

    async def list_connections(self, user_id: str) -> Sequence[StorageConnection]:
        """List all connections for a user."""
        return await self.repository.get_by_user_id(user_id)
        
    async def set_default(self, connection_id: str, user_id: str) -> StorageConnection | dict:
        """Set a connection as the default for the user."""
        # Get all connections for the user
        connections = await self.list_connections(user_id)
        
        target_connection = None
        for conn in connections:
            if conn.id == connection_id:
                target_connection = conn
                conn.is_default = True
            else:
                conn.is_default = False
                
        if connection_id == "system":
            # If "system" is selected, just ensure all other connections are not default
            await self.db.commit()
            return {"message": "System storage set as default"}
            
        if not target_connection:
            raise HTTPException(status_code=404, detail="Storage connection not found")
            
        await self.db.commit()
        await self.db.refresh(target_connection)
        return target_connection

    async def get_connection(self, connection_id: str, user_id: str) -> StorageConnection:
        """Get a connection and verify ownership, reconstructing config if needed."""
        connection = await self.repository.get_by_id(connection_id)
        if not connection:
            raise HTTPException(status_code=404, detail="Storage connection not found")
        if str(connection.user_id) != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this connection")
            
        # Dynamically reconstruct rclone.conf if we have encrypted credentials
        import os
        if connection.encrypted_credentials and not os.path.exists(connection.config_path):
            from app.core.security import decrypt_credentials
            import json
            os.makedirs(os.path.dirname(connection.config_path), exist_ok=True)
            try:
                decrypted_json = decrypt_credentials(connection.encrypted_credentials)
                params = json.loads(decrypted_json)
                # Ensure the provider connects to generate the file
                self.provider.connect(connection, params)
            except Exception:
                # Fallback if decryption fails or json is malformed
                pass
                
        return connection

    async def disconnect(self, connection_id: str, user_id: str) -> None:
        """Disconnect and remove configuration."""
        connection = await self.get_connection(connection_id, user_id)
        
        # Remove from rclone config
        try:
            self.provider.disconnect(connection)
        except StorageException as e:
            # We still want to delete from DB even if rclone fails
            pass
            
        # Delete from DB
        await self.repository.delete(connection_id)

    async def list_files(self, connection_id: str, user_id: str, path: str = "") -> list[dict[str, Any]]:
        """List files in the remote path."""
        connection = await self.get_connection(connection_id, user_id)
        try:
            return self.provider.list_files(connection, path)
        except StorageException as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))

    async def mkdir(self, connection_id: str, user_id: str, path: str) -> None:
        """Create a directory in the remote."""
        connection = await self.get_connection(connection_id, user_id)
        try:
            self.provider.create_directory(connection, path)
        except StorageException as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))

    async def delete_file(self, connection_id: str, user_id: str, path: str, is_dir: bool = False) -> None:
        """Delete a file or directory."""
        connection = await self.get_connection(connection_id, user_id)
        try:
            self.provider.delete(connection, path, is_dir=is_dir)
        except StorageException as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))

    async def sync(self, connection_id: str, user_id: str, src_path: str, dest_path: str) -> None:
        """Synchronize files."""
        connection = await self.get_connection(connection_id, user_id)
        try:
            self.provider.sync(connection, src_path, dest_path)
        except StorageException as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))

    async def upload(self, connection_id: str, user_id: str, remote_path: str, local_path: str) -> None:
        """Upload a local file to remote."""
        connection = await self.get_connection(connection_id, user_id)
        try:
            # We use copy to upload
            remote_dest = self.provider._get_remote_path(connection, remote_path)
            self.rclone_service.copy(connection.config_path, local_path, remote_dest, provider=connection.provider)
        except StorageException as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))
            
    async def download(self, connection_id: str, user_id: str, remote_path: str) -> bytes:
        """Download file content from remote."""
        connection = await self.get_connection(connection_id, user_id)
        try:
            remote_src = self.provider._get_remote_path(connection, remote_path)
            return self.rclone_service.cat(connection.config_path, remote_src, provider=connection.provider)
        except StorageException as e:
            raise HTTPException(status_code=e.status_code, detail=str(e))
