from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.integrations.dvc.client import DVCClient  # noqa: E402
from src.integrations.dvc.exceptions import DVCCommandError, DVCRepositoryError  # noqa: E402


class _FakeProc:
    def __init__(self, stdout: str, stderr: str, returncode: int) -> None:
        self._stdout = stdout.encode()
        self._stderr = stderr.encode()
        self.returncode = returncode

    async def communicate(self):
        return self._stdout, self._stderr

    def kill(self) -> None:
        return None

    async def wait(self) -> None:
        return None


def _mk_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / ".git").mkdir()
    (repo / ".dvc").mkdir()
    (repo / "data").mkdir()
    return repo


@pytest.mark.asyncio
async def test_track_success(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    repo = _mk_repo(tmp_path)
    local_file = repo / "data" / "sample.csv"
    local_file.write_text("x,y\n1,2\n", encoding="utf-8")
    (repo / "data" / "sample.csv.dvc").write_text(
        "outs:\n  - md5: abc123\n    size: 123\n    path: data/sample.csv\n",
        encoding="utf-8",
    )

    calls: list[list[str]] = []
    responses = {
        ("dvc", "add", "data/sample.csv"): _FakeProc("", "", 0),
        ("git", "add", "data/sample.csv.dvc", ".gitignore"): _FakeProc("", "", 0),
        ("git", "commit", "-m", "track dataset"): _FakeProc("", "", 0),
        ("dvc", "push", "-r", "minio"): _FakeProc("", "", 0),
        ("git", "rev-parse", "HEAD"): _FakeProc("deadbeef\n", "", 0),
    }

    async def fake_create_subprocess_exec(*cmd, **kwargs):
        _ = kwargs
        calls.append(list(cmd))
        return responses[tuple(cmd)]

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    client = DVCClient(str(repo))
    result = await client.track(str(local_file), "sample", "track dataset")

    assert result.md5 == "abc123"
    assert result.git_commit == "deadbeef"
    assert result.size_bytes == 123
    assert calls[0] == ["dvc", "add", "data/sample.csv"]


@pytest.mark.asyncio
async def test_run_command_raises_on_error(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    repo = _mk_repo(tmp_path)

    async def fake_create_subprocess_exec(*cmd, **kwargs):
        _ = (cmd, kwargs)
        return _FakeProc("", "boom", 1)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create_subprocess_exec)

    client = DVCClient(str(repo))
    with pytest.raises(DVCCommandError):
        await client._run_command(["dvc", "status"], cwd=repo)


def test_init_invalid_repo(tmp_path: Path) -> None:
    bad_repo = tmp_path / "bad"
    bad_repo.mkdir()
    with pytest.raises(DVCRepositoryError):
        DVCClient(str(bad_repo))
