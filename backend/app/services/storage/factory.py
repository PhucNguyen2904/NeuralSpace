"""Storage provider factory."""

from __future__ import annotations

from app.models.storage_connection import StorageConnection
from app.services.storage.base import BaseStorageProvider
from app.services.storage.minio_provider import MinioProvider
from app.services.storage.gdrive_provider import GoogleDriveProvider

def get_storage_provider(provider_model: StorageConnection) -> BaseStorageProvider:
    if provider_model.provider in ("minio", "s3"):
        # Temporary stub to prevent crashes until fully migrated to rclone
        return MinioProvider({})
    elif provider_model.provider == "gdrive":
        return GoogleDriveProvider({})
    else:
        raise ValueError(f"Unknown storage provider type: {provider_model.provider}")
