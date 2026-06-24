"""Storage provider factory."""

from __future__ import annotations

from app.models.storage_provider import StorageProvider
from app.services.storage.base import BaseStorageProvider
from app.services.storage.minio_provider import MinioProvider
from app.services.storage.gdrive_provider import GoogleDriveProvider

def get_storage_provider(provider_model: StorageProvider) -> BaseStorageProvider:
    if provider_model.type in ("minio", "s3"):
        return MinioProvider(provider_model.config)
    elif provider_model.type == "gdrive":
        return GoogleDriveProvider(provider_model.config)
    else:
        raise ValueError(f"Unknown storage provider type: {provider_model.type}")
