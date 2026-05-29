from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from src.integrations.mlflow.client import MLflowClientWrapper
from src.integrations.mlflow.sync import MLflowSyncService
from app.dependencies import init_db, close_db, get_db


async def _sync_model(model_name: str, version: int) -> None:
    await init_db()
    try:
        async for db in get_db():
            svc = MLflowSyncService(db_session=db)
            await svc.sync_model_version(model_name, version)
            break
    finally:
        await close_db()


async def _main(run_id: str, model_name: str, output: str) -> None:
    client = MLflowClientWrapper()
    mv = await client.register_model(
        run_id=run_id,
        artifact_path="model",
        model_name=model_name,
        tags={"pipeline": "training"},
        description="Registered by CI pipeline",
    )
    await _sync_model(model_name, mv.version)
    Path(output).write_text(json.dumps({"model_version": mv.version, "model_name": model_name}, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--model-name", required=True)
    parser.add_argument("--output", default="register_output.json")
    args = parser.parse_args()
    asyncio.run(_main(args.run_id, args.model_name, args.output))


if __name__ == "__main__":
    main()
