"""Lineage service for bidirectional dataset<->model traceability."""

from __future__ import annotations

import asyncio
from collections import deque
from pathlib import Path
from typing import Literal

from sqlalchemy import Select, and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mlops_tracking import DatasetVersion, MLDataset, ModelDatasetLink, ModelVersion, Run
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

    async def get_ui_lineage_graph(
        self,
        root_type: Literal["dataset", "model"] | None = None,
        root_id: str | None = None,
        depth: int = 3,
    ) -> dict:
        stmt = (
            select(ModelDatasetLink, DatasetVersion, MLDataset, ModelVersion, Run)
            .join(DatasetVersion, DatasetVersion.id == ModelDatasetLink.dataset_version_id)
            .join(MLDataset, MLDataset.id == DatasetVersion.dataset_id)
            .join(ModelVersion, ModelVersion.id == ModelDatasetLink.model_version_id)
            .join(Run, Run.id == ModelVersion.run_id)
            .order_by(MLDataset.name.asc(), Run.start_time.desc(), ModelVersion.mlflow_name.asc())
        )
        rows = (await self.db.execute(stmt)).all()

        nodes: dict[str, dict] = {}
        edges: dict[str, dict] = {}
        adjacency: dict[str, set[str]] = {}

        def add_edge(source: str, target: str, relation: str) -> None:
            edge_id = f"{source}->{target}:{relation}"
            edges[edge_id] = {"id": edge_id, "source": source, "target": target, "relation": relation}
            adjacency.setdefault(source, set()).add(target)
            adjacency.setdefault(target, set()).add(source)

        for link, dataset_version, dataset, model_version, run in rows:
            dataset_node_id = dataset_version.id
            run_node_id = run.id
            model_node_id = model_version.id

            nodes[dataset_node_id] = {
                "id": dataset_node_id,
                "type": "dataset",
                "dataset_id": dataset.id,
                "version_id": dataset_version.id,
                "name": dataset.name,
                "version": dataset_version.version,
                "status": dataset_version.status,
                "dvcMd5": dataset_version.dvc_md5,
                "created_at": dataset_version.created_at.isoformat() if dataset_version.created_at else None,
                "size": _format_size(dataset_version.size_bytes),
                "items": dataset_version.item_count,
            }
            nodes[run_node_id] = {
                "id": run_node_id,
                "type": "run",
                "name": run.name or run.mlflow_run_id,
                "status": run.status,
                "metrics": run.metrics_snapshot or {},
                "started_at": run.start_time.isoformat() if run.start_time else None,
                "user": str(run.user_id),
            }
            nodes[model_node_id] = {
                "id": model_node_id,
                "type": "model",
                "model_version_id": model_version.id,
                "model_id": (model_version.tags or {}).get("model_registry_id"),
                "name": model_version.mlflow_name,
                "version": _model_display_version(model_version),
                "stage": model_version.stage,
                "status": model_version.status,
                "metrics": model_version.metrics or run.metrics_snapshot or {},
                "created_at": model_version.created_at.isoformat() if model_version.created_at else None,
                "user": str(model_version.created_by),
            }
            add_edge(dataset_node_id, run_node_id, "used_for_training")
            add_edge(run_node_id, model_node_id, "produced")

        await self._add_colab_lineage_nodes(nodes, edges, adjacency)

        visible_ids = set(nodes)
        if root_id and root_id in nodes:
            visible_ids = _collect_lineage_ids(root_id, nodes, list(edges.values()), depth)

        return {
            "nodes": [node for node_id, node in nodes.items() if node_id in visible_ids],
            "edges": [
                edge
                for edge in edges.values()
                if edge["source"] in visible_ids and edge["target"] in visible_ids
            ],
        }

    async def _add_colab_lineage_nodes(
        self,
        nodes: dict[str, dict],
        edges: dict[str, dict],
        adjacency: dict[str, set[str]],
    ) -> None:
        def add_edge(source: str, target: str, relation: str) -> None:
            edge_id = f"{source}->{target}:{relation}"
            edges[edge_id] = {"id": edge_id, "source": source, "target": target, "relation": relation}
            adjacency.setdefault(source, set()).add(target)
            adjacency.setdefault(target, set()).add(source)

        runs = list(
            (
                await self.db.execute(
                    select(Run)
                    .where(Run.tags_snapshot.is_not(None))
                    .order_by(Run.start_time.desc().nullslast(), Run.created_at.desc())
                )
            )
            .scalars()
            .all()
        )

        colab_runs: list[Run] = []
        dataset_ids: set[str] = set()
        model_ids: set[str] = set()
        for run in runs:
            lineage = _colab_lineage(run)
            if not lineage:
                continue
            colab_runs.append(run)
            for item in list(lineage.get("inputs") or []) + list(lineage.get("outputs") or []):
                asset_type = item.get("asset_type")
                asset_id = item.get("asset_id")
                if not asset_id:
                    continue
                if asset_type == "dataset":
                    dataset_ids.add(asset_id)
                elif asset_type == "model":
                    model_ids.add(asset_id)

        if not colab_runs:
            return

        run_ids = [run.id for run in colab_runs]
        model_versions_by_run: dict[str, list[ModelVersion]] = {run_id: [] for run_id in run_ids}
        model_version_rows = list(
            (
                await self.db.execute(
                    select(ModelVersion)
                    .where(ModelVersion.run_id.in_(run_ids))
                    .order_by(ModelVersion.created_at.asc())
                )
            )
            .scalars()
            .all()
        )
        for model_version in model_version_rows:
            model_versions_by_run.setdefault(model_version.run_id, []).append(model_version)

        if dataset_ids:
            datasets = (
                await self.db.execute(select(DatasetVersion).where(DatasetVersion.id.in_(dataset_ids)))
            ).scalars().all()
            datasets_by_id = {str(d.id): d for d in datasets}
        else:
            datasets_by_id = {}

        if model_ids:
            models = (
                await self.db.execute(select(ModelVersion).where(ModelVersion.id.in_(model_ids)))
            ).scalars().all()
            models_by_id = {str(m.id): m for m in models}
        else:
            models_by_id = {}

        for run in colab_runs:
            run_node_id = run.id
            nodes[run_node_id] = {
                "id": run_node_id,
                "type": "run",
                "name": run.name or run.mlflow_run_id,
                "status": run.status,
                "metrics": run.metrics_snapshot or {},
                "started_at": run.start_time.isoformat() if run.start_time else None,
                "user": str(run.user_id),
            }
            lineage = _colab_lineage(run)
            for item in lineage.get("inputs") or []:
                asset_id = item.get("asset_id")
                if not asset_id:
                    continue
                if item.get("asset_type") == "dataset":
                    dataset = datasets_by_id.get(asset_id)
                    nodes[asset_id] = {
                        "id": asset_id,
                        "type": "dataset",
                        "dataset_id": asset_id,
                        "name": dataset.version if dataset else asset_id,
                        "version": "workspace",
                        "status": "validated",
                        "created_at": dataset.created_at.isoformat() if dataset and dataset.created_at else None,
                        "size": _format_size(dataset.size_bytes) if dataset else None,
                        "items": dataset.item_count if dataset else None,
                    }
                    add_edge(asset_id, run_node_id, "used_for_training")
                elif item.get("asset_type") == "model":
                    model = models_by_id.get(asset_id)
                    nodes[asset_id] = {
                        "id": asset_id,
                        "type": "model",
                        "model_id": asset_id,
                        "name": model.name if model else asset_id,
                        "version": model.version or "workspace" if model else "workspace",
                        "stage": "None",
                        "status": model.status if model else "ready",
                        "metrics": model.all_metrics if model else {},
                        "created_at": model.created_at.isoformat() if model and model.created_at else None,
                        "user": str(model.created_by) if model and model.created_by else None,
                    }
                    add_edge(asset_id, run_node_id, "used_for_training")

            for model_version in model_versions_by_run.get(run.id, []):
                model_node_id = model_version.id
                nodes[model_node_id] = {
                    "id": model_node_id,
                    "type": "model",
                    "model_version_id": model_version.id,
                    "model_id": (model_version.tags or {}).get("model_registry_id"),
                    "name": model_version.mlflow_name,
                    "version": _model_display_version(model_version),
                    "stage": model_version.stage,
                    "status": model_version.status,
                    "metrics": model_version.metrics or run.metrics_snapshot or {},
                    "created_at": model_version.created_at.isoformat() if model_version.created_at else None,
                    "user": str(model_version.created_by),
                }
                add_edge(run_node_id, model_node_id, "produced")

            for item in lineage.get("outputs") or []:
                asset_id = item.get("asset_id")
                if not asset_id or item.get("asset_type") != "model":
                    continue
                if nodes.get(asset_id, {}).get("type") == "model":
                    if run.metrics_snapshot:
                        nodes[asset_id]["metrics"] = run.metrics_snapshot
                    add_edge(run_node_id, asset_id, "produced")
                    continue
                model = models_by_id.get(asset_id)
                nodes[asset_id] = {
                    "id": asset_id,
                    "type": "model",
                    "model_id": asset_id,
                    "name": model.name if model else asset_id,
                    "version": model.version or "workspace" if model else "workspace",
                    "stage": "None",
                    "status": model.status if model else "ready",
                    "metrics": run.metrics_snapshot or (model.all_metrics if model else {}),
                    "created_at": model.created_at.isoformat() if model and model.created_at else None,
                    "user": str(model.created_by) if model and model.created_by else None,
                }
                add_edge(run_node_id, asset_id, "produced")

    async def impact_summary(self, dataset_version_id: str) -> dict:
        stmt = (
            select(ModelVersion.id)
            .join(ModelDatasetLink, ModelDatasetLink.model_version_id == ModelVersion.id)
            .where(
                ModelDatasetLink.dataset_version_id == dataset_version_id,
                ModelVersion.stage == "Production",
            )
            .order_by(ModelVersion.created_at.desc())
        )
        model_ids = [row[0] for row in (await self.db.execute(stmt)).all()]
        return {
            "affected_model_ids": model_ids,
            "affected_production_count": len(model_ids),
            "message": f"{len(model_ids)} Production models impacted",
        }

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


def _colab_lineage(run: Run) -> dict:
    tags = run.tags_snapshot or {}
    if not isinstance(tags, dict):
        return {}
    lineage = tags.get("colab_lineage") or {}
    if not isinstance(lineage, dict):
        return {}
    return lineage


def _risk_level(stage: str) -> Literal["high", "medium", "low"]:
    if stage == "Production":
        return "high"
    if stage == "Staging":
        return "medium"
    return "low"


def _format_size(size_bytes: int | None) -> str | None:
    if size_bytes is None:
        return None
    value = float(size_bytes)
    units = ["B", "KB", "MB", "GB", "TB"]
    unit_index = 0
    while value >= 1024 and unit_index < len(units) - 1:
        value /= 1024
        unit_index += 1
    return f"{value:.1f} {units[unit_index]}"


def _model_display_version(model_version: ModelVersion) -> str:
    return f"v{model_version.mlflow_version}"


def _collect_lineage_ids(root_id: str, nodes: dict[str, dict], edges: list[dict], depth: int) -> set[str]:
    root = nodes[root_id]
    visible = {root_id}

    if root["type"] == "dataset":
        run_ids = {edge["target"] for edge in edges if edge["source"] == root_id and edge["relation"] == "used_for_training"}
        visible.update(run_ids)
        if depth >= 2:
            visible.update(
                edge["target"]
                for edge in edges
                if edge["source"] in run_ids and edge["relation"] == "produced"
            )
            visible.update(
                edge["source"]
                for edge in edges
                if edge["target"] in run_ids
                and edge["relation"] == "used_for_training"
                and nodes.get(edge["source"], {}).get("type") == "model"
            )
        return visible

    if root["type"] == "model":
        run_ids = {edge["source"] for edge in edges if edge["target"] == root_id and edge["relation"] == "produced"}
        visible.update(run_ids)
        if depth >= 2:
            visible.update(
                edge["source"]
                for edge in edges
                if edge["target"] in run_ids and edge["relation"] == "used_for_training"
            )
        return visible

    related_edges = [edge for edge in edges if root_id in {edge["source"], edge["target"]}]
    for edge in related_edges:
        visible.add(edge["source"])
        visible.add(edge["target"])
    return visible
