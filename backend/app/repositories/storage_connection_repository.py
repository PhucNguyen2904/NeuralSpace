"""Repository for storage connections."""

from collections.abc import Sequence

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.storage_connection import StorageConnection
from app.schemas.storage import StorageConnectRequest


class StorageConnectionRepository:
    """Repository for managing StorageConnection entities."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, connection_id: str) -> StorageConnection | None:
        """Get a storage connection by ID."""
        stmt = select(StorageConnection).where(StorageConnection.id == connection_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_user_id(self, user_id: str) -> Sequence[StorageConnection]:
        """Get all storage connections for a user."""
        stmt = select(StorageConnection).where(StorageConnection.user_id == user_id).order_by(StorageConnection.created_at.desc())
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def create(self, user_id: str, config_path: str, data: StorageConnectRequest) -> StorageConnection:
        """Create a new storage connection."""
        connection = StorageConnection(
            user_id=user_id,
            provider=data.provider,
            remote_name=data.remote_name,
            config_path=config_path,
            display_name=data.display_name,
        )
        self.db.add(connection)
        await self.db.commit()
        await self.db.refresh(connection)
        return connection

    async def delete(self, connection_id: str) -> bool:
        """Delete a storage connection."""
        stmt = delete(StorageConnection).where(StorageConnection.id == connection_id)
        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.rowcount > 0
