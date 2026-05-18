"""Main download Celery worker task."""

import logging
from datetime import datetime
import json
import redis

from celery import shared_task
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.celery_app import celery_app
from app.db.session import SessionLocal
from app.db.models import DownloadTask, TaskStatus
from app.services.task_service import TaskService
from app.services.model_service import ModelService
from app.services.storage_service import StorageService
from app.workers.downloaders import get_downloader
from app.core.exceptions import (
    InsufficientDiskSpaceError,
    ChecksumMismatchError,
    ModelDownloadError,
)


logger = logging.getLogger(__name__)

# Redis client for progress tracking
redis_client = redis.from_url(settings.REDIS_URL)


@celery_app.task(
    bind=True,
    max_retries=settings.MAX_RETRY_COUNT,
    acks_late=True,
    reject_on_worker_lost=True,
    name="workers.download_model",
)
def download_model_task(self, task_id: str):
    """
    Main download task executed by Celery worker.

    Workflow:
    1. Load task from DB, validate state
    2. Resolve downloader, get download URLs
    3. Check for existing model (duplicate by SHA-256)
    4. Pre-flight: ensure disk space (1.05x required)
    5. Stream download with resume support
    6. Verify SHA-256 if expected
    7. Move to final storage
    8. Create/update ml_models record
    9. Update task as COMPLETED
    """
    # Initialize services (must be sync context in Celery)
    async def run_download():
        """Run async download operations."""
        async with SessionLocal() as db:
            task_svc = TaskService(db)
            model_svc = ModelService(db)
            storage_svc = StorageService()

            try:
                # Step 1: Load and validate task
                task = await task_svc.get_task(task_id)
                if not task:
                    logger.error(f"Task not found: {task_id}")
                    return

                if task.status != TaskStatus.PENDING:
                    logger.warning(f"Task not in PENDING state: {task_id}")
                    return

                # Mark as downloading
                await task_svc.mark_downloading(task_id)
                await db.commit()

                logger.info(f"Starting download for task: {task_id}")

                # Step 2: Get downloader and resolve files
                downloader = get_downloader(
                    task.source_type,
                    hf_token=task.request_metadata.get("hf_token"),
                )

                download_info = await resolve_download_files(
                    downloader,
                    task.source_type,
                    task.source_identifier,
                    task.request_metadata,
                )

                if not download_info:
                    raise ValueError("No files resolved from source")

                total_size = sum(size for _, size, _ in download_info)
                logger.info(f"Total download size: {total_size} bytes")

                # Step 3: Check for existing model
                first_hash = download_info[0][2] if download_info else None
                if first_hash:
                    existing = await model_svc.find_by_sha256(first_hash)
                    if existing and existing.status == "ready":
                        logger.info(f"Model already exists: {existing.id}")
                        task.status = TaskStatus.COMPLETED
                        task.model_id = existing.id
                        task.progress_pct = 100
                        task.completed_at = datetime.utcnow()
                        await db.commit()
                        return

                # Step 4: Pre-flight checks
                storage_svc.ensure_dir(storage_svc.temp_path)
                try:
                    storage_svc.check_space(total_size)
                except InsufficientDiskSpaceError as e:
                    logger.error(f"Insufficient disk space: {e}")
                    await task_svc.mark_failed(
                        task_id,
                        "DISK_FULL",
                        str(e),
                    )
                    await db.commit()
                    return

                # Step 5: Download files
                temp_path = storage_svc.get_temp_path(task_id)

                async def progress_callback(**kwargs):
                    """Update progress in Redis and DB."""
                    pct = kwargs.get("progress_pct", 0)
                    downloaded = kwargs.get("downloaded_bytes", 0)

                    # Save to Redis for fast polling
                    progress_data = {
                        "pct": pct,
                        "downloaded": downloaded,
                        "total": total_size,
                        "current_file": task.current_file,
                    }
                    redis_client.setex(
                        f"task:{task_id}:progress",
                        3600,  # TTL 1 hour
                        json.dumps(progress_data),
                    )

                    # Update DB periodically (every 10% or significant bytes)
                    if pct % 10 == 0 or downloaded % (50 * 1024 * 1024) == 0:
                        await task_svc.update_progress(
                            task_id,
                            pct,
                            downloaded,
                            total_size,
                        )
                        await db.commit()

                # Download first file (simplified - real impl would handle multiple)
                url, size, expected_hash = download_info[0]
                logger.info(f"Downloading: {url}")

                downloaded_path, calculated_hash = await downloader.stream_with_resume(
                    task_id,
                    url,
                    temp_path,
                    progress_callback,
                    expected_hash,
                )

                # Step 7: Move to final location
                model = await model_svc.create_or_get(
                    source_type=task.source_type,
                    source_identifier=task.source_identifier,
                    name=task.request_metadata.get(
                        "model_name",
                        task.source_identifier.split("/")[-1],
                    ),
                    tags=task.request_metadata.get("tags", []),
                )

                final_path = storage_svc.get_final_path(
                    task.source_type,
                    task.source_identifier,
                    task.request_metadata.get("revision", "main"),
                )

                storage_svc.move_to_final(downloaded_path, final_path)

                # Step 8: Update model with final info
                await model_svc.mark_ready(
                    model.id,
                    storage_path=str(final_path),
                    sha256=calculated_hash,
                    size_bytes=size or downloaded_path.stat().st_size,
                    metadata={"downloaded_at": datetime.utcnow().isoformat()},
                )

                # Step 9: Mark task completed
                await task_svc.mark_completed(task_id, model_id=model.id)
                await db.commit()

                logger.info(f"Download completed successfully: {task_id}")

            except ChecksumMismatchError as e:
                logger.error(f"Checksum mismatch: {e}")
                await task_svc.mark_failed(task_id, "CHECKSUM_MISMATCH", str(e))
                await db.commit()
                # Clean up temp file but keep for inspection
                storage_svc.cleanup_temp_file(task_id)

            except InsufficientDiskSpaceError as e:
                logger.error(f"Disk space error: {e}")
                await task_svc.mark_failed(task_id, "DISK_FULL", str(e))
                await db.commit()

            except ModelDownloadError as e:
                logger.error(f"Download error: {e.code} - {e.message}")
                if e.retryable and (self.request.retries or 0) < settings.MAX_RETRY_COUNT:
                    logger.info(f"Retrying task: {task_id}")
                    await task_svc.mark_retrying(task_id)
                    await db.commit()
                    # Retry with exponential backoff
                    raise self.retry(exc=e, countdown=2 ** (self.request.retries or 0))
                else:
                    await task_svc.mark_failed(task_id, e.code, e.message)
                    await db.commit()

            except Exception as e:
                logger.exception(f"Unexpected error in download task: {e}")
                await task_svc.mark_failed(
                    task_id,
                    "UNKNOWN_ERROR",
                    str(e),
                )
                await db.commit()

            finally:
                downloader.close() if "downloader" in locals() else None

    # Run async code in sync Celery context
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    loop.run_until_complete(run_download())


async def resolve_download_files(
    downloader,
    source_type: str,
    source_identifier: str,
    request_metadata: dict,
):
    """Resolve actual download files from source."""
    file_patterns = request_metadata.get("file_patterns", [])

    if source_type == "huggingface":
        return await downloader.resolve_download_info(
            source_identifier,
            revision=request_metadata.get("revision", "main"),
            file_patterns=file_patterns or None,
        )
    elif source_type == "github_release":
        return await downloader.resolve_from_identifier(
            source_identifier,
            file_patterns=file_patterns or None,
        )
    elif source_type == "direct_url":
        url, size, sha256 = await downloader.resolve_download_info(source_identifier)
        return [(url, size, sha256)]
    else:
        raise ValueError(f"Unknown source type: {source_type}")
