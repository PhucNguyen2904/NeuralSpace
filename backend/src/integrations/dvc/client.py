"""DVC client wrapper using CLI subprocess calls."""

from __future__ import annotations

import asyncio
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

from .exceptions import DVCCommandError, DVCParseError, DVCRepositoryError
from .schemas import DVCDiffResult, DVCReproResult, DVCTrackResult, DVCVersionInfo


class DVCClient:
    """Wrapper around DVC and Git CLI commands."""

    def __init__(
        self,
        repo_path: str,
        remote_name: str = "minio",
        ssh_key_encrypted: bytes | None = None,
        git_ssh_url: str | None = None,
    ) -> None:
        self.repo_path = Path(repo_path).resolve()
        self.remote_name = remote_name
        self.ssh_key_encrypted = ssh_key_encrypted
        self.git_ssh_url = git_ssh_url
        # Resolve executables once so they work regardless of system PATH.
        # DVC: prefer the venv-local binary; fall back to `python -m dvc`.
        _dvc_bin = shutil.which("dvc") or shutil.which(
            str(Path(sys.executable).parent / "dvc")
        )
        self._dvc_cmd: list[str] = [_dvc_bin] if _dvc_bin else [sys.executable, "-m", "dvc"]
        _git_bin = shutil.which("git") or "git"
        self._git_cmd: list[str] = [_git_bin]
        self._validate_repo()

    async def track(self, local_path: str, dataset_name: str, commit_message: str) -> DVCTrackResult:
        local_abs = Path(local_path).resolve()
        dvc_file = self._to_dvc_file(local_abs)
        rel_dvc_file = self._relpath(dvc_file)
        rel_data_path = self._relpath(local_abs)

        await self._run_command([*self._dvc_cmd, "add", rel_data_path], cwd=self.repo_path)
        git_add_paths = [rel_dvc_file]
        root_gitignore = self.repo_path / ".gitignore"
        data_gitignore = local_abs.parent / ".gitignore"
        if root_gitignore.exists():
            git_add_paths.append(".gitignore")
        if data_gitignore.exists():
            git_add_paths.append(self._relpath(data_gitignore))
        await self._run_command([*self._git_cmd, "add", *git_add_paths], cwd=self.repo_path)
        await self._run_command([*self._git_cmd, "commit", "-m", commit_message], cwd=self.repo_path)
        await self._run_command([*self._dvc_cmd, "push", "-r", self.remote_name], cwd=self.repo_path)

        if self.git_ssh_url and self.ssh_key_encrypted:
            from app.utils.ssh_key_manager import temp_ssh_key_file
            from app.core.exceptions import GitPushError
            with temp_ssh_key_file(self.ssh_key_encrypted) as key_path:
                extra_env = {
                    "GIT_SSH_COMMAND": f"ssh -i {key_path} -o StrictHostKeyChecking=no -o BatchMode=yes",
                    "GIT_TERMINAL_PROMPT": "0",
                }
                try:
                    await self._run_command(
                        [*self._git_cmd, "push", self.git_ssh_url, "HEAD"],
                        cwd=self.repo_path,
                        extra_env=extra_env,
                    )
                except DVCCommandError as exc:
                    msg = (exc.stderr or exc.stdout or "").lower()
                    if "permission denied" in msg:
                        raise GitPushError("SSH key bị từ chối bởi GitHub. Deploy Key có thể đã bị xóa hoặc thu hồi.")
                    elif "repository not found" in msg:
                        raise GitPushError("Không tìm thấy repository trên GitHub.")
                    else:
                        raise GitPushError(f"Git push thất bại: {msg}")
        else:
            try:
                await self._run_command([*self._git_cmd, "push", "origin", "HEAD"], cwd=self.repo_path)
            except DVCCommandError as exc:
                msg = (exc.stderr or exc.stdout or "").lower()
                if "does not appear to be a git repository" in msg or "no configured push destination" in msg:
                    pass  # Ignore failure if origin is missing (e.g. Server default)
                else:
                    if "terminal prompts disabled" in msg or "could not read username" in msg:
                        raise DVCCommandError(
                            exc.cmd,
                            exc.returncode,
                            exc.stdout,
                            "Git authentication failed. Please configure the Git URL with credentials (e.g., https://<token>@github.com/...)",
                        )
                    raise

        info = await self.get_version_info(rel_dvc_file)
        stdout, _, _ = await self._run_command([*self._git_cmd, "rev-parse", "HEAD"], cwd=self.repo_path)
        return DVCTrackResult(
            dataset_name=dataset_name,
            md5=info.md5,
            git_commit=stdout.strip(),
            dvc_file_path=rel_dvc_file,
            size_bytes=info.size_bytes,
        )

    async def get_version_info(self, dvc_file_path: str) -> DVCVersionInfo:
        parsed = self._parse_dvc_file(dvc_file_path)
        out0 = parsed["outs"][0]
        return DVCVersionInfo(
            md5=str(out0.get("md5") or ""),
            size_bytes=int(out0.get("size") or 0),
            path=str(out0.get("path") or ""),
            dvc_file_path=dvc_file_path,
        )

    async def pull(self, dvc_file_path: str, target_path: str) -> None:
        target = Path(target_path)
        target.mkdir(parents=True, exist_ok=True)
        await self._run_command(
            [*self._dvc_cmd, "pull", dvc_file_path, "-r", self.remote_name],
            cwd=self.repo_path,
        )

    async def list_versions(self, dataset_name: str) -> list[DVCVersionInfo]:
        dvc_file_path = self._dataset_name_to_dvc_file(dataset_name)
        stdout, _, _ = await self._run_command(
            [*self._git_cmd, "log", "--all", "--date=iso-strict", "--pretty=format:%H|%cI", "--", dvc_file_path],
            cwd=self.repo_path,
        )
        versions: list[DVCVersionInfo] = []
        for line in (row.strip() for row in stdout.splitlines() if row.strip()):
            commit_sha, committed_at = line.split("|", maxsplit=1)
            content, _, _ = await self._run_command(
                [*self._git_cmd, "show", f"{commit_sha}:{dvc_file_path}"],
                cwd=self.repo_path,
            )
            parsed = self._parse_dvc_yaml(content, dvc_file_path)
            out0 = parsed["outs"][0]
            versions.append(
                DVCVersionInfo(
                    md5=str(out0.get("md5") or ""),
                    size_bytes=int(out0.get("size") or 0),
                    path=str(out0.get("path") or ""),
                    dvc_file_path=dvc_file_path,
                    git_commit=commit_sha,
                    committed_at=datetime.fromisoformat(committed_at).astimezone(timezone.utc),
                )
            )
        return versions

    async def diff(self, version_a: str, version_b: str, dvc_file_path: str) -> DVCDiffResult:
        content_a, _, _ = await self._run_command(
            [*self._git_cmd, "show", f"{version_a}:{dvc_file_path}"],
            cwd=self.repo_path,
        )
        content_b, _, _ = await self._run_command(
            [*self._git_cmd, "show", f"{version_b}:{dvc_file_path}"],
            cwd=self.repo_path,
        )
        parsed_a = self._parse_dvc_yaml(content_a, dvc_file_path)
        parsed_b = self._parse_dvc_yaml(content_b, dvc_file_path)
        md5_a = str(parsed_a["outs"][0].get("md5") or "")
        md5_b = str(parsed_b["outs"][0].get("md5") or "")
        changed = md5_a != md5_b
        return DVCDiffResult(
            version_a=version_a,
            version_b=version_b,
            md5_a=md5_a,
            md5_b=md5_b,
            modified=1 if changed else 0,
            unchanged=0 if changed else 1,
            changed=changed,
        )

    async def reproduce(self, pipeline_stage: str) -> DVCReproResult:
        stdout, stderr, _ = await self._run_command(
            [*self._dvc_cmd, "repro", pipeline_stage],
            cwd=self.repo_path,
        )
        return DVCReproResult(stage=pipeline_stage, success=True, stdout=stdout, stderr=stderr)

    async def _run_command(self, cmd: list[str], cwd: Path, extra_env: dict | None = None) -> tuple[str, str, int]:
        env = os.environ.copy()
        env.update(
            {
                "GIT_CONFIG_COUNT": "1",
                "GIT_CONFIG_KEY_0": "safe.directory",
                "GIT_CONFIG_VALUE_0": str(self.repo_path),
                # Provide a fallback identity so `git commit` works in headless
                # environments (Docker containers) that have no global git config.
                "GIT_AUTHOR_NAME": env.get("GIT_AUTHOR_NAME") or "NeuralSpace",
                "GIT_AUTHOR_EMAIL": env.get("GIT_AUTHOR_EMAIL") or "noreply@neuralspace.local",
                "GIT_COMMITTER_NAME": env.get("GIT_COMMITTER_NAME") or "NeuralSpace",
                "GIT_COMMITTER_EMAIL": env.get("GIT_COMMITTER_EMAIL") or "noreply@neuralspace.local",
            }
        )
        if extra_env:
            env.update(extra_env)
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(cwd),
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=300)
        except TimeoutError:
            proc.kill()
            await proc.wait()
            raise DVCCommandError(cmd, -1, "", "Command timed out")

        stdout = stdout_b.decode("utf-8", errors="replace")
        stderr = stderr_b.decode("utf-8", errors="replace")
        if proc.returncode != 0:
            raise DVCCommandError(cmd, int(proc.returncode), stdout, stderr)
        return stdout, stderr, int(proc.returncode)

    def _parse_dvc_file(self, dvc_file_path: str) -> dict:
        file_path = (self.repo_path / dvc_file_path).resolve()
        if not file_path.exists():
            raise DVCParseError(f".dvc file does not exist: {file_path}")
        content = file_path.read_text(encoding="utf-8")
        return self._parse_dvc_yaml(content, dvc_file_path)

    @staticmethod
    def _parse_dvc_yaml(content: str, source: str) -> dict:
        parsed = yaml.safe_load(content)
        if not isinstance(parsed, dict) or "outs" not in parsed:
            raise DVCParseError(f"Invalid .dvc format (missing outs): {source}")
        outs = parsed.get("outs")
        if not isinstance(outs, list) or not outs:
            raise DVCParseError(f"Invalid .dvc format (empty outs): {source}")
        return parsed

    def _validate_repo(self) -> None:
        if not self.repo_path.exists():
            raise DVCRepositoryError(f"repo_path does not exist: {self.repo_path}")
        if not (self.repo_path / ".git").exists():
            raise DVCRepositoryError(f"repo_path is not a git repo: {self.repo_path}")
        if not (self.repo_path / ".dvc").exists():
            raise DVCRepositoryError(f"repo_path is missing .dvc: {self.repo_path}")

    def _relpath(self, absolute_path: Path) -> str:
        return str(absolute_path.resolve().relative_to(self.repo_path)).replace("\\", "/")

    @staticmethod
    def _to_dvc_file(local_abs: Path) -> Path:
        return local_abs.parent / f"{local_abs.name}.dvc"

    def _dataset_name_to_dvc_file(self, dataset_name: str) -> str:
        normalized = dataset_name.strip().replace("\\", "/")
        if normalized.endswith(".dvc"):
            return normalized
        return f"{normalized}.dvc"
