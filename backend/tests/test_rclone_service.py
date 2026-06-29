"""Unit tests for RcloneService."""

import json
import subprocess
from unittest.mock import MagicMock, patch

import pytest

from app.core.storage_exceptions import (
    AuthenticationFailed,
    FileAlreadyExists,
    PermissionDenied,
    RemoteNotFound,
    StorageException,
    StorageUnavailable,
)
from app.services.storage.rclone_service import RcloneService


@pytest.fixture
def rclone_service():
    return RcloneService()


def test_map_error_remote_not_found(rclone_service):
    err = rclone_service._map_error("Failed to create file system for \"myremote:\": didn't find section in config file", "unknown")
    assert isinstance(err, RemoteNotFound)


def test_map_error_authentication_failed(rclone_service):
    err = rclone_service._map_error("Failed to authenticate: token is expired", "gdrive")
    assert isinstance(err, AuthenticationFailed)


def test_map_error_permission_denied(rclone_service):
    err = rclone_service._map_error("Access denied to the resource", "s3")
    assert isinstance(err, PermissionDenied)


def test_map_error_file_already_exists(rclone_service):
    err = rclone_service._map_error("File already exists", "local")
    assert isinstance(err, FileAlreadyExists)


def test_map_error_storage_unavailable(rclone_service):
    err = rclone_service._map_error("dial tcp 10.0.0.1:443: i/o timeout", "minio")
    assert isinstance(err, StorageUnavailable)


@patch("subprocess.run")
def test_command_success(mock_run, rclone_service):
    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = "success output"
    mock_result.stderr = ""
    mock_run.return_value = mock_result

    result = rclone_service.command(["ls", "remote:"], config_path="/test/config")
    
    mock_run.assert_called_once_with(
        ["rclone", "ls", "remote:", "--config", "/test/config"],
        capture_output=True,
        text=True,
        check=False
    )
    assert result.stdout == "success output"


@patch("subprocess.run")
def test_command_failure(mock_run, rclone_service):
    mock_result = MagicMock()
    mock_result.returncode = 1
    mock_result.stdout = ""
    mock_result.stderr = "didn't find section in config file"
    mock_run.return_value = mock_result

    with pytest.raises(RemoteNotFound):
        rclone_service.command(["ls", "remote:"], config_path="/test/config")


@patch("subprocess.run")
def test_lsjson(mock_run, rclone_service):
    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = '[{"Path":"file.txt","Name":"file.txt","Size":123,"IsDir":false}]'
    mock_result.stderr = ""
    mock_run.return_value = mock_result

    result = rclone_service.lsjson("/test/config", "remote:path")
    assert len(result) == 1
    assert result[0]["Name"] == "file.txt"
    assert result[0]["Size"] == 123
