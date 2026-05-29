"""Sync MLflow metadata into internal PostgreSQL tables."""

from __future__ import annotations

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mlops_tracking import AuditLog, DatasetVersion, ModelDatasetLink, ModelVersion, Run

from .client import MLflowClientWrapper
from .schemas import MLflowWebhookPayload, SyncReport


class MLflowSyncService:
    """Synchronize MLflow experiments/runs/registry into local metadata DB."""

    def __init__(self, db_session: AsyncSession, client: MLflowClientWrapper | None = None) -> None:
        self.db = db_session
        self.client = client or MLflowClientWrapper()

    async def sync_run(self, mlflow_run_id: str) -> Run:
        run = await self.client.get_run(mlflow_run_id)
        dataset_version_id = run.tags.get("dvc.dataset_version_id")

        stmt = select(Run).where(Run.mlflow_run_id == mlflow_run_id)
        existing = (await self.db.execute(stmt)).scalar_one_or_none()
        if existing is None:
            existing = Run(
                id=str(uuid4()),
                mlflow_run_id=run.run_id,
                experiment_id=run.experiment_id,
                name=run.tags.get("mlflow.runName"),
                status=run.status,
                start_time=run.start_time,
                end_time=run.end_time,
                artifact_uri=run.artifact_uri,
                source_type=run.tags.get("mlflow.source.type"),
                source_name=run.tags.get("mlflow.source.name"),
                git_commit=run.tags.get("git.commit"),
                user_id=run.tags.get("platform.created_by") or "00000000-0000-0000-0000-000000000000",
                metrics_snapshot=run.metrics,
                params_snapshot=run.params,
                tags_snapshot=run.tags,
                dvc_dataset_version_id=dataset_version_id,
                dvc_md5=run.tags.get("dvc.md5"),
            )
            self.db.add(existing)
        else:
            existing.status = run.status
            existing.start_time = run.start_time
            existing.end_time = run.end_time
            existing.artifact_uri = run.artifact_uri
            existing.metrics_snapshot = run.metrics
            existing.params_snapshot = run.params
            existing.tags_snapshot = run.tags
            existing.dvc_dataset_version_id = dataset_version_id
            existing.dvc_md5 = run.tags.get("dvc.md5")

        await self.db.commit()
        await self.db.refresh(existing)
        return existing

    async def sync_model_version(self, model_name: str, version: int) -> ModelVersion:
        mv = await self.client._model_version(model_name, version)
        run_id = mv.run_id or ""
        synced_run = await self.sync_run(run_id) if run_id else None
        dataset_version_id = synced_run.dvc_dataset_version_id if synced_run else None

        stmt = select(ModelVersion).where(ModelVersion.mlflow_name == model_name, ModelVersion.mlflow_version == version)
        row = (await self.db.execute(stmt)).scalar_one_or_none()
        if row is None:
            row = ModelVersion(
                id=str(uuid4()),
                mlflow_name=model_name,
                mlflow_version=version,
                run_id=synced_run.id if synced_run else "00000000-0000-0000-0000-000000000000",
                description=mv.description,
                stage=mv.current_stage,
                status="READY" if mv.status == "READY" else "PENDING_REGISTRATION",
                source=mv.source,
                metrics={},
                tags=mv.tags,
                created_by=(synced_run.user_id if synced_run else "00000000-0000-0000-0000-000000000000"),
            )
            self.db.add(row)
        else:
            row.stage = mv.current_stage
            row.description = mv.description
            row.source = mv.source
            row.tags = mv.tags

        await self.db.flush()

        if dataset_version_id:
            ds = await self.db.get(DatasetVersion, dataset_version_id)
            if ds:
                link_stmt = select(ModelDatasetLink).where(
                    ModelDatasetLink.model_version_id == row.id,
                    ModelDatasetLink.dataset_version_id == ds.id,
                    ModelDatasetLink.link_type == "train",
                )
                link = (await self.db.execute(link_stmt)).scalar_one_or_none()
                if link is None:
                    self.db.add(
                        ModelDatasetLink(
                            id=str(uuid4()),
                            model_version_id=row.id,
                            dataset_version_id=ds.id,
                            link_type="train",
                            created_by=row.created_by,
                            notes="synced from mlflow tags",
                        )
                    )

        self.db.add(
            AuditLog(
                entity_type="model_version",
                entity_id=row.id,
                action="sync",
                actor_id=row.created_by,
                metadata_payload={"mlflow_name": model_name, "mlflow_version": version, "stage": mv.current_stage},
            )
        )
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def sync_all_experiments(self) -> SyncReport:
        report = SyncReport()
        experiments = await self.client.list_experiments(view_type="ALL")
        for exp in experiments:
            try:
                runs = await self.client.search_runs([exp.experiment_id], max_results=1000)
                for run in runs:
                    await self.sync_run(run.run_id)
                    report.synced_runs += 1
            except Exception as exc:  # noqa: BLE001
                report.errors.append(f"experiment {exp.experiment_id}: {exc}")

        versions = await self.client.search_model_versions()
        for item in versions:
            try:
                await self.sync_model_version(item.name, item.version)
                report.synced_models += 1
            except Exception as exc:  # noqa: BLE001
                report.errors.append(f"model {item.name} v{item.version}: {exc}")
        return report

    async def handle_stage_transition_webhook(self, payload: MLflowWebhookPayload) -> None:
        model_name = payload.model_name or payload.data.get("model_name", "")
        version_raw = payload.version or payload.data.get("version", "")
        if not model_name or not version_raw:
            return
        await self.sync_model_version(model_name, int(version_raw))
