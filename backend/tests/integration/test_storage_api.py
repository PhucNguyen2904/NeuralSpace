"""Integration tests for Storage API."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.main import app
from app.models.storage_connection import StorageConnection
from app.models.user import User


@pytest.fixture
def mock_storage_service():
    with patch("app.api.v1.storage.router.StorageService") as mock:
        service_instance = mock.return_value
        yield service_instance


@pytest.fixture
def mock_user():
    user = User(id="test-user-id", email="test@example.com")
    return user


@pytest.mark.asyncio
async def test_connect_storage(client: AsyncClient, mock_user, mock_storage_service, db_session):
    # Mock authentication to return our mock user
    app.dependency_overrides["app.api.dependencies.get_current_user"] = lambda: mock_user
    
    mock_storage_service.connect = AsyncMock()
    mock_storage_service.connect.return_value = StorageConnection(
        id="test-conn-id",
        user_id="test-user-id",
        provider="gdrive",
        remote_name="my-gdrive",
        config_path="/storage-configs/test-user-id/rclone.conf",
        display_name="My Google Drive"
    )

    response = await client.post(
        "/api/v1/storage/connect",
        json={
            "provider": "gdrive",
            "remote_name": "my-gdrive",
            "display_name": "My Google Drive",
            "params": {
                "client_id": "test_id",
                "client_secret": "test_secret",
                "token": '{"access_token": "token"}'
            }
        }
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "test-conn-id"
    assert data["provider"] == "gdrive"
    mock_storage_service.connect.assert_called_once()
    
    # Clean up override
    app.dependency_overrides = {}


@pytest.mark.asyncio
async def test_list_connections(client: AsyncClient, mock_user, mock_storage_service):
    app.dependency_overrides["app.api.dependencies.get_current_user"] = lambda: mock_user
    
    mock_storage_service.list_connections = AsyncMock()
    mock_storage_service.list_connections.return_value = [
        StorageConnection(
            id="test-conn-id",
            user_id="test-user-id",
            provider="s3",
            remote_name="my-s3",
            config_path="/storage-configs/test-user-id/rclone.conf",
            display_name="My S3"
        )
    ]

    response = await client.get("/api/v1/storage/list")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["provider"] == "s3"
    mock_storage_service.list_connections.assert_called_once_with("test-user-id")
    
    app.dependency_overrides = {}
