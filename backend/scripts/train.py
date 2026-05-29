from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import mlflow
import pandas as pd

from src.integrations.mlflow.decorators import track_experiment


@track_experiment(
    experiment_name="NeuralSpace Training",
    dataset_version_id=os.getenv("PLATFORM_DATASET_VERSION_ID", "unknown"),
    auto_register=False,
)
def train_impl(dataset_version_id: str):
    # sample training stub
    metrics = {
        "accuracy": 0.93,
        "loss": 0.14,
    }
    model = {"name": "dummy-model", "dataset_version_id": dataset_version_id}
    return model, metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-version-id", required=True)
    parser.add_argument("--output", default="run_output.json")
    args = parser.parse_args()

    mlflow.set_tracking_uri(os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000"))
    train_impl(args.dataset_version_id)
    exp = mlflow.get_experiment_by_name("NeuralSpace Training")
    if exp is None:
        raise SystemExit("Experiment not found after training")
    runs: pd.DataFrame = mlflow.search_runs(
        experiment_ids=[exp.experiment_id],
        max_results=1,
        order_by=["start_time DESC"],
    )
    if runs.empty:
        raise SystemExit("No MLflow run found")
    output = {"mlflow_run_id": str(runs.iloc[0]["run_id"])}

    Path(args.output).write_text(json.dumps(output, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
