from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext
from app.models.mlops_tracking import DatasetVersion, MLDataset


class DatasetVersionService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_upload_version(
        self,
        *,
        dataset_id: str,
        dataset_name: str,
        description: str | None,
        dataset_type: str,
        tags: list[str],
        version: str,
        storage_path: str,
        size_bytes: int,
        item_count: int,
        schema_snapshot: dict,
        split_info: dict,
        metadata_snapshot: dict,
        validation_summary: dict,
        validation_status: str,
        format: str,
        task_type: str,
        class_count: int | None,
        dvc_md5: str | None,
        dvc_commit: str | None,
        dvc_storage_path: str | None,
        dvc_profile_id: str | None,
        user: UserContext,
    ) -> tuple[MLDataset, DatasetVersion]:
        mlops_dataset = (
            await self.db.execute(select(MLDataset).where(MLDataset.name == dataset_name))
        ).scalar_one_or_none()
        if mlops_dataset is None:
            mlops_dataset = MLDataset(
                id=str(uuid4()),
                name=dataset_name,
                description=description,
                type=dataset_type,
                owner_id=user.user_id,
                team_id=None,
                dvc_profile_id=dvc_profile_id,
                dvc_repo_url=None,
                storage_path=dvc_storage_path or storage_path,
                tags=tags,
                status="active",
            )
            self.db.add(mlops_dataset)
            await self.db.flush()
        else:
            mlops_dataset.storage_path = dvc_storage_path or storage_path
            if dvc_profile_id is not None:
                mlops_dataset.dvc_profile_id = dvc_profile_id

        await self.db.execute(
            update(DatasetVersion)
            .where(DatasetVersion.dataset_id == mlops_dataset.id, DatasetVersion.is_latest.is_(True))
            .values(is_latest=False)
        )
        dataset_version = DatasetVersion(
            id=str(uuid4()),
            dataset_id=mlops_dataset.id,
            version=version,
            dvc_md5=dvc_md5,
            dvc_commit=dvc_commit,
            dvc_profile_id=dvc_profile_id,
            storage_path=dvc_storage_path or storage_path,
            size_bytes=size_bytes,
            item_count=item_count,
            schema_snapshot=schema_snapshot,
            split_info=split_info,
            changelog="Uploaded through dataset upload pipeline",
            is_latest=True,
            status="validated" if validation_status in {"passed", "warning"} else "draft",
            created_by=user.user_id,
            metadata_uri=metadata_snapshot.get("storage", {}).get("metadata_uri"),
            validation_report_uri=metadata_snapshot.get("storage", {}).get("validation_report_uri"),
            validation_status=validation_status,
            validation_summary=validation_summary,
            metadata_snapshot=metadata_snapshot,
            format=format,
            task_type=task_type,
        )
        self.db.add(dataset_version)
        await self.db.commit()
        await self.db.refresh(mlops_dataset)
        await self.db.refresh(dataset_version)
        return mlops_dataset, dataset_version
