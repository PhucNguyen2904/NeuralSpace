"""Service wrapper for rclone CLI."""

import configparser
import json
import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Any

from app.core.storage_exceptions import (
    AuthenticationFailed,
    FileAlreadyExists,
    PermissionDenied,
    RemoteNotFound,
    StorageException,
    StorageUnavailable,
)

logger = logging.getLogger(__name__)


class RcloneService:
    """Wrapper for rclone CLI."""
    
    @staticmethod
    def _sanitize_log_command(cmd: list[str]) -> str:
        """Hide sensitive tokens in the command log."""
        sanitized = []
        for arg in cmd:
            if "token" in arg.lower() or "secret" in arg.lower() or "password" in arg.lower():
                sanitized.append("***")
            else:
                sanitized.append(arg)
        return " ".join(sanitized)
        
    @staticmethod
    def _map_error(stderr: str, provider: str, path: str = "") -> StorageException:
        """Map rclone stderr to custom exceptions."""
        stderr_lower = stderr.lower()
        if "not found" in stderr_lower or "didn't find" in stderr_lower or "directory not found" in stderr_lower:
            return RemoteNotFound(path)
        if "auth" in stderr_lower or "token" in stderr_lower or "unauthorized" in stderr_lower:
            return AuthenticationFailed(provider, stderr.strip())
        if "permission" in stderr_lower or "access denied" in stderr_lower or "forbidden" in stderr_lower:
            return PermissionDenied(path)
        if "already exists" in stderr_lower:
            return FileAlreadyExists(path)
        if "connection refused" in stderr_lower or "timeout" in stderr_lower or "dial tcp" in stderr_lower:
            return StorageUnavailable(provider, stderr.strip())
            
        return StorageException(f"rclone command failed: {stderr.strip()}")

    def command(self, cmd_args: list[str], config_path: str, provider: str = "unknown") -> subprocess.CompletedProcess:
        """Execute an rclone command safely."""
        full_cmd = ["rclone"] + cmd_args + ["--config", config_path]
        
        start_time = time.time()
        
        try:
            result = subprocess.run(
                full_cmd,
                capture_output=True,
                text=True,
                check=False,
            )
            duration = time.time() - start_time
            
            log_msg = (
                f"rclone {self._sanitize_log_command(cmd_args)} "
                f"| exit: {result.returncode} | duration: {duration:.3f}s"
            )
            
            if result.returncode == 0:
                logger.info(log_msg)
            else:
                logger.error(f"{log_msg} | stderr: {result.stderr.strip()}")
                raise self._map_error(result.stderr, provider=provider, path=str(cmd_args))
                
            return result
        except FileNotFoundError:
            logger.error("rclone executable not found")
            raise StorageException("rclone executable not found. Please install rclone.")

    def create_remote(self, config_path: str, remote_name: str, provider_type: str, params: dict[str, str]) -> None:
        """Create or update a remote in the rclone config file."""
        config_file = Path(config_path)
        config_file.parent.mkdir(parents=True, exist_ok=True)
        
        config = configparser.ConfigParser()
        if config_file.exists():
            config.read(config_file)
            
        if not config.has_section(remote_name):
            config.add_section(remote_name)
            
        config.set(remote_name, "type", provider_type)
        for key, value in params.items():
            config.set(remote_name, key, str(value))
            
        with open(config_file, "w") as f:
            config.write(f)

    def delete_remote(self, config_path: str, remote_name: str) -> None:
        """Delete a remote from the rclone config file."""
        config_file = Path(config_path)
        if not config_file.exists():
            return
            
        config = configparser.ConfigParser()
        config.read(config_file)
        
        if config.has_section(remote_name):
            config.remove_section(remote_name)
            with open(config_file, "w") as f:
                config.write(f)

    def list_files(self, config_path: str, remote_path: str, provider: str = "unknown") -> list[dict[str, Any]]:
        """List files and directories at the given path."""
        # Use lsjson to get structured output
        result = self.command(["lsjson", remote_path], config_path=config_path, provider=provider)
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return []

    def lsjson(self, config_path: str, remote_path: str, provider: str = "unknown", dirs_only: bool = False, recursive: bool = False) -> list[dict[str, Any]]:
        """List files as JSON."""
        cmd = ["lsjson", remote_path]
        if dirs_only:
            cmd.append("--dirs-only")
        if recursive:
            cmd.append("-R")
            
        result = self.command(cmd, config_path=config_path, provider=provider)
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return []

    def copy(self, config_path: str, src: str, dest: str, provider: str = "unknown") -> None:
        """Copy files or directories."""
        self.command(["copy", src, dest], config_path=config_path, provider=provider)

    def move(self, config_path: str, src: str, dest: str, provider: str = "unknown") -> None:
        """Move files or directories."""
        self.command(["move", src, dest], config_path=config_path, provider=provider)

    def sync(self, config_path: str, src: str, dest: str, provider: str = "unknown") -> None:
        """Synchronize src to dest."""
        self.command(["sync", src, dest], config_path=config_path, provider=provider)

    def mkdir(self, config_path: str, remote_path: str, provider: str = "unknown") -> None:
        """Create a directory."""
        self.command(["mkdir", remote_path], config_path=config_path, provider=provider)

    def delete(self, config_path: str, remote_path: str, provider: str = "unknown", is_dir: bool = False) -> None:
        """Delete a file or directory."""
        if is_dir:
            self.command(["purge", remote_path], config_path=config_path, provider=provider)
        else:
            self.command(["delete", remote_path], config_path=config_path, provider=provider)

    def cat(self, config_path: str, remote_path: str, provider: str = "unknown") -> bytes:
        """Get file contents."""
        full_cmd = ["rclone", "cat", remote_path, "--config", config_path]
        
        start_time = time.time()
        try:
            # We use capture_output=True but don't specify text=True to get raw bytes
            result = subprocess.run(
                full_cmd,
                capture_output=True,
                check=False,
            )
            duration = time.time() - start_time
            
            log_msg = (
                f"rclone cat {remote_path} "
                f"| exit: {result.returncode} | duration: {duration:.3f}s"
            )
            
            if result.returncode == 0:
                logger.info(log_msg)
                return result.stdout
            else:
                logger.error(f"{log_msg} | stderr: {result.stderr.decode('utf-8', errors='ignore').strip()}")
                raise self._map_error(result.stderr.decode('utf-8', errors='ignore'), provider=provider, path=remote_path)
                
        except FileNotFoundError:
            logger.error("rclone executable not found")
            raise StorageException("rclone executable not found. Please install rclone.")

    async def stream_cat(self, config_path: str, remote_path: str, provider: str = "unknown"):
        """Stream file contents asynchronously."""
        import asyncio
        full_cmd = ["rclone", "cat", remote_path, "--config", config_path]
        
        try:
            proc = await asyncio.create_subprocess_exec(
                *full_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            if proc.stdout is None:
                raise StorageException("Failed to open stdout for rclone stream")
                
            chunk_size = 64 * 1024  # 64KB chunks
            while True:
                chunk = await proc.stdout.read(chunk_size)
                if not chunk:
                    break
                yield chunk
                
            await proc.wait()
            if proc.returncode != 0:
                stderr = (await proc.stderr.read()).decode('utf-8', errors='ignore').strip() if proc.stderr else ""
                logger.error(f"rclone stream_cat {remote_path} failed with exit code {proc.returncode} | stderr: {stderr}")
                raise self._map_error(stderr, provider=provider, path=remote_path)
                
        except FileNotFoundError:
            logger.error("rclone executable not found")
            raise StorageException("rclone executable not found. Please install rclone.")

    def about(self, config_path: str, remote_name: str, provider: str = "unknown") -> dict[str, Any]:
        """Get quota and usage information."""
        result = self.command(["about", f"{remote_name}:", "--json"], config_path=config_path, provider=provider)
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return {}
