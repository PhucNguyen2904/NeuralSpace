"""
Access Key authentication strategy.

Dùng cho S3, MinIO, Cloudflare R2, Azure Blob (connection string), và các
storage providers dùng static credentials (không có OAuth2 flow).
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.storage.auth.base_auth import AuthCredential, BaseAuthStrategy
from app.core.storage_exceptions import AuthenticationFailed

logger = logging.getLogger(__name__)


class AccessKeyAuthStrategy(BaseAuthStrategy):
    """
    Authentication dùng Access Key + Secret Key.

    Validate credential bằng cách thực hiện một test operation nhỏ
    (list buckets hoặc head bucket) thay vì tin tưởng params mù quáng.
    """

    # rclone type mapping
    RCLONE_TYPE_MAP = {
        "s3": "s3",
        "minio": "s3",   # MinIO dùng S3-compatible, rclone type = s3
        "r2": "s3",      # Cloudflare R2 dùng S3-compatible
        "b2": "b2",      # Backblaze B2
    }

    def __init__(self, provider_type: str):
        self.provider_type = provider_type

    async def authenticate(self, input_params: dict[str, Any]) -> AuthCredential:
        """
        Validate access key bằng cách thử list / head bucket.

        input_params cho S3/MinIO:
            - access_key_id: AWS Access Key hoặc MinIO username
            - secret_access_key: AWS Secret Key hoặc MinIO password
            - region: us-east-1 (optional, default empty cho MinIO)
            - endpoint_url: http://minio:9000 (chỉ cho MinIO/R2/tương thích)
            - bucket: tên bucket (optional, dùng để validate)
        """
        required = ["access_key_id", "secret_access_key"]
        missing = [k for k in required if not input_params.get(k)]
        if missing:
            raise AuthenticationFailed(
                self.provider_type,
                f"Missing required params: {', '.join(missing)}"
            )

        # Validate bằng boto3 (lightweight)
        try:
            await self._validate_s3_credentials(input_params)
        except AuthenticationFailed:
            raise
        except Exception as e:
            raise AuthenticationFailed(self.provider_type, str(e))

        # Build rclone params
        raw_params = self._build_rclone_params(input_params)

        return AuthCredential(
            provider_type=self.provider_type,
            credential_type="access_key",
            raw_params=raw_params,
            expires_at=None,    # Access key không hết hạn
            refresh_token=None,
            metadata={
                "access_key_id": input_params["access_key_id"],
                "region": input_params.get("region", ""),
                "endpoint_url": input_params.get("endpoint_url", ""),
            },
        )

    def _build_rclone_params(self, input_params: dict[str, Any]) -> dict[str, Any]:
        """Chuyển đổi input_params sang format rclone config."""
        rclone_params: dict[str, Any] = {
            "access_key_id": input_params["access_key_id"],
            "secret_access_key": input_params["secret_access_key"],
        }

        region = input_params.get("region", "")
        if region:
            rclone_params["region"] = region

        endpoint_url = input_params.get("endpoint_url", "")
        if endpoint_url:
            # rclone S3 endpoint param
            if not endpoint_url.startswith("http"):
                endpoint_url = f"http://{endpoint_url}"
            rclone_params["endpoint"] = endpoint_url

        provider_hint = input_params.get("provider_hint", "")
        if provider_hint:
            # rclone s3 provider field: "Minio", "Cloudflare", "AWS", etc.
            rclone_params["provider"] = provider_hint
        elif self.provider_type in ("minio",):
            rclone_params["provider"] = "Minio"
        elif self.provider_type == "r2":
            rclone_params["provider"] = "Cloudflare"

        # path_style cho MinIO (non-AWS)
        if self.provider_type in ("minio", "r2") or endpoint_url:
            rclone_params["force_path_style"] = "true"

        return rclone_params

    async def _validate_s3_credentials(self, params: dict[str, Any]) -> None:
        """Test credentials bằng boto3 list_buckets hoặc head_bucket."""
        import asyncio

        def _sync_validate():
            import boto3
            from botocore.config import Config
            from botocore.exceptions import ClientError, NoCredentialsError

            endpoint_url = params.get("endpoint_url")
            if endpoint_url and not endpoint_url.startswith("http"):
                endpoint_url = f"http://{endpoint_url}"

            try:
                s3 = boto3.client(
                    "s3",
                    aws_access_key_id=params["access_key_id"],
                    aws_secret_access_key=params["secret_access_key"],
                    region_name=params.get("region") or None,
                    endpoint_url=endpoint_url or None,
                    config=Config(signature_version="s3v4", connect_timeout=10, read_timeout=10),
                )

                bucket = params.get("bucket")
                if bucket:
                    # Head bucket thay vì list — ít quyền hơn
                    s3.head_bucket(Bucket=bucket)
                else:
                    # List buckets để validate credentials
                    s3.list_buckets()

            except ClientError as e:
                code = e.response.get("Error", {}).get("Code", "")
                if code in ("InvalidAccessKeyId", "SignatureDoesNotMatch", "403", "AuthFailure"):
                    raise AuthenticationFailed(
                        params.get("provider", "s3"),
                        f"Invalid credentials: {code}"
                    )
                if code in ("NoSuchBucket", "404"):
                    # Credentials valid nhưng bucket không tồn tại — OK để connect
                    return
                raise AuthenticationFailed(
                    params.get("provider", "s3"),
                    f"Storage validation failed: {e}"
                )
            except NoCredentialsError:
                raise AuthenticationFailed(params.get("provider", "s3"), "No credentials provided")
            except Exception as e:
                # Connection error / endpoint không đúng
                if "Connection" in str(e) or "Timeout" in str(e):
                    raise AuthenticationFailed(
                        params.get("provider", "s3"),
                        f"Cannot connect to storage endpoint: {e}"
                    )
                raise

        await asyncio.to_thread(_sync_validate)

    async def refresh(self, credential: AuthCredential) -> AuthCredential:
        """Access key không hỗ trợ refresh."""
        raise NotImplementedError(
            "Access key credentials do not support automatic refresh. "
            "Please re-enter credentials manually."
        )

    async def validate(self, credential: AuthCredential) -> bool:
        """Validate access key còn hoạt động."""
        try:
            await self._validate_s3_credentials({
                **credential.raw_params,
                "access_key_id": credential.raw_params.get("access_key_id", ""),
                "secret_access_key": credential.raw_params.get("secret_access_key", ""),
            })
            return True
        except Exception:
            return False

    async def revoke(self, credential: AuthCredential) -> None:
        """Access key không cần revoke — user tự xóa trên AWS console."""
        logger.info(
            "Access key credential removed (no remote revocation needed)",
            provider=self.provider_type,
        )
