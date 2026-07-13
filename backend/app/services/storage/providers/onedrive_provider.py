"""Microsoft OneDrive provider implementation."""

from __future__ import annotations

from app.services.storage.providers.base_rclone_provider import BaseRcloneProvider
from app.services.storage.registry import register_provider


@register_provider("onedrive")
class OneDriveProvider(BaseRcloneProvider):
    """
    Microsoft OneDrive provider via rclone.

    Auth: OAuth2 (Microsoft Identity Platform).
    rclone type: onedrive
    """

    PROVIDER_TYPE = "onedrive"

    def get_dvc_remote_url(self, remote_name: str, base_path: str) -> str:
        return f"rclone:{remote_name}:{base_path}"
