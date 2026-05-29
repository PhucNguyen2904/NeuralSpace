from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.integrations.mlflow.client import MLflowClientWrapper  # noqa: E402


class _Obj:
    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)


class _FakeClient:
    def __init__(self, tracking_uri: str):
        self.tracking_uri = tracking_uri
        self._experiments = {}
        self._runs = {}
        self._model_versions = {}

    def get_experiment_by_name(self, name: str):
        return self._experiments.get(name)

    def create_experiment(self, name: str, tags: dict):
        exp = _Obj(experiment_id=str(len(self._experiments) + 1), name=name, tags=tags, lifecycle_stage="active")
        self._experiments[name] = exp
        return exp.experiment_id

    def get_experiment(self, exp_id: str):
        for exp in self._experiments.values():
            if exp.experiment_id == exp_id:
                return exp
        return None

    def search_experiments(self, view_type="ACTIVE_ONLY", max_results=1000):
        _ = (view_type, max_results)
        return list(self._experiments.values())

    def get_run(self, run_id: str):
        return self._runs[run_id]

    def transition_model_version_stage(self, name, version, stage, archive_existing_versions=True):
        _ = archive_existing_versions
        mv = self._model_versions[(name, int(version))]
        mv.current_stage = stage
        return mv

    def set_model_version_tag(self, name, version, key, value):
        self._model_versions[(name, int(version))].tags[key] = value

    def get_model_version(self, name, version):
        return self._model_versions[(name, int(version))]

    def delete_model_version(self, name, version):
        del self._model_versions[(name, int(version))]


@pytest.fixture
def fake_mlflow():
    class _FakeMlflowModule:
        def __init__(self):
            self._tracking_uri = ""
            self._client = _FakeClient("")

        def set_tracking_uri(self, uri: str):
            self._tracking_uri = uri
            self._client.tracking_uri = uri

        def MlflowClient(self, tracking_uri: str):
            self._client.tracking_uri = tracking_uri
            return self._client

        def register_model(self, model_uri: str, model_name: str):
            _ = model_uri
            version = 1
            mv = _Obj(
                name=model_name,
                version=version,
                current_stage="None",
                status="READY",
                run_id="run-1",
                source="s3://mlflow-artifacts/model",
                tags={},
                description="",
            )
            self._client._model_versions[(model_name, version)] = mv
            return mv

    fake = _FakeMlflowModule()
    return fake


@pytest.mark.asyncio
async def test_get_or_create_experiment(fake_mlflow):
    client = MLflowClientWrapper(mlflow_module=fake_mlflow, client=fake_mlflow._client)
    exp = await client.get_or_create_experiment("exp-a", tags={"team": "ml"})
    assert exp.name == "exp-a"
    assert exp.experiment_id == "1"


@pytest.mark.asyncio
async def test_validate_required_tags(fake_mlflow):
    wrapper = MLflowClientWrapper(mlflow_module=fake_mlflow, client=fake_mlflow._client)
    fake_mlflow._client._runs["run-1"] = _Obj(
        info=_Obj(
            run_id="run-1",
            experiment_id="1",
            status="FINISHED",
            start_time=None,
            end_time=None,
            artifact_uri=None,
        ),
        data=_Obj(
            tags={
                "dvc.dataset_version_id": "a",
                "dvc.md5": "b",
                "dvc.git_commit": "c",
                "dvc.repo_url": "d",
                "git.commit": "e",
                "git.branch": "f",
                "platform.created_by": "g",
                "platform.team_id": "h",
            },
            metrics={},
            params={},
        ),
    )
    result = await wrapper.validate_required_tags("run-1")
    assert result.is_valid is True
    assert result.missing_tags == []


@pytest.mark.asyncio
async def test_delete_model_version_only_archived(fake_mlflow):
    wrapper = MLflowClientWrapper(mlflow_module=fake_mlflow, client=fake_mlflow._client)
    fake_mlflow._client._model_versions[("m", 1)] = _Obj(
        name="m",
        version=1,
        current_stage="Production",
        status="READY",
        run_id="r",
        source="s3://x",
        tags={},
        description="",
    )
    with pytest.raises(ValueError):
        await wrapper.delete_model_version("m", 1)

    fake_mlflow._client._model_versions[("m", 1)].current_stage = "Archived"
    await wrapper.delete_model_version("m", 1)
    assert ("m", 1) not in fake_mlflow._client._model_versions
