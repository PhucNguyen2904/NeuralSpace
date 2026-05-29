from __future__ import annotations

import argparse
import os

import mlflow
import requests


def _baseline_accuracy() -> float:
    api = os.getenv("PLATFORM_API_BASE_URL", "").rstrip("/")
    token = os.getenv("PLATFORM_API_TOKEN", "")
    model_name = os.getenv("MODEL_NAME", os.getenv("DEFAULT_MODEL_NAME", ""))
    if not api or not model_name:
        return 0.0

    resp = requests.get(
        f"{api}/api/v1/models/{model_name}/versions",
        headers={"Authorization": f"Bearer {token}"} if token else {},
        timeout=20,
    )
    resp.raise_for_status()
    versions = resp.json()
    if isinstance(versions, dict):
        versions = versions.get("items", [])
    prod = next((v for v in versions if str(v.get("stage")) == "Production"), None)
    if not prod:
        return 0.0
    metrics = prod.get("metrics") or {}
    return float(metrics.get("accuracy", 0.0) or 0.0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--max-drop", type=float, default=0.05)
    args = parser.parse_args()

    mlflow.set_tracking_uri(os.getenv("MLFLOW_TRACKING_URI", "http://localhost:5000"))
    client = mlflow.MlflowClient()
    run = client.get_run(args.run_id)

    current_acc = float(run.data.metrics.get("accuracy", 0.0))
    baseline_acc = _baseline_accuracy()

    drop = baseline_acc - current_acc
    client.log_metric(args.run_id, "baseline_accuracy", baseline_acc)
    client.log_metric(args.run_id, "accuracy_drop_vs_baseline", drop)

    if baseline_acc > 0 and drop > args.max_drop:
        raise SystemExit(
            f"Evaluation failed: accuracy drop {drop:.4f} > allowed {args.max_drop:.4f}"
        )

    print(f"evaluate_passed run_id={args.run_id} current={current_acc} baseline={baseline_acc}")


if __name__ == "__main__":
    main()
