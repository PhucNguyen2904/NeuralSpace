"""Model endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.v1.schemas.model import (
    ModelResponse,
    ModelListResponse,
    DeleteModelRequest,
)
from app.db.session import get_db_session
from app.services.model_service import ModelService
from app.services.storage_service import StorageService


router = APIRouter(prefix="/models", tags=["models"])


@router.get("", response_model=ModelListResponse)
async def list_models(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    status: str = Query(None),
    tags: str = Query(None, description="Comma-separated tags"),
    db = Depends(get_db_session),
):
    """List all models with optional filtering."""
    model_svc = ModelService(db)

    tag_list = [t.strip() for t in tags.split(",")] if tags else None

    models, total = await model_svc.list_models(
        skip=skip,
        limit=limit,
        status=status,
        tags=tag_list,
    )

    return ModelListResponse(
        items=[ModelResponse.from_orm(m) for m in models],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/{model_id}", response_model=ModelResponse)
async def get_model(
    model_id: str,
    db = Depends(get_db_session),
):
    """Get a specific model by ID."""
    model_svc = ModelService(db)
    model = await model_svc.get_by_id(model_id)

    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    return ModelResponse.from_orm(model)


@router.delete("/{model_id}", status_code=204)
async def delete_model(
    model_id: str,
    request: DeleteModelRequest,
    db = Depends(get_db_session),
):
    """Delete a model (optionally including storage files)."""
    model_svc = ModelService(db)
    storage_svc = StorageService()

    model = await model_svc.get_by_id(model_id)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    if request.delete_files and model.storage_path:
        storage_svc.delete_model(model.storage_path)

    await model_svc.delete_model(model_id)
    await db.commit()

    return None
