"""Integration tests for download API."""

import pytest
from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


def test_health_check():
    """Test health check endpoint."""
    response = client.get("/api/v1/health")
    assert response.status_code in [200, 503]  # May be degraded in test
    data = response.json()
    assert "status" in data
    assert "checks" in data


def test_list_models():
    """Test listing models endpoint."""
    response = client.get("/api/v1/models")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data


def test_list_tasks():
    """Test listing tasks endpoint."""
    response = client.get("/api/v1/tasks")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
