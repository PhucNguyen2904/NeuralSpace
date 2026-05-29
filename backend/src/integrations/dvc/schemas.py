"""Pydantic schemas for DVC metadata and sync results."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class DVCTrackResult(BaseModel):
    dataset_name: str
    md5: str
    git_commit: str
    dvc_file_path: str
    size_bytes: int = 0


class DVCVersionInfo(BaseModel):
    md5: str
    size_bytes: int = 0
    path: str
    dvc_file_path: str
    git_commit: str | None = None
    committed_at: datetime | None = None


class DVCDiffResult(BaseModel):
    version_a: str
    version_b: str
    md5_a: str
    md5_b: str
    added: int = 0
    modified: int = 0
    deleted: int = 0
    unchanged: int = 0
    changed: bool = Field(default=False)


class DVCReproResult(BaseModel):
    stage: str
    success: bool
    stdout: str = ""
    stderr: str = ""


class IntegrityCheckResult(BaseModel):
    is_valid: bool
    db_md5: str
    actual_md5: str
    checked_at: datetime
