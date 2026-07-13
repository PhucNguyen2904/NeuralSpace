"""
Base Rclone Provider — shared implementation cho mọi provider dùng rclone backend.

Tất cả providers (GDrive, S3, OneDrive, Dropbox) đều kế thừa class này.
Chỉ cần override: provider_type, get_dvc_remote_url(), và các method đặc thù.
"""

from __future__ import annotations

import asyncio
import configparser
import logging
import os
from pathlib import Path
from typing import Any

from app.services.storage.auth.base_auth import AuthCredential
from app.services.storage.provider_interface import FileInfo, StorageProviderInterface, StorageQuota
from app.core.storage_exceptions import StorageException

logger = logging.getLogger(__name__)

RCLONE_TIMEOUT = 300  # 5 phút
RCLONE_RETRIES = 3
RCLONE_RETRY_BACKOFF = [1, 3, 9]  # seconds
RCLONE_RETRYABLE_ERRORS = [
    "connection refused", "timeout", "rate limit", "503", "429",
    "temporary", "try again", "network",
]


class BaseRcloneProvider(StorageProviderInterface):
    """
    Base implementation dùng rclone CLI cho mọi cloud storage.

    Subclass chỉ cần:
        PROVIDER_TYPE = "drive"  # rclone type
        def get_dvc_remote_url(self, remote_name, base_path): ...
    """

    PROVIDER_TYPE: str = ""  # Override trong subclass

    # ── Config Management ────────────────────────────────────────────────

    def _write_config_section(
        self, config_path: str, remote_name: str, params: dict[str, Any]
    ) -> None:
        """Ghi section vào rclone.conf."""
        path = Path(config_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        config = configparser.ConfigParser()
        if path.exists():
            config.read(path)

        if not config.has_section(remote_name):
            config.add_section(remote_name)

        config.set(remote_name, "type", self.PROVIDER_TYPE or params.get("type", ""))
        for key, value in params.items():
            if key != "type":  # type đã set ở trên
                config.set(remote_name, key, str(value))

        with open(path, "w") as f:
            config.write(f)

        logger.debug(
            "Wrote rclone config section",
            remote_name=remote_name,
            config_path=config_path,
        )

    def _remove_config_section(self, config_path: str, remote_name: str) -> None:
        """Xóa section khỏi rclone.conf."""
        path = Path(config_path)
        if not path.exists():
            return

        config = configparser.ConfigParser()
        config.read(path)

        if config.has_section(remote_name):
            config.remove_section(remote_name)
            with open(path, "w") as f:
                config.write(f)

    # ── Rclone Command Execution ─────────────────────────────────────────

    async def _run_rclone(
        self,
        args: list[str],
        config_path: str,
        retries: int = RCLONE_RETRIES,
    ) -> tuple[str, str]:
        """
        Execute rclone command async với retry.

        Returns:
            (stdout, stderr)

        Raises:
            StorageException on failure after all retries
        """
        cmd = ["rclone"] + args + ["--config", config_path]

        env = os.environ.copy()
        env["RCLONE_NO_PROMPT"] = "true"   # Headless mode
        env["RCLONE_LOG_LEVEL"] = "ERROR"  # Suppress noise

        last_stderr = ""
        for attempt in range(retries + 1):
            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=env,
                )
                stdout_b, stderr_b = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=RCLONE_TIMEOUT,
                )
                stdout = stdout_b.decode(errors="ignore")
                stderr = stderr_b.decode(errors="ignore")
                last_stderr = stderr

                if proc.returncode == 0:
                    return stdout, stderr

                # Check if retryable
                stderr_lower = stderr.lower()
                is_retryable = any(e in stderr_lower for e in RCLONE_RETRYABLE_ERRORS)

                if is_retryable and attempt < retries:
                    wait = RCLONE_RETRY_BACKOFF[min(attempt, len(RCLONE_RETRY_BACKOFF) - 1)]
                    logger.warning(
                        f"Retryable rclone error, waiting {wait}s",
                        attempt=attempt + 1,
                        args=args[:3],
                    )
                    await asyncio.sleep(wait)
                    continue

                # Non-retryable or exhausted retries
                raise self._map_error(stderr)

            except asyncio.TimeoutError:
                last_stderr = "Command timed out"
                if attempt < retries:
                    await asyncio.sleep(RCLONE_RETRY_BACKOFF[min(attempt, len(RCLONE_RETRY_BACKOFF) - 1)])
                    continue
                raise StorageException(f"rclone command timed out after {RCLONE_TIMEOUT}s")

            except FileNotFoundError:
                raise StorageException(
                    "rclone executable not found. Please install rclone."
                )

        raise self._map_error(last_stderr)

    def _map_error(self, stderr: str) -> StorageException:
        """Map rclone stderr message → typed exception."""
        from app.core.storage_exceptions import (
            AuthenticationFailed, FileAlreadyExists,
            PermissionDenied, RemoteNotFound, StorageUnavailable,
        )
        s = stderr.lower()
        if any(x in s for x in ["not found", "didn't find", "directory not found", "no such"]):
            return RemoteNotFound(stderr.strip()[:80])
        if any(x in s for x in ["auth", "token", "unauthorized", "invalid_grant", "401"]):
            return AuthenticationFailed(self.PROVIDER_TYPE, stderr.strip()[:200])
        if any(x in s for x in ["permission", "access denied", "forbidden", "403"]):
            return PermissionDenied(stderr.strip()[:80])
        if any(x in s for x in ["already exists"]):
            return FileAlreadyExists(stderr.strip()[:80])
        if any(x in s for x in ["connection refused", "timeout", "dial tcp", "503"]):
            return StorageUnavailable(self.PROVIDER_TYPE, stderr.strip()[:200])
        return StorageException(f"rclone error: {stderr.strip()[:300]}")

    def _remote_path(self, remote_name: str, path: str) -> str:
        """Format remote:path string cho rclone."""
        clean = path.lstrip("/")
        return f"{remote_name}:{clean}"

    # ── StorageProviderInterface Implementation ─────────────────────────

    async def connect(
        self,
        connection_id: str,
        remote_name: str,
        config_path: str,
        credential: AuthCredential,
    ) -> None:
        """Ghi config và test connection."""
        self._write_config_section(config_path, remote_name, credential.raw_params)

        # Test connection bằng lsjson trên root
        try:
            await self._run_rclone(
                ["lsjson", f"{remote_name}:", "--max-depth=1"],
                config_path,
                retries=1,
            )
        except Exception as e:
            # Xóa config nếu test thất bại
            self._remove_config_section(config_path, remote_name)
            raise

    async def disconnect(self, remote_name: str, config_path: str) -> None:
        self._remove_config_section(config_path, remote_name)

    async def validate_credential(self, remote_name: str, config_path: str) -> bool:
        """Kiểm tra credential bằng rclone about."""
        try:
            await self._run_rclone(
                ["about", f"{remote_name}:", "--json"],
                config_path,
                retries=1,
            )
            return True
        except Exception:
            return False

    async def list_files(
        self, remote_name: str, config_path: str, path: str = ""
    ) -> list[FileInfo]:
        import json
        stdout, _ = await self._run_rclone(
            ["lsjson", self._remote_path(remote_name, path)],
            config_path,
        )
        try:
            items = json.loads(stdout)
        except json.JSONDecodeError:
            return []
        return [FileInfo.from_rclone_lsjson(item) for item in items]

    async def create_folder(
        self, remote_name: str, config_path: str, path: str
    ) -> None:
        await self._run_rclone(
            ["mkdir", self._remote_path(remote_name, path)],
            config_path,
        )

    async def upload(
        self,
        remote_name: str,
        config_path: str,
        local_path: str,
        remote_path: str,
    ) -> None:
        dest = self._remote_path(remote_name, remote_path)
        await self._run_rclone(
            ["copy", local_path, dest],
            config_path,
        )

    async def download(
        self,
        remote_name: str,
        config_path: str,
        remote_path: str,
        local_path: str,
    ) -> None:
        src = self._remote_path(remote_name, remote_path)
        await self._run_rclone(
            ["copy", src, local_path],
            config_path,
        )

    async def delete(
        self,
        remote_name: str,
        config_path: str,
        path: str,
        is_dir: bool = False,
    ) -> None:
        remote = self._remote_path(remote_name, path)
        cmd = "purge" if is_dir else "delete"
        await self._run_rclone([cmd, remote], config_path)

    async def sync(
        self,
        remote_name: str,
        config_path: str,
        src: str,
        dest: str,
    ) -> None:
        """
        Sync src → dest.
        src/dest là remote:path nếu bắt đầu bằng remote_name, ngược lại là local path.
        """
        await self._run_rclone(["sync", src, dest], config_path)

    async def get_quota(
        self, remote_name: str, config_path: str
    ) -> StorageQuota:
        import json
        try:
            stdout, _ = await self._run_rclone(
                ["about", f"{remote_name}:", "--json"],
                config_path,
                retries=1,
            )
            data = json.loads(stdout)
            return StorageQuota.from_rclone_about(data)
        except Exception:
            return StorageQuota.unknown()

    def get_dvc_remote_url(self, remote_name: str, base_path: str) -> str:
        """Default: rclone backend. Override trong provider nếu cần URL format khác."""
        return f"rclone:{remote_name}:{base_path}"
