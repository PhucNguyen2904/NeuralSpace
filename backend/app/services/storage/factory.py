"""Storage provider factory."""

from __future__ import annotations

from app.models.storage_connection import StorageConnection
from app.services.storage.base import BaseStorageProvider
from app.services.storage.minio_provider import MinioProvider
from app.services.storage.gdrive_provider import GoogleDriveProvider

def get_storage_provider(provider_model: StorageConnection) -> BaseStorageProvider:
    if provider_model.provider in ("minio", "s3"):
        import json
        from app.core.security import decrypt_credentials
        params = {}
        if provider_model.encrypted_credentials:
            try:
                decrypted = decrypt_credentials(provider_model.encrypted_credentials)
                params = json.loads(decrypted)
            except Exception:
                pass
        return MinioProvider(params)
    elif provider_model.provider == "gdrive":
        return GoogleDriveProvider({})
    else:
        raise ValueError(f"Unknown storage provider type: {provider_model.provider}")
