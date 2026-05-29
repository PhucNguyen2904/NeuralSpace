from __future__ import annotations

from datetime import datetime

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mlops_tracking import ApprovalRequest, AuditLog, ModelDatasetLink, ModelVersion, Run


class ModelVersionRepository:
    @staticmethod
    async def list_models(db: AsyncSession) -> list[str]:
        stmt = select(ModelVersion.mlflow_name).distinct().order_by(ModelVersion.mlflow_name.asc())
        return [row[0] for row in (await db.execute(stmt)).all()]

    @staticmethod
    async def list_versions(db: AsyncSession, model_name: str) -> list[ModelVersion]:
        stmt = (
            select(ModelVersion)
            .where(ModelVersion.mlflow_name == model_name)
            .order_by(ModelVersion.mlflow_version.desc())
        )
        return list((await db.execute(stmt)).scalars().all())

    @staticmethod
    async def get_version(db: AsyncSession, model_name: str, version: int) -> ModelVersion | None:
        stmt = select(ModelVersion).where(
            ModelVersion.mlflow_name == model_name,
            ModelVersion.mlflow_version == version,
        )
        return (await db.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def get_latest_in_stage(db: AsyncSession, model_name: str, stage: str) -> ModelVersion | None:
        stmt = (
            select(ModelVersion)
            .where(ModelVersion.mlflow_name == model_name, ModelVersion.stage == stage)
            .order_by(ModelVersion.created_at.desc())
            .limit(1)
        )
        return (await db.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def get_oldest_in_stage(db: AsyncSession, model_name: str, stage: str) -> ModelVersion | None:
        stmt = (
            select(ModelVersion)
            .where(ModelVersion.mlflow_name == model_name, ModelVersion.stage == stage)
            .order_by(ModelVersion.created_at.asc())
            .limit(1)
        )
        return (await db.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def save(db: AsyncSession, row: ModelVersion) -> ModelVersion:
        await db.commit()
        await db.refresh(row)
        return row


class ApprovalRequestRepository:
    @staticmethod
    async def get_pending_for_model_version(db: AsyncSession, model_version_id: str) -> ApprovalRequest | None:
        stmt = select(ApprovalRequest).where(
            ApprovalRequest.model_version_id == model_version_id,
            ApprovalRequest.status == "pending",
        )
        return (await db.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def get_by_id(db: AsyncSession, request_id: str) -> ApprovalRequest | None:
        return await db.get(ApprovalRequest, request_id)

    @staticmethod
    async def create(db: AsyncSession, row: ApprovalRequest) -> ApprovalRequest:
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row


class ModelLineageRepository:
    @staticmethod
    async def resolve(db: AsyncSession, model_version_id: str) -> tuple[Run | None, list[dict]]:
        mv = await db.get(ModelVersion, model_version_id)
        if mv is None:
            return None, []
        run = await db.get(Run, mv.run_id)
        stmt = (
            select(ModelDatasetLink)
            .where(ModelDatasetLink.model_version_id == model_version_id)
            .order_by(ModelDatasetLink.created_at.desc())
        )
        links = list((await db.execute(stmt)).scalars().all())
        result = [
            {
                "version_id": link.dataset_version_id,
                "link_type": link.link_type,
                "notes": link.notes,
            }
            for link in links
        ]
        return run, result


class AuditLogRepository:
    @staticmethod
    async def list_for_entity(
        db: AsyncSession,
        entity_type: str,
        entity_id: str,
        from_date: datetime | None,
        to_date: datetime | None,
        actions: list[str] | None,
    ) -> list[AuditLog]:
        filters = [AuditLog.entity_type == entity_type, AuditLog.entity_id == entity_id]
        if from_date:
            filters.append(AuditLog.created_at >= from_date)
        if to_date:
            filters.append(AuditLog.created_at <= to_date)
        if actions:
            filters.append(AuditLog.action.in_(actions))

        stmt = select(AuditLog).where(and_(*filters)).order_by(AuditLog.created_at.desc())
        return list((await db.execute(stmt)).scalars().all())

    @staticmethod
    async def add(db: AsyncSession, row: AuditLog) -> None:
        db.add(row)
        await db.commit()
