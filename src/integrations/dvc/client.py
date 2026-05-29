"""DVC client wrapper using CLI subprocess calls."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path

import yaml

from .exceptions import DVCCommandError, DVCParseError, DVCRepositoryError
from .schemas import DVCDiffResult, DVCReproResult, DVCTrackResult, DVCVersionInfo


class DVCClient:
    """Wrapper around DVC and Git CLI commands."""

    def __init__(self, repo_path: str, remote_name: str = "minio") -> None:
        self.repo_path = Path(repo_path).resolve()
        self.remote_name = remote_name
        self._validate_repo()

    async def track(self, local_path: str, dataset_name: str, commit_message: str) -> DVCTrackResult:
        local_abs = Path(local_path).resolve()
        dvc_file = self._to_dvc_file(local_abs)
        rel_dvc_file = self._relpath(dvc_file)
        rel_data_path = self._relpath(local_abs)

        await self._run_command(["dvc", "add", rel_data_path], cwd=self.repo_path)
        await self._run_command(["git", "add", rel_dvc_file, ".gitignore"], cwd=self.repo_path)
        await self._run_command(["git", "commit", "-m", commit_message], cwd=self.repo_path)
        await self._run_command(["dvc", "push", "-r", self.remote_name], cwd=self.repo_path)

        info = await self.get_version_info(rel_dvc_file)
        stdout, _, _ = await self._run_command(["git", "rev-parse", "HEAD"], cwd=self.repo_path)
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
            ["dvc", "pull", dvc_file_path, "-r", self.remote_name],
            cwd=self.repo_path,
        )

    async def list_versions(self, dataset_name: str) -> list[DVCVersionInfo]:
        dvc_file_path = self._dataset_name_to_dvc_file(dataset_name)
        stdout, _, _ = await self._run_command(
            ["git", "log", "--all", "--date=iso-strict", "--pretty=format:%H|%cI", "--", dvc_file_path],
            cwd=self.repo_path,
        )
        versions: list[DVCVersionInfo] = []
        for line in (row.strip() for row in stdout.splitlines() if row.strip()):
            commit_sha, committed_at = line.split("|", maxsplit=1)
            content, _, _ = await self._run_command(
                ["git", "show", f"{commit_sha}:{dvc_file_path}"],
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
            ["git", "show", f"{version_a}:{dvc_file_path}"],
            cwd=self.repo_path,
        )
        content_b, _, _ = await self._run_command(
            ["git", "show", f"{version_b}:{dvc_file_path}"],
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
            ["dvc", "repro", pipeline_stage],
            cwd=self.repo_path,
        )
        return DVCReproResult(stage=pipeline_stage, success=True, stdout=stdout, stderr=stderr)

    async def _run_command(self, cmd: list[str], cwd: Path) -> tuple[str, str, int]:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(cwd),
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
