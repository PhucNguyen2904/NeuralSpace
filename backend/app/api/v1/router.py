"""API v1 router collection."""

from fastapi import APIRouter

from app.api.v1.datasets.router import router as datasets_router
from app.api.v1.datasets.router import workspace_router as workspace_datasets_router
from app.api.v1.auth import router as auth_router
from app.api.v1.colab.router import router as colab_router
from app.api.v1.events.router import router as events_router
from app.api.v1.models.router import router as models_router
from app.api.v1.models.router import workspace_router as workspace_models_router
from app.api.v1.monitoring.router import router as monitoring_router
from app.api.v1.storage.router import router as storage_router
from app.api.v1.workspaces import router as workspaces_router

router = APIRouter()

# Include all sub-routers
router.include_router(monitoring_router)
router.include_router(auth_router)
router.include_router(colab_router)
router.include_router(workspaces_router)
router.include_router(datasets_router)
router.include_router(workspace_datasets_router)
router.include_router(models_router)
router.include_router(workspace_models_router)
router.include_router(storage_router)
# SSE event stream — mounted under /workspaces/{id}/events to keep the URL
# hierarchy consistent with other workspace sub-resources.
router.include_router(events_router)
