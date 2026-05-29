from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext
from app.models.mlops_tracking import ApprovalRequest, AuditLog, ModelVersion
from app.repositories.mlops_model_repository import (
    ApprovalRequestRepository,
    AuditLogRepository,
    ModelLineageRepository,
    ModelVersionRepository,
)
from src.integrations.mlflow.client import MLflowClientWrapper


class ModelService:
    def __init__(self, db: AsyncSession, mlflow_client: MLflowClientWrapper | None = None) -> None:
        self.db = db
        self.mlflow = mlflow_client or MLflowClientWrapper()

    async def list_models(self) -> list[str]:
        return await ModelVersionRepository.list_models(self.db)

    async def get_model_versions(self, model_name: str) -> list[ModelVersion]:
        rows = await ModelVersionRepository.list_versions(self.db, model_name)
        if not rows:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
        return rows

    async def get_model_version(self, model_name: str, version: int) -> ModelVersion:
        row = await ModelVersionRepository.get_version(self.db, model_name, version)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model version not found")
        return row

    async def promote(self, model_name: str, version: int, target_stage: str, reason: str, notify_team: bool, user: UserContext) -> tuple[str, str | None]:
        row = await self.get_model_version(model_name, version)
        if row.status != "READY":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Model version is not READY")

        validation = await self.mlflow.validate_required_tags(row.run_id)
        if not validation.is_valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"missing_tags": validation.missing_tags, "invalid_tags": validation.invalid_tags},
            )

        if target_stage == "Production" and not ({"model_approver", "admin"} & set(user.roles)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requires model_approver or admin role")

        if target_stage == "Production":
            pending = await ApprovalRequestRepository.get_pending_for_model_version(self.db, row.id)
            if pending:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Approval request is already pending")

            req = ApprovalRequest(
                id=str(uuid4()),
                model_version_id=row.id,
                requested_by=user.user_id,
                target_stage="Production",
                status="pending",
                auto_approved=False,
            )
            req = await ApprovalRequestRepository.create(self.db, req)
            await self._audit(row.id, "approval_requested", user.user_id, {"reason": reason, "notify_team": notify_team})
            return "pending", req.id

        await self.mlflow.transition_stage(model_name, version, "Staging", comment=reason)
        row.stage = "Staging"
        await ModelVersionRepository.save(self.db, row)
        await self._audit(row.id, "promote", user.user_id, {"target_stage": "Staging", "reason": reason})
        return "auto_approved", None

    async def rollback(self, model_name: str, version: int, reason: str, user: UserContext) -> tuple[int, int]:
        current = await self.get_model_version(model_name, version)
        if current.stage != "Production":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only production version can be rolled back")

        restore = await ModelVersionRepository.get_oldest_in_stage(self.db, model_name, "Staging")
        if restore is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No staging version available for rollback")

        await self.mlflow.transition_stage(model_name, current.mlflow_version, "Archived", comment=reason)
        current.stage = "Archived"
        await ModelVersionRepository.save(self.db, current)

        await self.mlflow.transition_stage(model_name, restore.mlflow_version, "Production", comment=reason)
        restore.stage = "Production"
        restore.approved_by = user.user_id
        restore.approved_at = datetime.now(timezone.utc)
        await ModelVersionRepository.save(self.db, restore)

        await self._audit(current.id, "rollback", user.user_id, {"reason": reason, "restored_version": restore.mlflow_version})
        return current.mlflow_version, restore.mlflow_version

    async def lineage(self, row: ModelVersion) -> dict:
        run, datasets = await ModelLineageRepository.resolve(self.db, row.id)
        return {
            "model_version": {
                "id": row.id,
                "model_name": row.mlflow_name,
                "version": row.mlflow_version,
                "stage": row.stage,
                "status": row.status,
            },
            "training_run": (
                {
                    "run_id": run.id,
                    "mlflow_run_id": run.mlflow_run_id,
                    "status": run.status,
                    "metrics": run.metrics_snapshot,
                }
                if run
                else {}
            ),
            "dataset_versions": datasets,
        }

    async def audit(self, row: ModelVersion, from_date: datetime | None, to_date: datetime | None, actions: list[str] | None) -> list[dict]:
        logs = await AuditLogRepository.list_for_entity(self.db, "model_version", row.id, from_date, to_date, actions)
        return [
            {
                "id": item.id,
                "action": item.action,
                "actor_id": item.actor_id,
                "created_at": item.created_at,
                "metadata": item.metadata_payload,
            }
            for item in logs
        ]

    async def approval_action(self, request_id: str, approve: bool, note: str, user: UserContext) -> str:
        req = await ApprovalRequestRepository.get_by_id(self.db, request_id)
        if req is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Approval request not found")
        if req.status != "pending":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Approval request already resolved")

        req.status = "approved" if approve else "rejected"
        req.reviewer_id = user.user_id
        req.review_note = note
        req.reviewed_at = datetime.now(timezone.utc)
        await self.db.commit()

        mv = await self.db.get(ModelVersion, req.model_version_id)
        if approve and mv:
            await self.mlflow.transition_stage(mv.mlflow_name, mv.mlflow_version, "Production", comment=note)
            mv.stage = "Production"
            mv.approved_by = user.user_id
            mv.approved_at = datetime.now(timezone.utc)
            await ModelVersionRepository.save(self.db, mv)

        return req.status

    async def _audit(self, entity_id: str, action: str, actor_id: str, metadata: dict) -> None:
        await AuditLogRepository.add(
            self.db,
            AuditLog(
                entity_type="model_version",
                entity_id=entity_id,
                action=action,
                actor_id=actor_id,
                metadata_payload=metadata,
            ),
        )
