"""API v1 router collection."""

from fastapi import APIRouter

from app.api.v1.datasets.router import router as datasets_router
from app.api.v1.dvc.router import router as dvc_router
from app.api.v1.auth import router as auth_router
from app.api.v1.colab.router import router as colab_router
from app.api.v1.lineage.router import router as lineage_router
from app.api.v1.mlflow.router import router as mlflow_router
from app.api.v1.models.router import router as models_router
from app.api.v1.workspaces import router as workspaces_router

router = APIRouter()

# Include all sub-routers
router.include_router(auth_router)
router.include_router(colab_router)
router.include_router(workspaces_router)
router.include_router(dvc_router)
router.include_router(datasets_router)
router.include_router(models_router)
router.include_router(lineage_router)
router.include_router(mlflow_router)
