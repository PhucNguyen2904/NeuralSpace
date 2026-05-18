"""Unit tests for storage service."""

import pytest
from pathlib import Path


@pytest.mark.asyncio
async def test_get_temp_path(storage_service):
    """Test temporary path generation."""
    path = storage_service.get_temp_path("dl_test123")
    assert "dl_test123" in str(path)


@pytest.mark.asyncio
async def test_get_final_path_huggingface(storage_service):
    """Test final path for HuggingFace models."""
    path = storage_service.get_final_path(
        "huggingface",
        "mistralai/Mistral-7B-v0.1",
        "main"
    )
    assert "mistralai" in str(path)
    assert "Mistral-7B-v0.1" in str(path)
    assert "main" in str(path)


@pytest.mark.asyncio
async def test_disk_usage(storage_service):
    """Test disk usage calculation."""
    usage = storage_service.get_disk_usage()
    assert usage.total_bytes > 0
    assert usage.free_bytes >= 0
    assert 0 <= usage.percent_used <= 100


@pytest.mark.asyncio
async def test_check_space_sufficient(storage_service):
    """Test disk space check with sufficient space."""
    # Should not raise
    storage_service.check_space(1024 * 1024)  # 1MB


@pytest.mark.asyncio
async def test_ensure_dir(storage_service):
    """Test directory creation."""
    path = storage_service.base_path / "test" / "nested"
    storage_service.ensure_dir(path)
    assert path.exists()
