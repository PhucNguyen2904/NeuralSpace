"""Repository for storage connections."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.storage_connection import StorageConnection


class StorageConnectionRepository:
    """Repository for managing StorageConnection entities."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_by_id(self, connection_id: str) -> StorageConnection | None:
        stmt = select(StorageConnection).where(StorageConnection.id == connection_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_user_id(self, user_id: str) -> Sequence[StorageConnection]:
        stmt = (
            select(StorageConnection)
            .where(StorageConnection.user_id == user_id)
            .order_by(
                StorageConnection.is_default.desc(),
                StorageConnection.created_at.desc(),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_default(self, user_id: str) -> StorageConnection | None:
        stmt = select(StorageConnection).where(
            StorageConnection.user_id == user_id,
            StorageConnection.is_default.is_(True),
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(
        self,
        user_id: str,
        config_path: str,
        provider: str,
        remote_name: str,
        display_name: str,
        encrypted_credentials: str | None = None,
        credential_type: str | None = None,
        credential_expires_at: datetime | None = None,
        status: str = "connected",
    ) -> StorageConnection:
        connection = StorageConnection(
            user_id=user_id,
            provider=provider,
            remote_name=remote_name,
            config_path=config_path,
            display_name=display_name,
            encrypted_credentials=encrypted_credentials,
            credential_type=credential_type,
            credential_expires_at=credential_expires_at,
            status=status,
        )
        self.db.add(connection)
        await self.db.commit()
        await self.db.refresh(connection)
        return connection

    async def update_credentials(
        self,
        connection_id: str,
        encrypted_credentials: str,
        credential_expires_at: datetime | None = None,
        status: str = "connected",
    ) -> None:
        await self.db.execute(
            update(StorageConnection)
            .where(StorageConnection.id == connection_id)
            .values(
                encrypted_credentials=encrypted_credentials,
                credential_expires_at=credential_expires_at,
                status=status,
                status_message=None,
            )
        )
        await self.db.commit()

    async def update_status(
        self,
        connection_id: str,
        status: str,
        status_message: str | None = None,
    ) -> None:
        await self.db.execute(
            update(StorageConnection)
            .where(StorageConnection.id == connection_id)
            .values(status=status, status_message=status_message)
        )
        await self.db.commit()

    async def update_display_name(self, connection_id: str, display_name: str) -> None:
        await self.db.execute(
            update(StorageConnection)
            .where(StorageConnection.id == connection_id)
            .values(display_name=display_name)
        )
        await self.db.commit()

    async def mark_last_validated(self, connection_id: str) -> None:
        await self.db.execute(
            update(StorageConnection)
            .where(StorageConnection.id == connection_id)
            .values(last_validated_at=datetime.now(timezone.utc))
        )
        await self.db.commit()

    async def set_default(self, user_id: str, connection_id: str) -> None:
        """Unset tất cả default, set connection_id làm default."""
        await self.db.execute(
            update(StorageConnection)
            .where(StorageConnection.user_id == user_id)
            .values(is_default=False)
        )
        await self.db.execute(
            update(StorageConnection)
            .where(StorageConnection.id == connection_id, StorageConnection.user_id == user_id)
            .values(is_default=True)
        )
        await self.db.commit()

    async def unset_all_defaults(self, user_id: str) -> None:
        """Bỏ default khỏi tất cả connections của user."""
        await self.db.execute(
            update(StorageConnection)
            .where(StorageConnection.user_id == user_id)
            .values(is_default=False)
        )
        await self.db.commit()

    async def delete(self, connection_id: str) -> bool:
        stmt = delete(StorageConnection).where(StorageConnection.id == connection_id)
        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.rowcount > 0
