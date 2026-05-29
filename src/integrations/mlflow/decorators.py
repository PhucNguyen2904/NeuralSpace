"""Decorator utilities for MLflow experiment tracking."""

from __future__ import annotations

import functools
import os
import subprocess
from typing import Any, Callable

import httpx

from .client import MLflowClientWrapper


def track_experiment(
    experiment_name: str,
    dataset_version_id: str,
    auto_register: bool = False,
    model_name: str | None = None,
    artifact_path: str = "model",
):
    """Track training function in MLflow with platform-standard tags."""

    def _decorator(func: Callable):
        @functools.wraps(func)
        def _wrapper(*args, **kwargs):
            import mlflow

            mlflow.set_experiment(experiment_name)
            tags = _build_required_tags(dataset_version_id)

            with mlflow.start_run() as run:
                mlflow.set_tags(tags)
                try:
                    result = func(*args, **kwargs)
                    if isinstance(result, tuple) and len(result) == 2:
                        model, metrics = result
                        if isinstance(metrics, dict):
                            for key, value in metrics.items():
                                if isinstance(value, (int, float)):
                                    mlflow.log_metric(key, float(value))
                        _log_model(model, artifact_path)

                        if auto_register and model_name:
                            wrapper = MLflowClientWrapper()
                            # keep sync-compatible call for script ergonomics
                            import asyncio

                            asyncio.run(
                                wrapper.register_model(
                                    run_id=run.info.run_id,
                                    artifact_path=artifact_path,
                                    model_name=model_name,
                                )
                            )
                    mlflow.end_run(status="FINISHED")
                    return result
                except Exception:
                    mlflow.end_run(status="FAILED")
                    raise

        return _wrapper

    return _decorator


def _build_required_tags(dataset_version_id: str) -> dict[str, str]:
    platform_api = os.getenv("PLATFORM_API_BASE_URL", "").rstrip("/")
    platform_token = os.getenv("PLATFORM_API_TOKEN", "")
    dataset_info = {}
    if platform_api:
        headers = {"Authorization": f"Bearer {platform_token}"} if platform_token else {}
        resp = httpx.get(f"{platform_api}/api/v1/datasets/versions/{dataset_version_id}", headers=headers, timeout=10.0)
        if resp.status_code == 200:
            dataset_info = resp.json()

    return {
        "dvc.dataset_version_id": dataset_version_id,
        "dvc.md5": str(dataset_info.get("dvc_md5", "")),
        "dvc.git_commit": str(dataset_info.get("dvc_commit", "")),
        "dvc.repo_url": str(dataset_info.get("dvc_repo_url", "")),
        "git.commit": _git_value("rev-parse", "HEAD"),
        "git.branch": _git_value("rev-parse", "--abbrev-ref", "HEAD"),
        "platform.created_by": os.getenv("PLATFORM_USER_ID", ""),
        "platform.team_id": os.getenv("PLATFORM_TEAM_ID", ""),
    }


def _git_value(*args: str) -> str:
    try:
        out = subprocess.check_output(["git", *args], stderr=subprocess.DEVNULL)
        return out.decode("utf-8").strip()
    except Exception:
        return ""


def _log_model(model: Any, artifact_path: str) -> None:
    import mlflow

    module_name = model.__class__.__module__.lower()
    if "torch" in module_name:
        import mlflow.pytorch

        mlflow.pytorch.log_model(model, artifact_path)
        return
    try:
        import mlflow.sklearn

        mlflow.sklearn.log_model(model, artifact_path)
    except Exception:
        mlflow.log_text(str(model), f"{artifact_path}/model.txt")
