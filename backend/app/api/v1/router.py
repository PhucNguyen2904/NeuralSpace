"""API v1 router collection."""

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1 import health_router
from app.api.v1.events.router import router as events_router
from app.api.v1.workspaces import router as workspaces_router

router = APIRouter()

# Include all sub-routers
router.include_router(health_router.router)
router.include_router(auth_router)
router.include_router(workspaces_router)
# SSE event stream — mounted under /workspaces/{id}/events to keep the URL
# hierarchy consistent with other workspace sub-resources.
router.include_router(events_router)
