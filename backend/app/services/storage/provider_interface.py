"""
Storage Provider Interface — Abstract base cho mọi cloud storage provider.

Nguyên tắc Open/Closed: Interface này KHÔNG thay đổi khi thêm provider mới.
Provider mới chỉ cần implement interface và đăng ký qua @register_provider.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.services.storage.auth.base_auth import AuthCredential


@dataclass
class FileInfo:
    """Thông tin file/thư mục — chuẩn hóa output từ mọi provider."""

    name: str
    path: str
    size: int
    is_dir: bool
    modified_at: datetime | None = None
    mime_type: str | None = None

    @classmethod
    def from_rclone_lsjson(cls, item: dict[str, Any]) -> "FileInfo":
        """Parse từ output của rclone lsjson."""
        mod_time = None
        if item.get("ModTime"):
            try:
                mod_time = datetime.fromisoformat(item["ModTime"].replace("Z", "+00:00"))
            except Exception:
                pass

        return cls(
            name=item.get("Name", ""),
            path=item.get("Path", ""),
            size=item.get("Size", 0),
            is_dir=item.get("IsDir", False),
            modified_at=mod_time,
            mime_type=item.get("MimeType"),
        )


@dataclass
class StorageQuota:
    """Thông tin dung lượng storage."""

    total: int | None  # bytes, None = unlimited
    used: int | None
    free: int | None

    @classmethod
    def unknown(cls) -> "StorageQuota":
        return cls(total=None, used=None, free=None)

    @classmethod
    def from_rclone_about(cls, data: dict[str, Any]) -> "StorageQuota":
        return cls(
            total=data.get("total"),
            used=data.get("used"),
            free=data.get("free"),
        )


class StorageProviderInterface(ABC):
    """
    Interface chuẩn cho mọi Cloud Storage Provider.

    Mọi operations đều nhận connection_id và credential thay vì
    StorageConnection ORM object trực tiếp — giảm coupling với DB layer.
    """

    # ── Lifecycle ────────────────────────────────────────────────────────

    @abstractmethod
    async def connect(
        self,
        connection_id: str,
        remote_name: str,
        config_path: str,
        credential: AuthCredential,
    ) -> None:
        """
        Khởi tạo connection: sinh rclone.conf section, test connection.

        Raises:
            StorageException nếu thất bại.
        """
        ...

    @abstractmethod
    async def disconnect(self, remote_name: str, config_path: str) -> None:
        """Xóa remote section khỏi rclone.conf."""
        ...

    @abstractmethod
    async def validate_credential(
        self, remote_name: str, config_path: str
    ) -> bool:
        """Kiểm tra credential còn hợp lệ (lightweight operation)."""
        ...

    # ── File Operations ──────────────────────────────────────────────────

    @abstractmethod
    async def list_files(
        self, remote_name: str, config_path: str, path: str = ""
    ) -> list[FileInfo]:
        """Liệt kê files và thư mục tại path."""
        ...

    @abstractmethod
    async def create_folder(
        self, remote_name: str, config_path: str, path: str
    ) -> None:
        """Tạo thư mục."""
        ...

    @abstractmethod
    async def upload(
        self,
        remote_name: str,
        config_path: str,
        local_path: str,
        remote_path: str,
    ) -> None:
        """Upload file từ local lên remote."""
        ...

    @abstractmethod
    async def download(
        self,
        remote_name: str,
        config_path: str,
        remote_path: str,
        local_path: str,
    ) -> None:
        """Download file từ remote về local."""
        ...

    @abstractmethod
    async def delete(
        self,
        remote_name: str,
        config_path: str,
        path: str,
        is_dir: bool = False,
    ) -> None:
        """Xóa file hoặc thư mục."""
        ...

    @abstractmethod
    async def sync(
        self,
        remote_name: str,
        config_path: str,
        src: str,
        dest: str,
    ) -> None:
        """
        Đồng bộ src → dest dùng rclone sync.

        src/dest có thể là:
            - Local path: /data/folder/
            - Remote path: remote_name:path/

        Khi cả hai đều là remote path thì dùng rclone sync server-side.
        """
        ...

    @abstractmethod
    async def get_quota(
        self, remote_name: str, config_path: str
    ) -> StorageQuota:
        """Lấy thông tin dung lượng storage."""
        ...

    # ── Config Generation (DVC Integration) ─────────────────────────────

    @abstractmethod
    def get_dvc_remote_url(self, remote_name: str, base_path: str) -> str:
        """
        Trả về URL DVC remote trỏ vào storage này qua rclone backend.

        Ví dụ:
            Google Drive: "rclone:my-gdrive:dvc-data/user_abc"
            S3:           "s3://my-bucket/dvc-data/user_abc"
            MinIO:        "s3://my-bucket/dvc-data/user_abc" (endpoint separate)
        """
        ...

    def get_provider_type(self) -> str:
        """Trả về provider type string (khớp với rclone type)."""
        return self.__class__.__name__.replace("Provider", "").lower()
