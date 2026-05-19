"""Health check router."""

from fastapi import APIRouter, status

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", status_code=status.HTTP_200_OK)
async def get_health():
    """Get application health status."""
    return {
        "status": "ok",
        "version": "1.0.0",
    }
