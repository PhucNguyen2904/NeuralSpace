from __future__ import annotations

from datetime import datetime, timezone

import pytest

from src.services.lineage_service import LineageService


class _Obj:
    def __init__(self, data: dict):
        for k, v in data.items():
            setattr(self, k, v)


class _ExecResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeSession:
    def __init__(self):
        self.by_id = {}
        self.exec_rows = []

    async def get(self, model, key):
        return self.by_id.get((model.__name__, key))

    async def execute(self, stmt):
        return _ExecResult(self.exec_rows.pop(0) if self.exec_rows else [])


@pytest.mark.asyncio
async def test_get_dataset_lineage() -> None:
    from app.models.mlops_tracking import DatasetVersion, ModelVersion, Run

    db = _FakeSession()
    dv = _Obj({
        "id": "dv1", "dataset_id": "d1", "version": "v1.0", "dvc_md5": "abc", "dvc_commit": "c1"
    })
    mv = _Obj({"id": "mv1", "mlflow_name": "m", "mlflow_version": 2, "stage": "Production", "status": "READY", "run_id": "r1", "created_at": datetime.now(timezone.utc)})
    run = _Obj({"id": "r1", "mlflow_run_id": "run-1", "status": "FINISHED", "start_time": None, "end_time": None})
    db.by_id[(DatasetVersion.__name__, "dv1")] = dv
    db.exec_rows.append([(mv, run)])

    out = await LineageService(db).get_dataset_lineage("dv1")
    assert out.dataset_version["id"] == "dv1"
    assert out.model_versions[0]["model_name"] == "m"


@pytest.mark.asyncio
async def test_get_model_lineage() -> None:
    from app.models.mlops_tracking import ModelVersion, Run

    db = _FakeSession()
    mv = _Obj({"id": "mv1", "mlflow_name": "m", "mlflow_version": 1, "stage": "Staging", "status": "READY", "run_id": "r1"})
    run = _Obj({"id": "r1", "mlflow_run_id": "run-1", "status": "FINISHED", "metrics_snapshot": {"accuracy": 0.9}, "params_snapshot": {"lr": "0.1"}})
    link = _Obj({"link_type": "train", "created_at": datetime.now(timezone.utc)})
    dv = _Obj({"id": "dv1", "version": "v1.0", "dvc_md5": "abc", "dataset_id": "d1"})

    db.by_id[(ModelVersion.__name__, "mv1")] = mv
    db.by_id[(Run.__name__, "r1")] = run
    db.exec_rows.append([(link, dv)])

    out = await LineageService(db).get_model_lineage("mv1")
    assert out.model_version["model_name"] == "m"
    assert out.dataset_versions[0]["link_type"] == "train"


@pytest.mark.asyncio
async def test_find_impacted_models() -> None:
    mv = _Obj({"mlflow_name": "m", "mlflow_version": 3, "stage": "Production", "created_at": datetime.now(timezone.utc)})
    run = _Obj({"end_time": datetime.now(timezone.utc), "start_time": None, "metrics_snapshot": {"accuracy": 0.97}})
    db = _FakeSession()
    db.exec_rows.append([(mv, run)])

    out = await LineageService(db).find_impacted_models("dv1")
    assert out[0].risk_level == "high"
    assert out[0].accuracy == 0.97


@pytest.mark.asyncio
async def test_verify_reproducibility(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _FakeSession()
    svc = LineageService(db)

    async def _fake_model_lineage(_id):
        return type("X", (), {
            "training_run": {"params": {"lr": 0.1}, "git.commit": "abc123", "env_info": "pip requirements logged"},
            "dataset_versions": [{"version_id": "dv1"}],
        })()

    async def _ok_data(_d):
        return True

    async def _ok_code(_r):
        return True

    monkeypatch.setattr(svc, "get_model_lineage", _fake_model_lineage)
    monkeypatch.setattr(svc, "_check_data_available", _ok_data)
    monkeypatch.setattr(svc, "_check_code_available", _ok_code)

    out = await svc.verify_reproducibility("mv1")
    assert out.is_reproducible is True
    assert out.checks["env_logged"] is True


@pytest.mark.asyncio
async def test_full_lineage_graph(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.models.mlops_tracking import DatasetVersion, ModelVersion, Run

    db = _FakeSession()
    svc = LineageService(db)

    dv = _Obj({"id": "dv1", "dataset_id": "d1", "version": "v1.0", "dvc_md5": "abc", "dvc_commit": "c1", "status": "validated"})
    mv = _Obj({"id": "mv1", "mlflow_name": "m", "mlflow_version": 1, "stage": "Staging", "status": "READY", "run_id": "r1"})
    run = _Obj({"id": "r1", "mlflow_run_id": "run-1", "status": "FINISHED"})
    link = _Obj({"link_type": "train"})

    db.by_id[(DatasetVersion.__name__, "dv1")] = dv
    db.by_id[(ModelVersion.__name__, "mv1")] = mv
    db.by_id[(Run.__name__, "r1")] = run
    db.exec_rows.append([(link, mv, run)])
    db.exec_rows.append([(link, dv)])

    out = await svc.get_full_lineage_graph("dataset_version", "dv1", depth=2)
    assert any(node.type == "dataset_version" for node in out.nodes)
    assert any(edge.label == "produced" for edge in out.edges)
