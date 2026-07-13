"""Base authentication strategy for storage providers."""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class AuthCredential:
    """
    Chuẩn hóa credential output — bất kể loại auth nào.
    
    Đây là DTO duy nhất truyền qua các layer. Không bao giờ truyền
    raw dict credentials qua layer boundary.
    """

    provider_type: str
    """Provider type khớp với rclone type: 'drive', 's3', 'onedrive', 'dropbox'"""

    credential_type: str
    """'oauth2' | 'access_key' | 'service_account' | 'sas_token'"""

    raw_params: dict[str, Any]
    """
    Params đầy đủ để sinh rclone config section.
    Ví dụ OAuth2: {'token': '{"access_token": "ya29...", "refresh_token": "1//..."}', ...}
    Ví dụ S3: {'access_key_id': '...', 'secret_access_key': '...', 'region': '...'}
    """

    expires_at: datetime | None = None
    """
    Thời điểm hết hạn của credential.
    None = không hết hạn (S3 key, service account).
    Dùng để Token Manager biết khi nào cần refresh.
    """

    refresh_token: str | None = None
    """
    Refresh token (chỉ OAuth2). None = không hỗ trợ refresh.
    LƯU Ý: field này chỉ dùng trong memory — không lưu riêng vào DB.
    Refresh token được embed trong raw_params và mã hóa cùng encrypted_credentials.
    """

    metadata: dict[str, Any] = field(default_factory=dict)
    """Extra metadata: email, display_name từ provider, bucket list, v.v."""

    def is_expired(self, buffer_seconds: int = 300) -> bool:
        """Kiểm tra credential có hết hạn (hoặc sắp hết hạn trong buffer_seconds) không."""
        if self.expires_at is None:
            return False
        from datetime import timezone
        now = datetime.now(timezone.utc)
        from datetime import timedelta
        return now >= self.expires_at - timedelta(seconds=buffer_seconds)

    def to_encrypted_blob(self) -> str:
        """Serialize và encrypt toàn bộ credential để lưu vào DB."""
        from app.core.security import encrypt_credentials
        payload = {
            "provider_type": self.provider_type,
            "credential_type": self.credential_type,
            "raw_params": self.raw_params,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "refresh_token": self.refresh_token,
            "metadata": self.metadata,
        }
        return encrypt_credentials(json.dumps(payload))

    @classmethod
    def from_encrypted_blob(cls, blob: str) -> "AuthCredential":
        """Decrypt và deserialize credential từ DB."""
        from app.core.security import decrypt_credentials
        raw = json.loads(decrypt_credentials(blob))
        expires_at = None
        if raw.get("expires_at"):
            expires_at = datetime.fromisoformat(raw["expires_at"])
        return cls(
            provider_type=raw["provider_type"],
            credential_type=raw["credential_type"],
            raw_params=raw["raw_params"],
            expires_at=expires_at,
            refresh_token=raw.get("refresh_token"),
            metadata=raw.get("metadata", {}),
        )


class BaseAuthStrategy(ABC):
    """
    Abstract base class cho tất cả authentication strategies.
    
    Mỗi provider type triển khai strategy phù hợp với auth mechanism của mình.
    StorageService và API layer KHÔNG biết chi tiết auth — chỉ gọi qua interface này.
    """

    @abstractmethod
    async def authenticate(self, input_params: dict[str, Any]) -> AuthCredential:
        """
        Thực hiện xác thực lần đầu và trả về AuthCredential chuẩn hóa.
        
        Đối với OAuth2: exchange code → token.
        Đối với Access Key: validate key bằng test operation.
        
        Raises:
            AuthenticationFailed: nếu xác thực thất bại.
        """
        ...

    @abstractmethod
    async def refresh(self, credential: AuthCredential) -> AuthCredential:
        """
        Refresh credential và trả về credential mới.
        
        Chỉ OAuth2 providers mới implement thực sự.
        Access Key providers raise NotImplementedError.
        
        Raises:
            TokenRefreshFailed: nếu refresh thất bại.
            NotImplementedError: nếu provider không hỗ trợ refresh.
        """
        ...

    @abstractmethod
    async def validate(self, credential: AuthCredential) -> bool:
        """
        Kiểm tra credential còn hiệu lực bằng cách thực hiện lightweight operation.
        Không raise exception — trả về bool.
        """
        ...

    @abstractmethod
    async def revoke(self, credential: AuthCredential) -> None:
        """
        Thu hồi token/credential tại provider.
        
        Gọi khi user disconnect storage.
        Không raise exception nếu revoke thất bại (best-effort).
        """
        ...
