"""Google Drive provider implementation."""

from __future__ import annotations

from app.services.storage.providers.base_rclone_provider import BaseRcloneProvider
from app.services.storage.registry import register_provider


@register_provider("drive")
class GoogleDriveProvider(BaseRcloneProvider):
    """
    Google Drive storage provider via rclone.

    Auth: OAuth2 (server-side, xem OAuth2AuthStrategy).
    rclone type: drive
    DVC URL: rclone:remote_name:path
    """

    PROVIDER_TYPE = "drive"

    def get_dvc_remote_url(self, remote_name: str, base_path: str) -> str:
        """Google Drive dùng rclone backend cho DVC."""
        return f"rclone:{remote_name}:{base_path}"
