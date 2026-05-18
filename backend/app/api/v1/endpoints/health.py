"""Health check endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import redis
import logging

from app.config import settings
from app.db.session import get_db_session
from app.services.storage_service import StorageService


logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db_session)):
    """Health check endpoint returning status of all dependencies."""
    checks: dict[str, str | float] = {}
    status = "ok"

    # Check PostgreSQL
    try:
        await db.execute(text("SELECT 1"))
        checks["postgres"] = "ok"
    except Exception as e:
        checks["postgres"] = f"error: {str(e)}"
        status = "degraded"

    # Check Redis
    try:
        redis_client = redis.from_url(settings.REDIS_URL)
        redis_client.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {str(e)}"
        status = "degraded"

    # Check disk usage
    try:
        storage_svc = StorageService()
        usage = storage_svc.get_disk_usage()
        checks["disk_usage_pct"] = round(usage.percent_used, 2)
        checks["disk_free_gb"] = round(usage.free_bytes / (1024**3), 2)

        if usage.percent_used > 90:
            status = "degraded"
    except Exception as e:
        checks["disk"] = f"error: {str(e)}"
        status = "degraded"

    return {
        "status": status,
        "checks": checks,
    }
