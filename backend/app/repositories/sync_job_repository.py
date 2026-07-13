"""Repository for sync jobs."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sync_job import SyncJob


class SyncJobRepository:
    """CRUD operations cho SyncJob."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        user_id: str,
        job_type: str,
        connection_id: str | None = None,
        source_path: str | None = None,
        dest_path: str | None = None,
        params: dict | None = None,
        priority: int = 5,
    ) -> SyncJob:
        job = SyncJob(
            user_id=user_id,
            connection_id=connection_id,
            job_type=job_type,
            source_path=source_path,
            dest_path=dest_path,
            params=params or {},
            priority=priority,
        )
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)
        return job

    async def get_by_id(self, job_id: str, user_id: str) -> SyncJob | None:
        stmt = select(SyncJob).where(SyncJob.id == job_id, SyncJob.user_id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_user(
        self,
        user_id: str,
        status: str | None = None,
        limit: int = 50,
    ) -> Sequence[SyncJob]:
        stmt = select(SyncJob).where(SyncJob.user_id == user_id)
        if status:
            stmt = stmt.where(SyncJob.status == status)
        stmt = stmt.order_by(SyncJob.created_at.desc()).limit(limit)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def mark_running(self, job_id: str, task_id: str | None = None) -> None:
        await self.db.execute(
            update(SyncJob)
            .where(SyncJob.id == job_id)
            .values(
                status="running",
                started_at=datetime.now(timezone.utc),
                task_id=task_id,
            )
        )
        await self.db.commit()

    async def mark_completed(
        self,
        job_id: str,
        result_summary: dict | None = None,
        bytes_transferred: int | None = None,
        files_transferred: int | None = None,
    ) -> None:
        await self.db.execute(
            update(SyncJob)
            .where(SyncJob.id == job_id)
            .values(
                status="completed",
                completed_at=datetime.now(timezone.utc),
                progress_pct=100,
                result_summary=result_summary,
                bytes_transferred=bytes_transferred,
                files_transferred=files_transferred,
            )
        )
        await self.db.commit()

    async def mark_failed(self, job_id: str, error_message: str) -> None:
        await self.db.execute(
            update(SyncJob)
            .where(SyncJob.id == job_id)
            .values(
                status="failed",
                completed_at=datetime.now(timezone.utc),
                error_message=error_message,
            )
        )
        await self.db.commit()

    async def cancel(self, job_id: str, user_id: str) -> bool:
        result = await self.db.execute(
            update(SyncJob)
            .where(SyncJob.id == job_id, SyncJob.user_id == user_id, SyncJob.status == "pending")
            .values(status="cancelled")
        )
        await self.db.commit()
        return result.rowcount > 0
