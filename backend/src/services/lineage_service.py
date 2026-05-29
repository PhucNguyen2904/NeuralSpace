"""Lineage service for bidirectional dataset<->model traceability."""

from __future__ import annotations

import asyncio
from collections import deque
from pathlib import Path
from typing import Literal

from sqlalchemy import Select, and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mlops_tracking import DatasetVersion, ModelDatasetLink, ModelVersion, Run
from app.schemas.lineage import (
    DatasetLineageGraph,
    ImpactedModel,
    LineageEdge,
    LineageGraph,
    LineageNode,
    ModelLineageGraph,
    ReproducibilityReport,
)
from src.integrations.dvc.client import DVCClient


class LineageService:
    def __init__(self, db: AsyncSession, repo_path: str | None = None) -> None:
        self.db = db
        self.repo_path = Path(repo_path or Path.cwd())

    async def get_dataset_lineage(self, dataset_version_id: str) -> DatasetLineageGraph:
        dataset_version = await self.db.get(DatasetVersion, dataset_version_id)
        if dataset_version is None:
            raise ValueError("dataset version not found")

        stmt = (
            select(ModelVersion, Run)
            .join(ModelDatasetLink, ModelDatasetLink.model_version_id == ModelVersion.id)
            .join(Run, Run.id == ModelVersion.run_id)
            .where(ModelDatasetLink.dataset_version_id == dataset_version_id)
            .order_by(ModelVersion.created_at.desc())
        )
        rows = (await self.db.execute(stmt)).all()

        runs_map: dict[str, dict] = {}
        models: list[dict] = []
        for mv, run in rows:
            runs_map[run.id] = {
                "id": run.id,
                "mlflow_run_id": run.mlflow_run_id,
                "status": run.status,
                "start_time": run.start_time,
                "end_time": run.end_time,
            }
            models.append(
                {
                    "id": mv.id,
                    "model_name": mv.mlflow_name,
                    "version": mv.mlflow_version,
                    "stage": mv.stage,
                    "status": mv.status,
                    "run_id": mv.run_id,
                }
            )

        return DatasetLineageGraph(
            dataset_version={
                "id": dataset_version.id,
                "dataset_id": dataset_version.dataset_id,
                "version": dataset_version.version,
                "dvc_md5": dataset_version.dvc_md5,
                "dvc_commit": dataset_version.dvc_commit,
            },
            runs=list(runs_map.values()),
            model_versions=models,
        )

    async def get_model_lineage(self, model_version_id: str) -> ModelLineageGraph:
        model_version = await self.db.get(ModelVersion, model_version_id)
        if model_version is None:
            raise ValueError("model version not found")

        run = await self.db.get(Run, model_version.run_id)
        if run is None:
            raise ValueError("training run not found")

        stmt = (
            select(ModelDatasetLink, DatasetVersion)
            .join(DatasetVersion, DatasetVersion.id == ModelDatasetLink.dataset_version_id)
            .where(ModelDatasetLink.model_version_id == model_version_id)
            .order_by(ModelDatasetLink.created_at.desc())
        )
        rows = (await self.db.execute(stmt)).all()

        dataset_versions = [
            {
                "version_id": dv.id,
                "version": dv.version,
                "dvc_md5": dv.dvc_md5,
                "dataset_id": dv.dataset_id,
                "link_type": link.link_type,
            }
            for link, dv in rows
        ]

        return ModelLineageGraph(
            model_version={
                "id": model_version.id,
                "model_name": model_version.mlflow_name,
                "model_version": model_version.mlflow_version,
                "stage": model_version.stage,
                "status": model_version.status,
            },
            training_run={
                "id": run.id,
                "mlflow_run_id": run.mlflow_run_id,
                "status": run.status,
                "metrics": run.metrics_snapshot or {},
                "params": run.params_snapshot or {},
            },
            dataset_versions=dataset_versions,
        )

    async def get_full_lineage_graph(
        self,
        root_type: Literal["dataset_version", "model_version"],
        root_id: str,
        depth: int = 3,
    ) -> LineageGraph:
        nodes: dict[str, LineageNode] = {}
        edges: list[LineageEdge] = []

        queue: deque[tuple[str, str, int]] = deque([(root_type, root_id, 0)])
        seen: set[tuple[str, str]] = set()

        while queue:
            node_type, node_id, level = queue.popleft()
            if (node_type, node_id) in seen or level > depth:
                continue
            seen.add((node_type, node_id))

            if node_type == "dataset_version":
                dv = await self.db.get(DatasetVersion, node_id)
                if dv is None:
                    continue
                nodes[f"dv:{dv.id}"] = LineageNode(
                    id=f"dv:{dv.id}",
                    type="dataset_version",
                    label=f"Dataset {dv.dataset_id} {dv.version}",
                    metadata={"dvc_md5": dv.dvc_md5, "dvc_commit": dv.dvc_commit},
                    status=dv.status,
                )
                stmt = (
                    select(ModelDatasetLink, ModelVersion, Run)
                    .join(ModelVersion, ModelVersion.id == ModelDatasetLink.model_version_id)
                    .join(Run, Run.id == ModelVersion.run_id)
                    .where(ModelDatasetLink.dataset_version_id == dv.id)
                )
                for link, mv, run in (await self.db.execute(stmt)).all():
                    run_key = f"run:{run.id}"
                    mv_key = f"mv:{mv.id}"
                    nodes[run_key] = LineageNode(
                        id=run_key,
                        type="run",
                        label=run.mlflow_run_id,
                        metadata={"status": run.status},
                        status=run.status,
                    )
                    nodes[mv_key] = LineageNode(
                        id=mv_key,
                        type="model_version",
                        label=f"{mv.mlflow_name} v{mv.mlflow_version}",
                        metadata={"stage": mv.stage},
                        status=mv.stage,
                    )
                    edges.append(LineageEdge(**{"from": f"dv:{dv.id}", "to": run_key, "label": "used_for_training", "metadata": {"link_type": link.link_type}}))
                    edges.append(LineageEdge(**{"from": run_key, "to": mv_key, "label": "produced", "metadata": {}}))
                    queue.append(("model_version", mv.id, level + 1))

            elif node_type == "model_version":
                mv = await self.db.get(ModelVersion, node_id)
                if mv is None:
                    continue
                mv_key = f"mv:{mv.id}"
                nodes[mv_key] = LineageNode(
                    id=mv_key,
                    type="model_version",
                    label=f"{mv.mlflow_name} v{mv.mlflow_version}",
                    metadata={"stage": mv.stage},
                    status=mv.stage,
                )

                run = await self.db.get(Run, mv.run_id)
                if run:
                    run_key = f"run:{run.id}"
                    nodes[run_key] = LineageNode(
                        id=run_key,
                        type="run",
                        label=run.mlflow_run_id,
                        metadata={"status": run.status},
                        status=run.status,
                    )
                    edges.append(LineageEdge(**{"from": run_key, "to": mv_key, "label": "produced", "metadata": {}}))

                stmt = (
                    select(ModelDatasetLink, DatasetVersion)
                    .join(DatasetVersion, DatasetVersion.id == ModelDatasetLink.dataset_version_id)
                    .where(ModelDatasetLink.model_version_id == mv.id)
                )
                for link, dv in (await self.db.execute(stmt)).all():
                    dv_key = f"dv:{dv.id}"
                    nodes[dv_key] = LineageNode(
                        id=dv_key,
                        type="dataset_version",
                        label=f"Dataset {dv.dataset_id} {dv.version}",
                        metadata={"dvc_md5": dv.dvc_md5, "dvc_commit": dv.dvc_commit},
                        status=dv.status,
                    )
                    if run:
                        edges.append(LineageEdge(**{"from": dv_key, "to": f"run:{run.id}", "label": "used_for_training", "metadata": {"link_type": link.link_type}}))
                    queue.append(("dataset_version", dv.id, level + 1))

        return LineageGraph(nodes=list(nodes.values()), edges=edges)

    async def find_impacted_models(self, dataset_version_id: str, production_only: bool = True) -> list[ImpactedModel]:
        filters = [ModelDatasetLink.dataset_version_id == dataset_version_id]
        if production_only:
            filters.append(ModelVersion.stage == "Production")

        stmt = (
            select(ModelVersion, Run)
            .join(ModelDatasetLink, ModelDatasetLink.model_version_id == ModelVersion.id)
            .join(Run, Run.id == ModelVersion.run_id)
            .where(and_(*filters))
            .order_by(ModelVersion.created_at.desc())
        )
        out: list[ImpactedModel] = []
        for mv, run in (await self.db.execute(stmt)).all():
            metrics = run.metrics_snapshot or {}
            accuracy = _as_float(metrics.get("accuracy") or metrics.get("acc"))
            out.append(
                ImpactedModel(
                    model_name=mv.mlflow_name,
                    model_version=mv.mlflow_version,
                    stage=mv.stage,
                    trained_at=run.end_time or run.start_time,
                    accuracy=accuracy,
                    risk_level=_risk_level(mv.stage),
                )
            )
        return out

    async def verify_reproducibility(self, model_version_id: str) -> ReproducibilityReport:
        lineage = await self.get_model_lineage(model_version_id)
        training_run = lineage.training_run
        dataset_versions = lineage.dataset_versions

        data_available = await self._check_data_available(dataset_versions)
        code_available = await self._check_code_available(training_run)
        params_complete = bool(training_run.get("params"))
        env_logged = self._check_env_logged(training_run)

        checks = {
            "data_available": data_available,
            "code_available": code_available,
            "params_complete": params_complete,
            "env_logged": env_logged,
        }
        missing_items = [k for k, ok in checks.items() if not ok]
        reproducible = all(checks.values())

        steps = []
        if reproducible:
            steps = [
                "Checkout training code at logged git.commit",
                "dvc pull dataset version files from MinIO",
                "Install logged environment dependencies",
                "Run training command with logged params",
            ]

        return ReproducibilityReport(
            is_reproducible=reproducible,
            checks=checks,
            missing_items=missing_items,
            reproduction_steps=steps,
        )

    async def explain_lineage_queries(self) -> dict[str, str]:
        """Return query plan guidance for ops docs (PostgreSQL)."""
        return {
            "dataset_lineage": (
                "Use ix_mlops_model_dataset_links_model_dataset_type + ix_mlops_model_versions_stage + "
                "ix_mlops_runs_dvc_dataset_version_id; expect nested loop on filtered dataset_version_id then "
                "index lookup to model_versions and runs."
            ),
            "model_lineage": (
                "Use uq_mlops_model_versions_mlflow_name_version for model lookup, then unique index on "
                "model_dataset_links(model_version_id,dataset_version_id,link_type) for dataset joins."
            ),
            "impact_analysis": (
                "Filter on dataset_version_id and stage='Production' to leverage ix_mlops_model_versions_stage; "
                "keep ORDER BY created_at DESC with index support if needed add composite index (stage,created_at)."
            ),
        }

    async def _check_data_available(self, dataset_versions: list[dict]) -> bool:
        client = DVCClient(repo_path=str(self.repo_path), remote_name="minio")
        for dv in dataset_versions:
            version_id = dv.get("version_id")
            row = await self.db.get(DatasetVersion, version_id) if version_id else None
            if row is None or not row.storage_path:
                return False
            try:
                await client.get_version_info(row.storage_path)
            except Exception:
                return False
        return True

    async def _check_code_available(self, training_run: dict) -> bool:
        params = training_run or {}
        git_commit = None
        if isinstance(params, dict):
            # git commit may appear in params or tags snapshot depending on logger setup
            git_commit = params.get("git_commit") or params.get("git.commit")
        if not git_commit:
            return False

        proc = await asyncio.create_subprocess_exec(
            "git",
            "cat-file",
            "-e",
            f"{git_commit}^{{commit}}",
            cwd=str(self.repo_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        return proc.returncode == 0

    @staticmethod
    def _check_env_logged(training_run: dict) -> bool:
        tags = training_run or {}
        markers = ["requirements", "conda", "pip", "python"]
        merged = " ".join(str(v).lower() for v in tags.values()) if isinstance(tags, dict) else ""
        return any(m in merged for m in markers)


def _as_float(value) -> float | None:
    try:
        return float(value)
    except Exception:
        return None


def _risk_level(stage: str) -> Literal["high", "medium", "low"]:
    if stage == "Production":
        return "high"
    if stage == "Staging":
        return "medium"
    return "low"
