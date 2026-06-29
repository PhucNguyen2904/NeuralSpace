"""MinIO client wrapper for object storage operations."""

from __future__ import annotations

import asyncio
import hashlib
import io
from typing import BinaryIO

from minio import Minio
from minio.error import S3Error

from app.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class MinIOClient:
    """Async-compatible MinIO client wrapping the synchronous minio-python SDK."""

    def __init__(self) -> None:
        settings = get_settings()
        self._client = Minio(
            endpoint=settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=False,  # Internal connection is always plain HTTP
            region="us-east-1",
        )
        self._bucket = settings.MINIO_BUCKET
        self._public_endpoint = settings.MINIO_PUBLIC_ENDPOINT
        self._public_secure = settings.MINIO_PUBLIC_SECURE

    # ------------------------------------------------------------------
    # Bucket helpers
    # ------------------------------------------------------------------

    async def ensure_bucket(self, bucket: str | None = None) -> None:
        """Create the bucket if it does not exist."""
        target = bucket or self._bucket

        def _ensure() -> None:
            if not self._client.bucket_exists(target):
                self._client.make_bucket(target)
                logger.info("Created MinIO bucket", bucket=target)

        await asyncio.to_thread(_ensure)

    # ------------------------------------------------------------------
    # Upload
    # ------------------------------------------------------------------

    async def upload_bytes(
        self,
        object_name: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        bucket: str | None = None,
    ) -> str:
        """Upload raw bytes and return the object's internal storage path."""
        target = bucket or self._bucket
        await self.ensure_bucket(target)
        size = len(data)
        stream = io.BytesIO(data)

        def _put() -> None:
            self._client.put_object(
                bucket_name=target,
                object_name=object_name,
                data=stream,
                length=size,
                content_type=content_type,
            )

        await asyncio.to_thread(_put)
        storage_path = f"s3://{target}/{object_name}"
        logger.info(
            "Uploaded object to MinIO",
            bucket=target,
            object_name=object_name,
            size_bytes=size,
        )
        return storage_path

    async def upload_fileobj(
        self,
        object_name: str,
        fileobj: BinaryIO,
        size: int,
        content_type: str = "application/octet-stream",
        bucket: str | None = None,
    ) -> str:
        """Upload a file-like object and return the object's storage path."""
        target = bucket or self._bucket
        await self.ensure_bucket(target)

        def _put() -> None:
            self._client.put_object(
                bucket_name=target,
                object_name=object_name,
                data=fileobj,
                length=size,
                content_type=content_type,
            )

        await asyncio.to_thread(_put)
        storage_path = f"s3://{target}/{object_name}"
        logger.info(
            "Uploaded object to MinIO",
            bucket=target,
            object_name=object_name,
            size_bytes=size,
        )
        return storage_path

    # ------------------------------------------------------------------
    # Presigned URL
    # ------------------------------------------------------------------

    def presigned_get_url(
        self,
        object_name: str,
        expires_seconds: int = 3600,
        bucket: str | None = None,
    ) -> str:
        """Return a presigned GET URL pointing to the public endpoint."""
        target = bucket or self._bucket
        from datetime import timedelta
        
        settings = get_settings()
        
        # If the public endpoint differs from the internal one,
        # we must use a client initialized with the public endpoint.
        # Otherwise, the Host header included in the AWS v4 signature calculation
        # won't match the one sent by the user, leading to a SignatureDoesNotMatch error.
        if settings.MINIO_PUBLIC_ENDPOINT != settings.MINIO_ENDPOINT:
            from minio import Minio
            public_client = Minio(
                endpoint=settings.MINIO_PUBLIC_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_PUBLIC_SECURE,
                region="us-east-1",
            )
            return public_client.presigned_get_object(
                bucket_name=target,
                object_name=object_name,
                expires=timedelta(seconds=expires_seconds),
            )

        return self._client.presigned_get_object(
            bucket_name=target,
            object_name=object_name,
            expires=timedelta(seconds=expires_seconds),
        )

    async def get_object_data(self, object_name: str, bucket: str | None = None) -> bytes:
        """Fetch an object's raw bytes from MinIO."""
        target = bucket or self._bucket

        def _get() -> bytes:
            response = None
            try:
                response = self._client.get_object(target, object_name)
                return response.read()
            finally:
                if response:
                    response.close()
                    response.release_conn()

        return await asyncio.to_thread(_get)

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    async def delete_object(self, object_name: str, bucket: str | None = None) -> None:
        target = bucket or self._bucket

        def _remove() -> None:
            try:
                self._client.remove_object(target, object_name)
            except S3Error as exc:
                if exc.code != "NoSuchKey":
                    raise

        await asyncio.to_thread(_remove)

    async def delete_prefix(self, prefix: str, bucket: str | None = None) -> int:
        """Delete every object under a prefix and return the delete count."""
        target = bucket or self._bucket

        def _remove_prefix() -> int:
            count = 0
            for item in self._client.list_objects(target, prefix=prefix, recursive=True):
                self._client.remove_object(target, item.object_name)
                count += 1
            return count

        return await asyncio.to_thread(_remove_prefix)

    # ------------------------------------------------------------------
    # Stat / exists
    # ------------------------------------------------------------------

    async def object_exists(self, object_name: str, bucket: str | None = None) -> bool:
        target = bucket or self._bucket

        def _stat() -> bool:
            try:
                self._client.stat_object(target, object_name)
                return True
            except S3Error:
                return False

        return await asyncio.to_thread(_stat)


def md5_hex(data: bytes) -> str:
    """Compute the MD5 hex digest of bytes (used as DVC-compatible hash)."""
    return hashlib.md5(data).hexdigest()


# ---------------------------------------------------------------------------
# Module-level singleton – initialised lazily on first access
# ---------------------------------------------------------------------------

_minio_client: MinIOClient | None = None


def get_minio_client() -> MinIOClient:
    """Return the application-wide MinIO client singleton."""
    global _minio_client
    if _minio_client is None:
        _minio_client = MinIOClient()
    return _minio_client
