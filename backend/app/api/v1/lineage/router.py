"""Lineage API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext, get_current_user, get_db
from app.schemas.lineage import (
    DatasetLineageGraph,
    ImpactAnalysisRequest,
    ImpactedModel,
    LineageGraph,
    ModelLineageGraph,
    ReproducibilityReport,
)
from src.services.lineage_service import LineageService

router = APIRouter(prefix="/lineage", tags=["lineage"])


@router.get("/dataset-versions/{id}", response_model=DatasetLineageGraph)
async def get_dataset_lineage(id: str, db: AsyncSession = Depends(get_db), _user: UserContext = Depends(get_current_user)) -> DatasetLineageGraph:
    return await LineageService(db).get_dataset_lineage(id)


@router.get("/model-versions/{id}", response_model=ModelLineageGraph)
async def get_model_lineage(id: str, db: AsyncSession = Depends(get_db), _user: UserContext = Depends(get_current_user)) -> ModelLineageGraph:
    return await LineageService(db).get_model_lineage(id)


@router.get("/graph")
async def get_full_lineage_graph(
    root_type: str | None = Query(default=None, pattern="^(dataset|model|dataset_version|model_version)$"),
    root_id: str | None = Query(default=None),
    depth: int = Query(3, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
    _user: UserContext = Depends(get_current_user),
) -> dict:
    if root_type in {"dataset_version", "model_version"} and root_id:
        return await LineageService(db).get_full_lineage_graph(root_type=root_type, root_id=root_id, depth=depth)
    return await LineageService(db).get_ui_lineage_graph(root_type=root_type, root_id=root_id, depth=depth)


@router.get("/impact/{dataset_version_id}")
async def impact_summary(
    dataset_version_id: str,
    db: AsyncSession = Depends(get_db),
    _user: UserContext = Depends(get_current_user),
) -> dict:
    return await LineageService(db).impact_summary(dataset_version_id)


@router.post("/impact-analysis", response_model=list[ImpactedModel])
async def impact_analysis(
    payload: ImpactAnalysisRequest,
    db: AsyncSession = Depends(get_db),
    _user: UserContext = Depends(get_current_user),
) -> list[ImpactedModel]:
    return await LineageService(db).find_impacted_models(payload.dataset_version_id, production_only=payload.check_production_only)


@router.get("/model-versions/{id}/reproducibility", response_model=ReproducibilityReport)
async def reproducibility(id: str, db: AsyncSession = Depends(get_db), _user: UserContext = Depends(get_current_user)) -> ReproducibilityReport:
    return await LineageService(db).verify_reproducibility(id)
