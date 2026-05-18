"""Storage service for file management."""

import shutil
from pathlib import Path
from typing import NamedTuple
import logging

from app.config import settings
from app.core.exceptions import InsufficientDiskSpaceError


logger = logging.getLogger(__name__)


class DiskUsage(NamedTuple):
    """Disk usage information."""
    total_bytes: int
    used_bytes: int
    free_bytes: int
    percent_used: float


class StorageService:
    """Service for managing model storage on disk."""

    def __init__(self):
        self.base_path = Path(settings.STORAGE_BASE_PATH)
        self.temp_path = Path(settings.TEMP_DOWNLOAD_PATH)
        self.min_free_gb = settings.MIN_FREE_DISK_GB

    def get_temp_path(self, task_id: str) -> Path:
        """Get temporary download path for a task."""
        return self.temp_path / task_id

    def get_final_path(
        self,
        source_type: str,
        source_identifier: str,
        revision: str = "main",
    ) -> Path:
        """
        Get final storage path for a model.

        Convention: {base}/{source_type}/{org_or_domain}/{model_name}/{revision}/
        """
        base = self.base_path / source_type

        if source_type == "huggingface":
            # Format: org/model_name
            parts = source_identifier.split("/")
            if len(parts) == 2:
                org, model = parts
                return base / org / model / revision
            else:
                return base / "unknown" / source_identifier / revision
        elif source_type == "github_release":
            # Format: owner/repo/release_tag
            parts = source_identifier.split("/")
            if len(parts) >= 2:
                owner, repo = parts[0], parts[1]
                rev = parts[2] if len(parts) > 2 else revision
                return base / owner / repo / rev
            else:
                return base / "unknown" / source_identifier / revision
        else:  # direct_url
            # Use a hash of the URL as directory name
            import hashlib
            url_hash = hashlib.md5(source_identifier.encode()).hexdigest()[:8]
            return base / "downloads" / url_hash

    def ensure_dir(self, path: Path) -> None:
        """Ensure directory exists, creating if necessary."""
        path.mkdir(parents=True, exist_ok=True)
        logger.info(f"Ensured directory: {path}")

    def get_disk_usage(self, path: Path = None) -> DiskUsage:
        """Get disk usage information for a path or base storage path."""
        check_path = path or self.base_path
        # Ensure path exists
        check_path.parent.mkdir(parents=True, exist_ok=True)

        stat = shutil.disk_usage(check_path)
        total = stat.total
        free = stat.free
        used = total - free
        percent = (used / total * 100) if total > 0 else 0

        return DiskUsage(
            total_bytes=total,
            used_bytes=used,
            free_bytes=free,
            percent_used=percent,
        )

    def check_space(self, required_bytes: int) -> None:
        """
        Check if sufficient disk space is available.

        Raises InsufficientDiskSpaceError if not enough space.
        """
        usage = self.get_disk_usage()
        min_required = int(required_bytes * 1.05)  # 5% buffer

        if usage.free_bytes < min_required:
            raise InsufficientDiskSpaceError(min_required, usage.free_bytes)

        logger.info(
            f"Disk space check passed: {min_required} bytes required, "
            f"{usage.free_bytes} bytes available"
        )

    def move_to_final(self, temp_path: Path, final_path: Path) -> None:
        """Move downloaded file from temp to final location."""
        self.ensure_dir(final_path.parent)

        if temp_path.is_file():
            # Move single file
            final_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(temp_path), str(final_path))
            logger.info(f"Moved {temp_path} to {final_path}")
        elif temp_path.is_dir():
            # Move directory tree
            if final_path.exists():
                shutil.rmtree(final_path)
            shutil.move(str(temp_path), str(final_path))
            logger.info(f"Moved directory {temp_path} to {final_path}")

    def delete_model(self, storage_path: str) -> None:
        """Delete model files from storage."""
        path = Path(storage_path)
        if path.exists():
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink()
            logger.info(f"Deleted model: {storage_path}")

    def cleanup_temp_file(self, task_id: str) -> None:
        """Clean up temporary download file for a task."""
        temp_path = self.get_temp_path(task_id)
        if temp_path.exists():
            if temp_path.is_dir():
                shutil.rmtree(temp_path)
            else:
                temp_path.unlink()
            logger.info(f"Cleaned up temp file: {temp_path}")
