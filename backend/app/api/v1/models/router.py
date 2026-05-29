"""MLOps Models API router."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext, get_current_user, get_db
from app.schemas.mlops_model import (
    ApprovalActionRequest,
    ApprovalActionResponse,
    ModelAuditResponse,
    ModelLineageResponse,
    ModelListResponse,
    ModelResponse,
    ModelVersionResponse,
    PromoteRequest,
    PromoteResponse,
    RollbackRequest,
    RollbackResponse,
)
from app.services.mlops_model_service import ModelService

router = APIRouter(prefix="/models", tags=["models"])


def _version_payload(row) -> ModelVersionResponse:
    return ModelVersionResponse(
        id=row.id,
        model_name=row.mlflow_name,
        version=row.mlflow_version,
        run_id=row.run_id,
        stage=row.stage,
        status=row.status,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
        metrics=row.metrics,
        tags=row.tags,
    )


@router.get("/", response_model=ModelListResponse)
async def list_models(db: AsyncSession = Depends(get_db), _user: UserContext = Depends(get_current_user)) -> ModelListResponse:
    service = ModelService(db)
    items = await service.list_models()
    return ModelListResponse(items=items, total=len(items))


@router.get("/{model_name}", response_model=ModelResponse)
async def get_model(model_name: str, db: AsyncSession = Depends(get_db), _user: UserContext = Depends(get_current_user)) -> ModelResponse:
    rows = await ModelService(db).get_model_versions(model_name)
    return ModelResponse(model_name=model_name, versions=[_version_payload(row) for row in rows])


@router.get("/{model_name}/versions", response_model=list[ModelVersionResponse])
async def list_model_versions(model_name: str, db: AsyncSession = Depends(get_db), _user: UserContext = Depends(get_current_user)) -> list[ModelVersionResponse]:
    rows = await ModelService(db).get_model_versions(model_name)
    return [_version_payload(row) for row in rows]


@router.get("/{model_name}/versions/{version}", response_model=ModelVersionResponse)
async def get_model_version(model_name: str, version: int, db: AsyncSession = Depends(get_db), _user: UserContext = Depends(get_current_user)) -> ModelVersionResponse:
    row = await ModelService(db).get_model_version(model_name, version)
    return _version_payload(row)


@router.post("/{model_name}/versions/{version}/promote", response_model=PromoteResponse, status_code=status.HTTP_202_ACCEPTED)
async def promote_model_version(
    model_name: str,
    version: int,
    payload: PromoteRequest,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> PromoteResponse:
    status_value, req_id = await ModelService(db).promote(
        model_name=model_name,
        version=version,
        target_stage=payload.target_stage,
        reason=payload.reason,
        notify_team=payload.notify_team,
        user=user,
    )
    return PromoteResponse(approval_request_id=req_id, status=status_value)


@router.post("/{model_name}/versions/{version}/rollback", response_model=RollbackResponse)
async def rollback_model_version(
    model_name: str,
    version: int,
    payload: RollbackRequest,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> RollbackResponse:
    rolled_back, restored = await ModelService(db).rollback(model_name=model_name, version=version, reason=payload.reason, user=user)
    return RollbackResponse(rolled_back_version=rolled_back, restored_version=restored)


@router.get("/{model_name}/versions/{version}/lineage", response_model=ModelLineageResponse)
async def model_version_lineage(
    model_name: str,
    version: int,
    db: AsyncSession = Depends(get_db),
    _user: UserContext = Depends(get_current_user),
) -> ModelLineageResponse:
    service = ModelService(db)
    row = await service.get_model_version(model_name, version)
    return ModelLineageResponse(**(await service.lineage(row)))


@router.get("/{model_name}/versions/{version}/audit", response_model=ModelAuditResponse)
async def model_version_audit(
    model_name: str,
    version: int,
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    actions: list[str] | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _user: UserContext = Depends(get_current_user),
) -> ModelAuditResponse:
    service = ModelService(db)
    row = await service.get_model_version(model_name, version)
    items = await service.audit(row, from_date=from_date, to_date=to_date, actions=actions)
    return ModelAuditResponse(items=items)


@router.post("/approval-requests/{request_id}/approve", response_model=ApprovalActionResponse)
async def approve_request(
    request_id: str,
    payload: ApprovalActionRequest,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> ApprovalActionResponse:
    status_value = await ModelService(db).approval_action(request_id=request_id, approve=True, note=payload.note, user=user)
    return ApprovalActionResponse(request_id=request_id, status=status_value)


@router.post("/approval-requests/{request_id}/reject", response_model=ApprovalActionResponse)
async def reject_request(
    request_id: str,
    payload: ApprovalActionRequest,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> ApprovalActionResponse:
    status_value = await ModelService(db).approval_action(request_id=request_id, approve=False, note=payload.note, user=user)
    return ApprovalActionResponse(request_id=request_id, status=status_value)
