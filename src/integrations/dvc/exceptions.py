"""Custom exceptions for DVC integration."""

from __future__ import annotations


class DVCError(Exception):
    """Base error for DVC integration layer."""


class DVCRepositoryError(DVCError):
    """Raised when repository layout/config is invalid."""


class DVCCommandError(DVCError):
    """Raised when a DVC/Git command fails."""

    def __init__(self, command: list[str], returncode: int, stdout: str, stderr: str) -> None:
        self.command = command
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr
        super().__init__(f"Command failed ({returncode}): {' '.join(command)}")


class DVCParseError(DVCError):
    """Raised when .dvc file parsing fails."""


class DVCSyncError(DVCError):
    """Raised when metadata sync into DB fails."""
