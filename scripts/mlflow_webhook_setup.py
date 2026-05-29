"""Setup MLflow webhooks for model stage transitions."""

from __future__ import annotations

import argparse

import httpx


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create MLflow webhook for stage transitions")
    parser.add_argument("--mlflow-uri", required=True, help="MLflow tracking URI, e.g. http://localhost:5000")
    parser.add_argument("--target-url", required=True, help="Platform webhook endpoint URL")
    parser.add_argument("--model-name", default="", help="Optional model name filter")
    parser.add_argument("--secret", default="", help="Optional secret header value")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = {
        "events": ["MODEL_VERSION_TRANSITIONED_STAGE"],
        "job_spec": {"url": args.target_url},
    }
    if args.model_name:
        payload["model_name"] = args.model_name

    headers = {}
    if args.secret:
        headers["X-MLflow-Webhook-Secret"] = args.secret

    url = f"{args.mlflow_uri.rstrip('/')}/api/2.0/mlflow/registry-webhooks/create"
    resp = httpx.post(url, json=payload, headers=headers, timeout=15.0)
    resp.raise_for_status()
    print(resp.text)


if __name__ == "__main__":
    main()
