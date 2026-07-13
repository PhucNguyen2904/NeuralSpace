"""Repository for storage audit logs."""

from __future__ import annotations

from typing import Any, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.storage_audit_log import StorageAuditLog


class StorageAuditLogRepository:
    """Append-only audit log repository."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def log(
        self,
        user_id: str,
        action: str,
        connection_id: str | None = None,
        status: str = "success",
        resource_path: str | None = None,
        resource_size: int | None = None,
        error_code: str | None = None,
        error_message: str | None = None,
        metadata: dict[str, Any] | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> StorageAuditLog:
        """Ghi một audit log entry."""
        entry = StorageAuditLog(
            user_id=user_id,
            connection_id=connection_id,
            action=action,
            resource_path=resource_path,
            resource_size=resource_size,
            status=status,
            error_code=error_code,
            error_message=error_message,
            metadata_=metadata or {},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.db.add(entry)
        await self.db.commit()
        return entry

    async def list_by_user(
        self,
        user_id: str,
        connection_id: str | None = None,
        action: str | None = None,
        limit: int = 100,
    ) -> Sequence[StorageAuditLog]:
        stmt = select(StorageAuditLog).where(StorageAuditLog.user_id == user_id)
        if connection_id:
            stmt = stmt.where(StorageAuditLog.connection_id == connection_id)
        if action:
            stmt = stmt.where(StorageAuditLog.action == action)
        stmt = stmt.order_by(StorageAuditLog.created_at.desc()).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()
