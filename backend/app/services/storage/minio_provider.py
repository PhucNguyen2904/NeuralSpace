"""MinIO/S3 storage provider implementation."""

from __future__ import annotations
import aiobotocore.session
from typing import Any
from pathlib import Path
from botocore.config import Config

from app.services.storage.base import BaseStorageProvider

class MinioProvider(BaseStorageProvider):
    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.endpoint_url = config.get("endpoint") or config.get("endpoint_url")
        self.bucket = config.get("bucket")
        self.access_key = config.get("access_key") or config.get("access_key_id")
        self.secret_key = config.get("secret_key") or config.get("secret_access_key")

    def _get_client(self):
        session = aiobotocore.session.get_session()
        effective_endpoint = self.endpoint_url
        if effective_endpoint and not effective_endpoint.startswith("http"):
            effective_endpoint = f"http://{effective_endpoint}"
        
        return session.create_client(
            "s3",
            endpoint_url=effective_endpoint,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            config=Config(signature_version="s3v4")
        )

    async def upload(self, file_path: str, dest_path: str) -> str:
        async with self._get_client() as s3:
            path = Path(file_path)
            with path.open("rb") as f:
                await s3.put_object(
                    Bucket=self.bucket,
                    Key=dest_path,
                    Body=f.read()
                )
        return f"s3://{self.bucket}/{dest_path}"

    async def upload_bytes(self, data: bytes, dest_path: str, content_type: str = "application/octet-stream") -> str:
        async with self._get_client() as s3:
            await s3.put_object(
                Bucket=self.bucket,
                Key=dest_path,
                Body=data,
                ContentType=content_type,
            )
        return f"s3://{self.bucket}/{dest_path}"

    async def download(self, path: str) -> bytes:
        async with self._get_client() as s3:
            response = await s3.get_object(Bucket=self.bucket, Key=path)
            async with response["Body"] as stream:
                return await stream.read()

    async def delete(self, path: str) -> None:
        async with self._get_client() as s3:
            await s3.delete_object(Bucket=self.bucket, Key=path)
