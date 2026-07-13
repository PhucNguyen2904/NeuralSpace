"""
DVC Storage Adapter — Tích hợp DVC với User Cloud Storage qua rclone.

Thay vì DVC dùng credentials trực tiếp, DVC delegate tất cả storage ops
cho rclone. rclone tự quản lý auth → DVC chỉ cần rclone.conf.

DVC remote URL format: rclone:remote_name:path/in/remote
Env var cần thiết: RCLONE_CONFIG=/storage-configs/{user_id}/rclone.conf
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.storage_connection import StorageConnection

logger = logging.getLogger(__name__)


class DVCStorageError(Exception):
    """Lỗi trong quá trình DVC operation."""
    pass


class DVCStorageAdapter:
    """
    Tích hợp DVC với User Cloud Storage thông qua rclone.

    Mỗi user có rclone.conf riêng → mỗi DVC remote trỏ đến rclone remote của user.
    Isolation hoàn toàn giữa các users.
    """

    def get_dvc_remote_name(self, user_id: str, connection_id: str) -> str:
        """
        Tên DVC remote unique per user+connection.
        Format: user-{user_id[:8]}-{conn_id[:8]}
        """
        return f"user-{user_id[:8]}-{connection_id[:8]}"

    def get_dvc_remote_url(
        self,
        connection: "StorageConnection",
        base_path: str = "dvc-data",
    ) -> str:
        """
        URL DVC remote trỏ vào storage của user qua rclone backend.

        Format: rclone:remote_name:base_path/user_id
        Ví dụ: rclone:my-gdrive:dvc-data/abc-123-user-id
        """
        return f"rclone:{connection.remote_name}:{base_path}/{connection.user_id}"

    def get_rclone_config_path(self, connection: "StorageConnection") -> str:
        """Đường dẫn rclone.conf của user owning connection."""
        return connection.config_path

    async def configure_dvc_remote(
        self,
        repo_path: str,
        connection: "StorageConnection",
        base_path: str = "dvc-data",
        set_as_default: bool = False,
    ) -> str:
        """
        Cấu hình DVC remote trỏ tới user's cloud storage.

        Chạy:
          1. dvc remote add [-d] <remote_name> rclone:<remote>:<path>
          2. dvc remote modify --local <remote_name> config /path/to/rclone.conf

        Args:
            repo_path: Path tới DVC repo
            connection: StorageConnection của user
            base_path: Base path trong remote storage (default: "dvc-data")
            set_as_default: Set remote này là default

        Returns:
            remote_name đã được cấu hình
        """
        remote_name = self.get_dvc_remote_name(connection.user_id, connection.id)
        remote_url = self.get_dvc_remote_url(connection, base_path)
        rclone_config = self.get_rclone_config_path(connection)

        # dvc remote add [-d] <name> <url>
        cmd_add = ["dvc", "remote", "add"]
        if set_as_default:
            cmd_add.append("-d")
        cmd_add.extend([remote_name, remote_url])
        await self._run(cmd_add, repo_path, allow_failure=True)

        # Chỉ định rclone.conf path để DVC dùng đúng credentials của user
        # RCLONE_CONFIG env var cũng work nhưng modify --local persist trong config
        await self._run(
            ["dvc", "remote", "modify", "--local", remote_name, "config", rclone_config],
            repo_path,
            allow_failure=True,
        )

        logger.info(
            "Configured DVC remote",
            remote_name=remote_name,
            remote_url=remote_url,
            repo_path=repo_path,
            rclone_config=rclone_config,
        )

        return remote_name

    async def push(
        self,
        repo_path: str,
        connection: "StorageConnection",
        base_path: str = "dvc-data",
        targets: list[str] | None = None,
        jobs: int = 4,
    ) -> tuple[str, str]:
        """
        dvc push — upload DVC-tracked files lên user's cloud storage.

        Đảm bảo rclone.conf của user tồn tại trước khi push.

        Returns:
            (stdout, stderr)
        """
        remote_name = self.get_dvc_remote_name(connection.user_id, connection.id)
        rclone_config = self.get_rclone_config_path(connection)

        cmd = ["dvc", "push", "-r", remote_name, f"--jobs={jobs}"]
        if targets:
            cmd.extend(targets)

        env = {"RCLONE_CONFIG": rclone_config}
        return await self._run(cmd, repo_path, env=env)

    async def pull(
        self,
        repo_path: str,
        connection: "StorageConnection",
        base_path: str = "dvc-data",
        targets: list[str] | None = None,
        jobs: int = 4,
    ) -> tuple[str, str]:
        """dvc pull — download DVC-tracked files từ user's cloud storage."""
        remote_name = self.get_dvc_remote_name(connection.user_id, connection.id)
        rclone_config = self.get_rclone_config_path(connection)

        cmd = ["dvc", "pull", "-r", remote_name, f"--jobs={jobs}"]
        if targets:
            cmd.extend(targets)

        env = {"RCLONE_CONFIG": rclone_config}
        return await self._run(cmd, repo_path, env=env)

    async def fetch(
        self,
        repo_path: str,
        connection: "StorageConnection",
        targets: list[str] | None = None,
        jobs: int = 4,
    ) -> tuple[str, str]:
        """dvc fetch — tải về metadata/cache, không checkout vào workspace."""
        remote_name = self.get_dvc_remote_name(connection.user_id, connection.id)
        rclone_config = self.get_rclone_config_path(connection)

        cmd = ["dvc", "fetch", "-r", remote_name, f"--jobs={jobs}"]
        if targets:
            cmd.extend(targets)

        env = {"RCLONE_CONFIG": rclone_config}
        return await self._run(cmd, repo_path, env=env)

    async def gc(
        self,
        repo_path: str,
        connection: "StorageConnection",
        all_branches: bool = False,
        all_tags: bool = False,
        cloud: bool = True,
    ) -> tuple[str, str]:
        """
        dvc gc — dọn dẹp files không còn được track.

        ⚠️ CẨN THẬN: cloud=True sẽ xóa files trên cloud storage của user!
        """
        remote_name = self.get_dvc_remote_name(connection.user_id, connection.id)
        rclone_config = self.get_rclone_config_path(connection)

        cmd = ["dvc", "gc", "-r", remote_name]
        if cloud:
            cmd.append("--cloud")
        if all_branches:
            cmd.append("--all-branches")
        if all_tags:
            cmd.append("--all-tags")
        cmd.append("-f")  # force (non-interactive)

        env = {"RCLONE_CONFIG": rclone_config}
        return await self._run(cmd, repo_path, env=env)

    async def _run(
        self,
        command: list[str],
        cwd: str,
        env: dict | None = None,
        allow_failure: bool = False,
        timeout: int = 600,
    ) -> tuple[str, str]:
        """Execute DVC/git command với isolation env."""
        base_env = os.environ.copy()
        base_env["GIT_TERMINAL_PROMPT"] = "0"
        base_env["DVC_NO_ANALYTICS"] = "true"
        # Fallback git identity để `git commit` hoạt động trong headless container
        base_env.setdefault("GIT_AUTHOR_NAME", "NeuralSpace")
        base_env.setdefault("GIT_AUTHOR_EMAIL", "noreply@neuralspace.local")
        base_env.setdefault("GIT_COMMITTER_NAME", "NeuralSpace")
        base_env.setdefault("GIT_COMMITTER_EMAIL", "noreply@neuralspace.local")

        if env:
            base_env.update(env)

        try:
            proc = await asyncio.create_subprocess_exec(
                *command,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=base_env,
            )
            try:
                stdout_b, stderr_b = await asyncio.wait_for(
                    proc.communicate(), timeout=timeout
                )
            except asyncio.TimeoutError:
                proc.kill()
                raise DVCStorageError(f"DVC command timed out after {timeout}s: {' '.join(command)}")

            stdout = stdout_b.decode(errors="ignore")
            stderr = stderr_b.decode(errors="ignore")

            if proc.returncode != 0 and not allow_failure:
                detail = (stderr or stdout).strip()
                if "terminal prompts disabled" in detail or "could not read Username" in detail:
                    raise DVCStorageError(
                        "Git authentication failed. Include credentials in URL or use SSH."
                    )
                raise DVCStorageError(detail or f"Command failed: {' '.join(command)}")

            return stdout, stderr

        except FileNotFoundError:
            raise DVCStorageError(
                f"Command not found: {command[0]}. Is DVC/git installed?"
            )
