"""Storage providers package — imports trigger @register_provider decorators."""

from app.services.storage.providers.gdrive_provider import GoogleDriveProvider
from app.services.storage.providers.s3_provider import S3Provider
from app.services.storage.providers.onedrive_provider import OneDriveProvider
from app.services.storage.providers.dropbox_provider import DropboxProvider

__all__ = [
    "GoogleDriveProvider",
    "S3Provider",
    "OneDriveProvider",
    "DropboxProvider",
]
