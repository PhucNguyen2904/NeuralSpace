"""Download task management service."""

from datetime import datetime
from typing import Optional, List
from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
import logging
from nanoid import generate

from app.db.models import DownloadTask, TaskStatus
from app.core.exceptions import TaskNotRetryableError


logger = logging.getLogger(__name__)


def generate_task_id() -> str:
    """Generate a unique task ID with 'dl_' prefix."""
    return f"dl_{generate(size=16)}"


class TaskService:
    """Service for download task management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_task(
        self,
        source_type: str,
        source_identifier: str,
        priority: int = 1,
        tags: Optional[List[str]] = None,
        request_metadata: Optional[dict] = None,
    ) -> DownloadTask:
        """Create a new download task."""
        task = DownloadTask(
            id=generate_task_id(),
            status=TaskStatus.PENDING,
            source_type=source_type,
            source_identifier=source_identifier,
            priority=priority,
            request_metadata=request_metadata or {},
        )
        self.db.add(task)
        await self.db.flush()
        logger.info(f"Created download task: {task.id}")
        return task

    async def get_task(self, task_id: str) -> Optional[DownloadTask]:
        """Get a task by ID."""
        stmt = select(DownloadTask).where(DownloadTask.id == task_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update_progress(
        self,
        task_id: str,
        progress_pct: int,
        downloaded_bytes: int,
        total_bytes: Optional[int] = None,
        current_file: Optional[str] = None,
    ) -> DownloadTask:
        """Update task progress."""
        task = await self.get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")

        task.progress_pct = min(progress_pct, 100)
        task.downloaded_bytes = downloaded_bytes
        if total_bytes is not None:
            task.total_bytes = total_bytes
        if current_file:
            task.current_file = current_file

        await self.db.flush()
        return task

    async def mark_downloading(self, task_id: str) -> DownloadTask:
        """Mark task as downloading."""
        task = await self.get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")

        task.status = TaskStatus.DOWNLOADING
        task.started_at = datetime.utcnow()
        await self.db.flush()
        logger.info(f"Task marked as downloading: {task_id}")
        return task

    async def mark_completed(
        self,
        task_id: str,
        model_id: Optional[str] = None,
    ) -> DownloadTask:
        """Mark task as completed."""
        task = await self.get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")

        task.status = TaskStatus.COMPLETED
        task.progress_pct = 100
        task.completed_at = datetime.utcnow()
        task.model_id = model_id

        await self.db.flush()
        logger.info(f"Task marked as completed: {task_id}")
        return task

    async def mark_failed(
        self,
        task_id: str,
        error_code: str,
        error_message: str,
    ) -> DownloadTask:
        """Mark task as failed."""
        task = await self.get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")

        task.status = TaskStatus.FAILED
        task.error_code = error_code
        task.error_message = error_message
        task.completed_at = datetime.utcnow()

        await self.db.flush()
        logger.info(
            f"Task marked as failed: {task_id} - {error_code}: {error_message}"
        )
        return task

    async def mark_retrying(self, task_id: str) -> DownloadTask:
        """Mark task as retrying."""
        task = await self.get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")

        task.status = TaskStatus.RETRYING
        task.retry_count += 1
        task.error_code = None
        task.error_message = None
        task.progress_pct = 0
        task.downloaded_bytes = 0

        await self.db.flush()
        logger.info(f"Task marked as retrying: {task_id} (attempt {task.retry_count})")
        return task

    async def retry_task(self, task_id: str) -> DownloadTask:
        """Retry a failed task if allowed."""
        task = await self.get_task(task_id)
        if not task:
            raise ValueError(f"Task not found: {task_id}")

        if not task.is_retryable():
            raise TaskNotRetryableError(
                f"Task {task_id} cannot be retried. "
                f"Status: {task.status}, Retries: {task.retry_count}/{task.max_retries}"
            )

        # Reset to PENDING for retry
        task.status = TaskStatus.PENDING
        task.retry_count += 1
        task.error_code = None
        task.error_message = None
        task.progress_pct = 0
        task.downloaded_bytes = 0
        task.started_at = None
        task.completed_at = None

        await self.db.flush()
        logger.info(f"Task reset for retry: {task_id} (attempt {task.retry_count})")
        return task

    async def list_tasks(
        self,
        skip: int = 0,
        limit: int = 20,
        status: Optional[str] = None,
    ) -> tuple[List[DownloadTask], int]:
        """List tasks with optional filtering."""
        query = select(DownloadTask)

        if status:
            query = query.where(DownloadTask.status == status)

        # Order by created_at descending
        query = query.order_by(desc(DownloadTask.created_at))

        # Get total count (simplified, assumes small dataset)
        count_stmt = select(DownloadTask)
        if status:
            count_stmt = count_stmt.where(DownloadTask.status == status)
        count_result = await self.db.execute(count_stmt)
        total = len(count_result.fetchall())

        # Get paginated results
        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        tasks = result.scalars().all()

        return tasks, total

    async def get_stale_downloading_tasks(
        self,
        minutes_threshold: int = 10,
    ) -> List[DownloadTask]:
        """Get tasks that are downloading but haven't been updated recently."""
        from datetime import timedelta
        from sqlalchemy import func

        threshold_time = datetime.utcnow() - timedelta(minutes=minutes_threshold)
        stmt = select(DownloadTask).where(
            and_(
                DownloadTask.status == TaskStatus.DOWNLOADING,
                DownloadTask.updated_at < threshold_time,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalars().all()
