"""Amazon S3 / MinIO / Cloudflare R2 provider implementation."""

from __future__ import annotations

from app.services.storage.providers.base_rclone_provider import BaseRcloneProvider
from app.services.storage.registry import register_provider


@register_provider("s3")
class S3Provider(BaseRcloneProvider):
    """
    Amazon S3 (và S3-compatible: MinIO, R2) storage provider via rclone.

    Auth: Access Key + Secret Key (xem AccessKeyAuthStrategy).
    rclone type: s3
    DVC URL: s3://bucket/path (native S3 backend)
    """

    PROVIDER_TYPE = "s3"

    def get_dvc_remote_url(self, remote_name: str, base_path: str) -> str:
        """
        S3 dùng native S3 URL cho DVC thay vì rclone backend.
        DVC có built-in S3 support nên hiệu quả hơn rclone.

        Tuy nhiên nếu là MinIO (custom endpoint), vẫn dùng rclone backend.
        """
        # Dùng rclone backend để đồng nhất credential management
        return f"rclone:{remote_name}:{base_path}"


@register_provider("minio")
class MinioProvider(S3Provider):
    """
    MinIO provider — S3-compatible, chỉ khác ở endpoint và provider hint.
    Kế thừa hoàn toàn từ S3Provider.
    """

    PROVIDER_TYPE = "s3"  # rclone type = s3 cho MinIO


@register_provider("r2")
class CloudflareR2Provider(S3Provider):
    """
    Cloudflare R2 provider — S3-compatible với global CDN.
    Kế thừa hoàn toàn từ S3Provider.
    """

    PROVIDER_TYPE = "s3"  # rclone type = s3 cho R2
