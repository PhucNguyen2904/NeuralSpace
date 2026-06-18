from __future__ import annotations

import json
from pathlib import Path

from app.clients.minio_client import MinIOClient, get_minio_client


class DatasetStorageService:
    def __init__(self, client: MinIOClient | None = None) -> None:
        self.client = client or get_minio_client()

    async def upload_raw(self, *, dataset_id: str, version: str, filename: str, data: bytes, content_type: str) -> str:
        object_name = f"datasets/{dataset_id}/versions/{version}/raw/{Path(filename).name}"
        return await self.client.upload_bytes(object_name, data, content_type=content_type)

    async def upload_json(self, *, dataset_id: str, version: str, filename: str, payload: dict) -> str:
        object_name = f"datasets/{dataset_id}/versions/{version}/{filename}"
        data = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        return await self.client.upload_bytes(object_name, data, content_type="application/json")

    async def upload_directory(self, *, dataset_id: str, version: str, root: Path) -> str:
        prefix = f"datasets/{dataset_id}/versions/{version}/extracted"
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(root).as_posix()
            await self.client.upload_bytes(
                f"{prefix}/{rel}",
                path.read_bytes(),
                content_type="application/octet-stream",
            )
        return f"{prefix}/"

    async def delete_version_prefix(self, *, dataset_id: str, version: str) -> int:
        return await self.client.delete_prefix(f"datasets/{dataset_id}/versions/{version}/")
