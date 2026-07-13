"""Dropbox provider implementation."""

from __future__ import annotations

from app.services.storage.providers.base_rclone_provider import BaseRcloneProvider
from app.services.storage.registry import register_provider


@register_provider("dropbox")
class DropboxProvider(BaseRcloneProvider):
    """
    Dropbox provider via rclone.

    Auth: OAuth2 (Dropbox offline access token).
    rclone type: dropbox
    """

    PROVIDER_TYPE = "dropbox"

    def get_dvc_remote_url(self, remote_name: str, base_path: str) -> str:
        return f"rclone:{remote_name}:{base_path}"
