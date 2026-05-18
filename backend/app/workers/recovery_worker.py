"""Recovery task for stale downloads."""

import logging
from datetime import timedelta, datetime

from celery import shared_task
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.celery_app import celery_app
from app.db.session import SessionLocal
from app.db.models import TaskStatus
from app.services.task_service import TaskService


logger = logging.getLogger(__name__)


@celery_app.task(name="workers.recover_stale_tasks")
def recover_stale_tasks():
    """
    Recover tasks that are stuck in DOWNLOADING state.

    Runs every 5 minutes via Celery Beat.
    Resets stale DOWNLOADING tasks back to PENDING for retry.
    """
    import asyncio

    async def _recover():
        async with SessionLocal() as db:
            task_svc = TaskService(db)

            # Get stale tasks (not updated in last 10 minutes)
            stale_tasks = await task_svc.get_stale_downloading_tasks(
                minutes_threshold=10
            )

            logger.info(f"Found {len(stale_tasks)} stale downloading tasks")

            for task in stale_tasks:
                logger.warning(
                    f"Recovering stale task {task.id}: "
                    f"last updated {task.updated_at}"
                )

                # Reset to PENDING for retry
                task.status = TaskStatus.PENDING
                task.started_at = None
                db.add(task)

            await db.commit()
            logger.info(f"Recovered {len(stale_tasks)} tasks")

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    loop.run_until_complete(_recover())
