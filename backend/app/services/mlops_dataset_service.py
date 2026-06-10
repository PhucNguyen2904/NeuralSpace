from __future__ import annotations

import asyncio
import shutil
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext
from app.models.mlops_tracking import DatasetVersion, MLDataset
from app.repositories.mlops_dataset_repository import DatasetVersionRepository, MLDatasetRepository
from app.schemas.mlops_dataset import (
    DatasetCreateRequest,
    DatasetUpdateRequest,
    DatasetVersionPatchRequest,
    DatasetVersionTrackRequest,
)
from src.integrations.dvc.client import DVCClient
from src.integrations.dvc.exceptions import DVCCommandError, DVCRepositoryError
from src.integrations.dvc.sync import DVCSyncService


class DatasetService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_dataset(self, payload: DatasetCreateRequest, user: UserContext) -> MLDataset:
        existing = await MLDatasetRepository.get_by_name(self.db, payload.name)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Dataset name already exists")
        row = MLDataset(
            id=str(uuid4()),
            name=payload.name,
            description=payload.description,
            type=payload.type,
            owner_id=user.user_id,
            team_id=payload.team_id,
            dvc_repo_url=payload.dvc_repo_url,
            storage_path=payload.storage_path,
            tags=payload.tags,
            status="active",
        )
        return await MLDatasetRepository.create(self.db, row)

    async def list_datasets(self, page: int, page_size: int, status_filter: str | None, q: str | None) -> tuple[list[MLDataset], int]:
        return await MLDatasetRepository.list(self.db, page=page, page_size=page_size, status=status_filter, q=q)

    async def get_dataset(self, dataset_id: str) -> MLDataset:
        row = await MLDatasetRepository.get_by_id(self.db, dataset_id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
        return row

    async def update_dataset(self, dataset_id: str, payload: DatasetUpdateRequest, user: UserContext) -> MLDataset:
        row = await self.get_dataset(dataset_id)
        self._check_write_permission(row, user)
        if payload.description is not None:
            row.description = payload.description
        if payload.tags is not None:
            row.tags = payload.tags
        if payload.status is not None:
            row.status = payload.status
        return await MLDatasetRepository.save(self.db, row)

    async def archive_dataset(self, dataset_id: str, user: UserContext) -> MLDataset:
        row = await self.get_dataset(dataset_id)
        self._check_write_permission(row, user)
        row.status = "archived"
        return await MLDatasetRepository.save(self.db, row)

    async def list_versions(self, dataset_id: str) -> list[DatasetVersion]:
        await self.get_dataset(dataset_id)
        return await DatasetVersionRepository.list_by_dataset(self.db, dataset_id)

    async def get_version(self, dataset_id: str, version_id: str) -> DatasetVersion:
        row = await DatasetVersionRepository.get(self.db, version_id)
        if row is None or row.dataset_id != dataset_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset version not found")
        return row

    async def patch_version(self, dataset_id: str, version_id: str, payload: DatasetVersionPatchRequest) -> DatasetVersion:
        row = await self.get_version(dataset_id, version_id)
        if payload.changelog is not None:
            row.changelog = payload.changelog
        if payload.status is not None:
            row.status = payload.status
        return await DatasetVersionRepository.save(self.db, row)

    async def validate_integrity(self, version: DatasetVersion, dvc_client: DVCClient) -> dict:
        sync = DVCSyncService(self.db, dvc_client)
        result = await sync.validate_version_integrity(version.id)
        return {
            "is_valid": result.is_valid,
            "checked_at": result.checked_at,
            "details": {
                "db_md5": result.db_md5,
                "actual_md5": result.actual_md5,
            },
        }

    async def lineage(self, version: DatasetVersion) -> tuple[list[dict], list[dict]]:
        runs, models = await DatasetVersionRepository.lineage(self.db, version.id)
        run_items = [
            {
                "run_id": run.id,
                "mlflow_run_id": run.mlflow_run_id,
                "status": run.status,
                "start_time": run.start_time,
                "end_time": run.end_time,
            }
            for run in runs
        ]
        model_items = [
            {
                "model_version_id": mv.id,
                "model_name": mv.mlflow_name,
                "version": mv.mlflow_version,
                "stage": mv.stage,
            }
            for mv in models
        ]
        return run_items, model_items

    async def pull_version(self, version: DatasetVersion, dvc_client: DVCClient, target_path: str) -> dict:
        if not version.storage_path:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Dataset version has no DVC storage_path")
        await dvc_client.pull(version.storage_path, target_path)
        return {"workspace_path": target_path, "size_bytes": int(version.size_bytes or 0)}

    async def diff_versions(self, dataset_id: str, version_a: str, version_b: str, dvc_client: DVCClient) -> dict:
        versions = await DatasetVersionRepository.list_by_dataset(self.db, dataset_id)
        by_version = {v.version: v for v in versions}
        a = by_version.get(version_a)
        b = by_version.get(version_b)
        if a is None or b is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or both versions not found")
        if not a.storage_path or not a.dvc_commit or not b.dvc_commit:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Missing DVC metadata for diff")
        diff = await dvc_client.diff(a.dvc_commit, b.dvc_commit, a.storage_path)
        return diff.model_dump()

    async def track_new_version(
        self,
        *,
        dataset: MLDataset,
        file_bytes: bytes,
        filename: str,
        commit_message: str,
        changelog: str,
        item_count: int,
        version_status: str,
        split_info: dict | None,
        schema_snapshot: dict | None,
        user: UserContext,
        dvc_repo_path: str,
        dvc_remote_name: str,
    ) -> DatasetVersion:
        """
        Upload *file_bytes* into the DVC working repo, run `dvc add` + `git commit`
        + `dvc push`, then persist a new DatasetVersion row in Postgres.

        The staging file is always cleaned up, even on failure.
        """
        # ── 1. Validate DVC repo ─────────────────────────────────────────────
        try:
            dvc_client = DVCClient(dvc_repo_path, remote_name=dvc_remote_name)
        except DVCRepositoryError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"DVC repo not ready: {exc}",
            ) from exc

        # ── 2. Write file to a safe staging path inside the DVC repo ────────
        # Structure: <dvc_repo>/{dataset_id}/{upload_uuid}/{original_filename}
        safe_name = Path(filename).name or "upload"
        staging_dir = Path(dvc_repo_path) / dataset.id / uuid4().hex
        staging_dir.mkdir(parents=True, exist_ok=True)
        staging_file = staging_dir / safe_name

        try:
            await asyncio.to_thread(staging_file.write_bytes, file_bytes)

            # ── 3. DVC track: add → git commit → push ────────────────────────
            try:
                track_result = await dvc_client.track(
                    local_path=str(staging_file),
                    dataset_name=dataset.name,
                    commit_message=commit_message or f"chore(data): track version for {dataset.name}",
                )
            except DVCCommandError as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"DVC tracking failed: {exc.stderr or exc}",
                ) from exc

            # ── 4. Sync metadata into DB (marks old version as not-latest) ───
            sync = DVCSyncService(self.db, dvc_client)
            new_version = await sync.sync_dataset_version(
                dataset_id=UUID(dataset.id),
                dvc_track_result=track_result,
                created_by=UUID(user.user_id),
                changelog=changelog,
                item_count=item_count,
                status=version_status,
                split_info=split_info,
                schema_snapshot=schema_snapshot,
            )

            # ── 5. Update parent MLDataset metadata ──────────────────────────
            dataset.storage_path = track_result.dvc_file_path
            dataset.updated_at = datetime.now(timezone.utc)
            await self.db.commit()
            await self.db.refresh(dataset)

            return new_version

        finally:
            # ── 6. Cleanup staging directory (best-effort) ───────────────────
            await asyncio.to_thread(shutil.rmtree, str(staging_dir), True)

    def _check_write_permission(self, row: MLDataset, user: UserContext) -> None:
        if row.owner_id != user.user_id and "admin" not in user.roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permission")


def ensure_staging_file_exists(local_path: str) -> None:
    if not Path(local_path).exists():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Staging file does not exist")
