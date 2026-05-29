"""MLOps Datasets API router."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext, get_current_user, get_db
from app.schemas.mlops_dataset import (
    AsyncAcceptedResponse,
    DatasetCreateRequest,
    DatasetListResponse,
    DatasetPullRequest,
    DatasetPullResponse,
    DatasetResponse,
    DatasetUpdateRequest,
    DatasetVersionListResponse,
    DatasetVersionPatchRequest,
    DatasetVersionResponse,
    DatasetVersionTrackRequest,
    IntegrityValidationResponse,
    LineageResponse,
)
from app.services.mlops_dataset_service import DatasetService, ensure_staging_file_exists
from app.workers.mlops_tasks import track_dataset_version_task
from src.integrations.dvc.client import DVCClient

router = APIRouter(prefix="/datasets", tags=["datasets"])


def _to_dataset_response(row) -> DatasetResponse:
    return DatasetResponse(
        id=row.id,
        name=row.name,
        description=row.description,
        type=row.type,
        owner_id=row.owner_id,
        team_id=row.team_id,
        dvc_repo_url=row.dvc_repo_url,
        storage_path=row.storage_path,
        tags=row.tags or [],
        status=row.status,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _to_version_response(row) -> DatasetVersionResponse:
    return DatasetVersionResponse(
        id=row.id,
        dataset_id=row.dataset_id,
        version=row.version,
        dvc_md5=row.dvc_md5,
        dvc_commit=row.dvc_commit,
        storage_path=row.storage_path,
        size_bytes=row.size_bytes,
        changelog=row.changelog,
        is_latest=bool(row.is_latest),
        status=row.status,
        created_by=row.created_by,
        created_at=row.created_at,
    )


@router.post("/", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
async def create_dataset(
    payload: DatasetCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> DatasetResponse:
    service = DatasetService(db)
    row = await service.create_dataset(payload, user)
    return _to_dataset_response(row)


@router.get("/", response_model=DatasetListResponse)
async def list_datasets(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _user: UserContext = Depends(get_current_user),
) -> DatasetListResponse:
    service = DatasetService(db)
    rows, total = await service.list_datasets(page=page, page_size=page_size, status_filter=status_filter, q=q)
    return DatasetListResponse(items=[_to_dataset_response(item) for item in rows], total=total, page=page, page_size=page_size)


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(dataset_id: str, db: AsyncSession = Depends(get_db), _user: UserContext = Depends(get_current_user)) -> DatasetResponse:
    row = await DatasetService(db).get_dataset(dataset_id)
    return _to_dataset_response(row)


@router.patch("/{dataset_id}", response_model=DatasetResponse)
async def patch_dataset(
    dataset_id: str,
    payload: DatasetUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> DatasetResponse:
    row = await DatasetService(db).update_dataset(dataset_id, payload, user)
    return _to_dataset_response(row)


@router.delete("/{dataset_id}", response_model=DatasetResponse)
async def delete_dataset(dataset_id: str, db: AsyncSession = Depends(get_db), user: UserContext = Depends(get_current_user)) -> DatasetResponse:
    row = await DatasetService(db).archive_dataset(dataset_id, user)
    return _to_dataset_response(row)


@router.post("/{dataset_id}/versions", response_model=AsyncAcceptedResponse, status_code=status.HTTP_202_ACCEPTED)
async def track_dataset_version(
    dataset_id: str,
    payload: DatasetVersionTrackRequest,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> AsyncAcceptedResponse:
    service = DatasetService(db)
    dataset = await service.get_dataset(dataset_id)
    if dataset.owner_id != user.user_id and "admin" not in user.roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permission")

    ensure_staging_file_exists(payload.local_path)

    task = track_dataset_version_task.delay(
        dataset_id=dataset_id,
        created_by=user.user_id,
        local_path=payload.local_path,
        dataset_name=payload.dataset_name,
        commit_message=payload.commit_message,
        changelog=payload.changelog,
        repo_path=str(Path.cwd()),
        remote_name="minio",
    )
    return AsyncAcceptedResponse(task_id=task.id, status="queued")


@router.get("/{dataset_id}/versions", response_model=DatasetVersionListResponse)
async def list_dataset_versions(dataset_id: str, db: AsyncSession = Depends(get_db), _user: UserContext = Depends(get_current_user)) -> DatasetVersionListResponse:
    rows = await DatasetService(db).list_versions(dataset_id)
    return DatasetVersionListResponse(items=[_to_version_response(row) for row in rows])


@router.get("/{dataset_id}/versions/{version_id}", response_model=DatasetVersionResponse)
async def get_dataset_version(
    dataset_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    _user: UserContext = Depends(get_current_user),
) -> DatasetVersionResponse:
    row = await DatasetService(db).get_version(dataset_id, version_id)
    return _to_version_response(row)


@router.patch("/{dataset_id}/versions/{version_id}", response_model=DatasetVersionResponse)
async def patch_dataset_version(
    dataset_id: str,
    version_id: str,
    payload: DatasetVersionPatchRequest,
    db: AsyncSession = Depends(get_db),
    _user: UserContext = Depends(get_current_user),
) -> DatasetVersionResponse:
    row = await DatasetService(db).patch_version(dataset_id, version_id, payload)
    return _to_version_response(row)


@router.post("/{dataset_id}/versions/{version_id}/validate", response_model=IntegrityValidationResponse)
async def validate_dataset_version(
    dataset_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    _user: UserContext = Depends(get_current_user),
) -> IntegrityValidationResponse:
    service = DatasetService(db)
    version = await service.get_version(dataset_id, version_id)
    dvc = DVCClient(repo_path=str(Path.cwd()), remote_name="minio")
    result = await service.validate_integrity(version, dvc)
    return IntegrityValidationResponse(**result)


@router.get("/{dataset_id}/versions/{version_id}/lineage", response_model=LineageResponse)
async def dataset_version_lineage(
    dataset_id: str,
    version_id: str,
    db: AsyncSession = Depends(get_db),
    _user: UserContext = Depends(get_current_user),
) -> LineageResponse:
    service = DatasetService(db)
    version = await service.get_version(dataset_id, version_id)
    runs, models = await service.lineage(version)
    return LineageResponse(dataset_version=_to_version_response(version), runs=runs, model_versions=models)


@router.post("/{dataset_id}/versions/{version_id}/pull", response_model=DatasetPullResponse)
async def pull_dataset_version(
    dataset_id: str,
    version_id: str,
    payload: DatasetPullRequest,
    db: AsyncSession = Depends(get_db),
    _user: UserContext = Depends(get_current_user),
) -> DatasetPullResponse:
    service = DatasetService(db)
    version = await service.get_version(dataset_id, version_id)
    dvc = DVCClient(repo_path=str(Path.cwd()), remote_name="minio")
    result = await service.pull_version(version, dvc, payload.workspace_path)
    return DatasetPullResponse(**result)


@router.get("/{dataset_id}/diff")
async def diff_dataset_versions(
    dataset_id: str,
    version_a: str = Query(...),
    version_b: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _user: UserContext = Depends(get_current_user),
) -> dict:
    service = DatasetService(db)
    dvc = DVCClient(repo_path=str(Path.cwd()), remote_name="minio")
    return await service.diff_versions(dataset_id, version_a, version_b, dvc)
