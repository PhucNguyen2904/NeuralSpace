from __future__ import annotations

from datetime import datetime

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mlops_tracking import DatasetVersion, MLDataset, ModelDatasetLink, ModelVersion, Run


class MLDatasetRepository:
    @staticmethod
    async def create(db: AsyncSession, row: MLDataset) -> MLDataset:
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row

    @staticmethod
    async def get_by_id(db: AsyncSession, dataset_id: str) -> MLDataset | None:
        return await db.get(MLDataset, dataset_id)

    @staticmethod
    async def get_by_name(db: AsyncSession, name: str) -> MLDataset | None:
        stmt = select(MLDataset).where(func.lower(MLDataset.name) == name.lower())
        return (await db.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def list(
        db: AsyncSession,
        page: int,
        page_size: int,
        status: str | None = None,
        q: str | None = None,
    ) -> tuple[list[MLDataset], int]:
        filters = []
        if status:
            filters.append(MLDataset.status == status)
        if q:
            filters.append(func.lower(MLDataset.name).like(f"%{q.lower()}%"))

        stmt = select(MLDataset)
        count_stmt = select(func.count(MLDataset.id))
        if filters:
            cond = and_(*filters)
            stmt = stmt.where(cond)
            count_stmt = count_stmt.where(cond)

        stmt = stmt.order_by(MLDataset.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
        rows = (await db.execute(stmt)).scalars().all()
        total = int((await db.execute(count_stmt)).scalar() or 0)
        return list(rows), total

    @staticmethod
    async def save(db: AsyncSession, row: MLDataset) -> MLDataset:
        await db.commit()
        await db.refresh(row)
        return row


class DatasetVersionRepository:
    @staticmethod
    async def get(db: AsyncSession, version_id: str) -> DatasetVersion | None:
        return await db.get(DatasetVersion, version_id)

    @staticmethod
    async def list_by_dataset(db: AsyncSession, dataset_id: str) -> list[DatasetVersion]:
        stmt = select(DatasetVersion).where(DatasetVersion.dataset_id == dataset_id).order_by(DatasetVersion.created_at.desc())
        return list((await db.execute(stmt)).scalars().all())

    @staticmethod
    async def latest_by_dataset(db: AsyncSession, dataset_id: str) -> DatasetVersion | None:
        stmt = (
            select(DatasetVersion)
            .where(DatasetVersion.dataset_id == dataset_id)
            .order_by(DatasetVersion.created_at.desc())
            .limit(1)
        )
        return (await db.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def lineage(db: AsyncSession, dataset_version_id: str) -> tuple[list[Run], list[ModelVersion]]:
        runs_stmt = select(Run).where(Run.dvc_dataset_version_id == dataset_version_id)
        runs = list((await db.execute(runs_stmt)).scalars().all())
        model_stmt = (
            select(ModelVersion)
            .join(ModelDatasetLink, ModelDatasetLink.model_version_id == ModelVersion.id)
            .where(ModelDatasetLink.dataset_version_id == dataset_version_id)
        )
        models = list((await db.execute(model_stmt)).scalars().all())
        return runs, models

    @staticmethod
    async def save(db: AsyncSession, row: DatasetVersion) -> DatasetVersion:
        await db.commit()
        await db.refresh(row)
        return row

    @staticmethod
    async def mark_not_latest(db: AsyncSession, dataset_id: str) -> None:
        rows = await DatasetVersionRepository.list_by_dataset(db, dataset_id)
        for row in rows:
            row.is_latest = False
        await db.flush()


def utcnow() -> datetime:
    return datetime.utcnow()
