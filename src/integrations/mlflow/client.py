"""MLflow SDK wrapper for platform integration."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Literal

from app.config import get_settings

from .schemas import MLflowExperiment, MLflowRun, RegisteredModelVersion, TagValidationResult

REQUIRED_TAGS: dict[str, type] = {
    "dvc.dataset_version_id": str,
    "dvc.md5": str,
    "dvc.git_commit": str,
    "dvc.repo_url": str,
    "git.commit": str,
    "git.branch": str,
    "platform.created_by": str,
    "platform.team_id": str,
}


class MLflowClientWrapper:
    """Async-friendly wrapper around MLflow Python client."""

    def __init__(self, mlflow_module=None, client=None) -> None:
        settings = get_settings()
        if mlflow_module is None:
            import mlflow  # lazy import to keep tests independent from runtime dependency

            mlflow_module = mlflow
        mlflow_module.set_tracking_uri(settings.MLFLOW_TRACKING_URI)
        self.mlflow = mlflow_module
        self.client = client or mlflow_module.MlflowClient(tracking_uri=settings.MLFLOW_TRACKING_URI)

    async def get_or_create_experiment(self, name: str, tags: dict | None = None) -> MLflowExperiment:
        tags = tags or {}

        def _run():
            exp = self.client.get_experiment_by_name(name)
            if exp is None:
                exp_id = self.client.create_experiment(name=name, tags=tags)
                exp = self.client.get_experiment(exp_id)
            return exp

        exp = await asyncio.to_thread(_run)
        return MLflowExperiment(
            experiment_id=str(exp.experiment_id),
            name=str(exp.name),
            lifecycle_stage=str(getattr(exp, "lifecycle_stage", "active")),
            artifact_location=getattr(exp, "artifact_location", None),
            tags=dict(getattr(exp, "tags", {}) or {}),
        )

    async def list_experiments(self, view_type: str = "ACTIVE_ONLY") -> list[MLflowExperiment]:
        entities = await asyncio.to_thread(
            self.client.search_experiments,
            view_type=view_type,
            max_results=1000,
        )
        return [
            MLflowExperiment(
                experiment_id=str(item.experiment_id),
                name=str(item.name),
                lifecycle_stage=str(getattr(item, "lifecycle_stage", "active")),
                artifact_location=getattr(item, "artifact_location", None),
                tags=dict(getattr(item, "tags", {}) or {}),
            )
            for item in entities
        ]

    async def get_run(self, run_id: str) -> MLflowRun:
        run = await asyncio.to_thread(self.client.get_run, run_id)
        info = run.info
        data = run.data
        return MLflowRun(
            run_id=str(info.run_id),
            experiment_id=str(info.experiment_id),
            status=str(info.status),
            start_time=_to_dt(info.start_time),
            end_time=_to_dt(info.end_time),
            artifact_uri=getattr(info, "artifact_uri", None),
            tags=dict(data.tags or {}),
            metrics={k: float(v) for k, v in dict(data.metrics or {}).items()},
            params={k: str(v) for k, v in dict(data.params or {}).items()},
        )

    async def search_runs(
        self,
        experiment_ids: list[str],
        filter_string: str = "",
        max_results: int = 100,
        order_by: list[str] | None = None,
    ) -> list[MLflowRun]:
        order_by = order_by or ["start_time DESC"]
        rows = await asyncio.to_thread(
            self.client.search_runs,
            experiment_ids,
            filter_string,
            max_results,
            order_by,
        )
        out: list[MLflowRun] = []
        for run in rows:
            info = run.info
            data = run.data
            out.append(
                MLflowRun(
                    run_id=str(info.run_id),
                    experiment_id=str(info.experiment_id),
                    status=str(info.status),
                    start_time=_to_dt(info.start_time),
                    end_time=_to_dt(info.end_time),
                    artifact_uri=getattr(info, "artifact_uri", None),
                    tags=dict(data.tags or {}),
                    metrics={k: float(v) for k, v in dict(data.metrics or {}).items()},
                    params={k: str(v) for k, v in dict(data.params or {}).items()},
                )
            )
        return out

    async def delete_run(self, run_id: str) -> None:
        await asyncio.to_thread(self.client.delete_run, run_id)

    async def register_model(
        self,
        run_id: str,
        artifact_path: str,
        model_name: str,
        tags: dict | None = None,
        description: str = "",
    ) -> RegisteredModelVersion:
        tags = tags or {}
        model_uri = f"runs:/{run_id}/{artifact_path}"
        mv = await asyncio.to_thread(self.mlflow.register_model, model_uri, model_name)

        deadline = asyncio.get_running_loop().time() + 60
        while asyncio.get_running_loop().time() < deadline:
            current = await asyncio.to_thread(self.client.get_model_version, model_name, mv.version)
            if str(getattr(current, "status", "")).upper() == "READY":
                break
            await asyncio.sleep(2)
        else:
            raise TimeoutError(f"Model registration timeout: {model_name} v{mv.version}")

        for key, value in tags.items():
            await asyncio.to_thread(self.client.set_model_version_tag, model_name, mv.version, key, str(value))
        if description:
            await asyncio.to_thread(self.client.update_model_version, model_name, mv.version, description=description)

        return await self._model_version(model_name, int(mv.version))

    async def transition_stage(
        self,
        model_name: str,
        version: int,
        stage: Literal["Staging", "Production", "Archived", "None"],
        archive_existing: bool = True,
        comment: str = "",
    ) -> RegisteredModelVersion:
        await asyncio.to_thread(
            self.client.transition_model_version_stage,
            name=model_name,
            version=version,
            stage=stage,
            archive_existing_versions=archive_existing,
        )
        if comment:
            await asyncio.to_thread(
                self.client.set_model_version_tag,
                model_name,
                version,
                "platform.transition_comment",
                comment,
            )
        return await self._model_version(model_name, version)

    async def get_latest_versions(
        self,
        model_name: str,
        stages: list[str] | None = None,
    ) -> list[RegisteredModelVersion]:
        stages = stages or ["Production"]
        items = await asyncio.to_thread(self.client.get_latest_versions, model_name, stages)
        return [await self._model_version(model_name, int(item.version)) for item in items]

    async def search_model_versions(self, filter_string: str = "") -> list[RegisteredModelVersion]:
        items = await asyncio.to_thread(self.client.search_model_versions, filter_string)
        result: list[RegisteredModelVersion] = []
        for item in items:
            result.append(
                RegisteredModelVersion(
                    name=str(item.name),
                    version=int(item.version),
                    current_stage=str(getattr(item, "current_stage", "None")),
                    status=str(getattr(item, "status", "READY")),
                    run_id=getattr(item, "run_id", None),
                    source=getattr(item, "source", None),
                    tags=dict(getattr(item, "tags", {}) or {}),
                    description=str(getattr(item, "description", "") or ""),
                )
            )
        return result

    async def delete_model_version(self, model_name: str, version: int) -> None:
        current = await asyncio.to_thread(self.client.get_model_version, model_name, version)
        stage = str(getattr(current, "current_stage", "None"))
        if stage != "Archived":
            raise ValueError(f"Only archived versions can be deleted. Current stage={stage}")
        await asyncio.to_thread(self.client.delete_model_version, model_name, version)

    async def download_artifacts(self, run_id: str, artifact_path: str, local_dir: str) -> str:
        return await asyncio.to_thread(
            self.client.download_artifacts,
            run_id=run_id,
            path=artifact_path,
            dst_path=local_dir,
        )

    async def validate_required_tags(self, run_id: str) -> TagValidationResult:
        run = await self.get_run(run_id)
        missing: list[str] = []
        invalid: list[str] = []
        for key, value_type in REQUIRED_TAGS.items():
            value = run.tags.get(key)
            if value is None or value == "":
                missing.append(key)
                continue
            if not isinstance(value, value_type):
                invalid.append(key)
        return TagValidationResult(is_valid=(not missing and not invalid), missing_tags=missing, invalid_tags=invalid)

    async def _model_version(self, model_name: str, version: int) -> RegisteredModelVersion:
        item = await asyncio.to_thread(self.client.get_model_version, model_name, version)
        return RegisteredModelVersion(
            name=str(item.name),
            version=int(item.version),
            current_stage=str(getattr(item, "current_stage", "None")),
            status=str(getattr(item, "status", "READY")),
            run_id=getattr(item, "run_id", None),
            source=getattr(item, "source", None),
            tags=dict(getattr(item, "tags", {}) or {}),
            description=str(getattr(item, "description", "") or ""),
        )


def _to_dt(epoch_ms: int | None) -> datetime | None:
    if epoch_ms is None:
        return None
    return datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc)
