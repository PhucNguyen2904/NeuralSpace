"""Track and push a dataset with DVC."""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from src.integrations.dvc.client import DVCClient


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Track dataset with DVC")
    parser.add_argument("--repo-path", required=True, help="Git repo path containing .dvc/")
    parser.add_argument("--local-path", required=True, help="Dataset file/folder path")
    parser.add_argument("--dataset-name", required=True, help="Logical dataset name")
    parser.add_argument("--message", required=True, help="Git commit message")
    parser.add_argument("--remote-name", default="minio", help="DVC remote name")
    return parser.parse_args()


async def main() -> None:
    args = parse_args()
    repo = Path(args.repo_path).resolve()
    local = Path(args.local_path).resolve()
    client = DVCClient(repo_path=str(repo), remote_name=args.remote_name)
    result = await client.track(
        local_path=str(local),
        dataset_name=args.dataset_name,
        commit_message=args.message,
    )
    print(result.model_dump_json(indent=2))


if __name__ == "__main__":
    asyncio.run(main())
