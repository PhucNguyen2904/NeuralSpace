"""API v1 router."""

from fastapi import APIRouter

from app.api.v1.endpoints import tasks, models, health


router = APIRouter(prefix="/api/v1")

router.include_router(tasks.router)
router.include_router(models.router)
router.include_router(health.router)

__all__ = ["router"]
