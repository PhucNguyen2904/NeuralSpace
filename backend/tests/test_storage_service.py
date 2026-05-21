"""Unit tests for storage service."""

from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.services.storage_service import StorageService


class FakeObjectResponse:
    def __init__(self, payload: bytes) -> None:
        self._payload = payload

    def read(self) -> bytes:
        return self._payload


class FakeMinio:
    def __init__(self) -> None:
        self.buckets: set[str] = set()
        self.objects: dict[str, bytes] = {}
        self.last_presign_expires = None

    def bucket_exists(self, bucket: str) -> bool:
        return bucket in self.buckets

    def make_bucket(self, bucket: str) -> None:
        self.buckets.add(bucket)

    def put_object(self, bucket: str, object_name: str, data: io.BytesIO, length: int) -> None:
        _ = bucket
        self.objects[object_name] = data.read(length)

    def get_object(self, bucket: str, object_name: str) -> FakeObjectResponse:
        _ = bucket
        return FakeObjectResponse(self.objects[object_name])

    def list_objects(self, bucket: str, prefix: str, recursive: bool = True):
        _ = (bucket, recursive)
        for name, payload in self.objects.items():
            if name.startswith(prefix):
                yield SimpleNamespace(
                    object_name=name,
                    size=len(payload),
                    last_modified=datetime.now(timezone.utc),
                )

    def presigned_get_object(self, bucket: str, object_name: str, expires):
        _ = bucket
        self.last_presign_expires = expires
        return f"https://minio.local/{object_name}?exp={int(expires.total_seconds())}"


@pytest.mark.asyncio
async def test_sync_notebooks_uploads_all_ipynb_files(monkeypatch: pytest.MonkeyPatch):
    minio = FakeMinio()
    service = StorageService(minio_client=minio)

    async def _fake_get(endpoint: str) -> dict:
        if endpoint.endswith("/api/contents/notebooks?content=1"):
            return {
                "content": [
                    {"type": "notebook", "path": "notebooks/a.ipynb"},
                    {"type": "notebook", "path": "notebooks/b.ipynb"},
                    {"type": "file", "path": "notebooks/readme.txt"},
                ]
            }
        if endpoint.endswith("notebooks/a.ipynb?content=1"):
            return {"content": {"cells": [{"source": "a"}]}, "path": "notebooks/a.ipynb"}
        if endpoint.endswith("notebooks/b.ipynb?content=1"):
            return {"content": {"cells": [{"source": "b"}]}, "path": "notebooks/b.ipynb"}
        raise AssertionError(f"Unexpected endpoint {endpoint}")

    monkeypatch.setattr(service, "_jupyter_get_json", _fake_get)

    result = await service.sync_notebooks_to_storage("u1", "ws1", "10.0.0.2")

    assert result.files_synced == 2
    assert len(result.errors) == 0
    assert "users/u1/notebooks/ws1/a.ipynb" in minio.objects
    assert "users/u1/notebooks/ws1/b.ipynb" in minio.objects


@pytest.mark.asyncio
async def test_sync_continues_on_single_file_failure(monkeypatch: pytest.MonkeyPatch):
    minio = FakeMinio()
    service = StorageService(minio_client=minio)

    async def _fake_get(endpoint: str) -> dict:
        if endpoint.endswith("/api/contents/notebooks?content=1"):
            return {
                "content": [
                    {"type": "notebook", "path": "notebooks/a.ipynb"},
                    {"type": "notebook", "path": "notebooks/b.ipynb"},
                ]
            }
        if endpoint.endswith("notebooks/a.ipynb?content=1"):
            return {"content": {"cells": [{"source": "a"}]}, "path": "notebooks/a.ipynb"}
        if endpoint.endswith("notebooks/b.ipynb?content=1"):
            raise RuntimeError("boom")
        raise AssertionError(f"Unexpected endpoint {endpoint}")

    monkeypatch.setattr(service, "_jupyter_get_json", _fake_get)

    result = await service.sync_notebooks_to_storage("u1", "ws1", "10.0.0.2")

    assert result.files_synced == 1
    assert len(result.errors) == 1
    assert "users/u1/notebooks/ws1/a.ipynb" in minio.objects


@pytest.mark.asyncio
async def test_restore_downloads_from_correct_path(monkeypatch: pytest.MonkeyPatch):
    minio = FakeMinio()
    service = StorageService(minio_client=minio)
    key = "users/u1/notebooks/ws1/demo.ipynb"
    minio.objects[key] = json.dumps({"content": {"cells": [{"source": "hello"}]}}).encode("utf-8")
    captured = {}

    async def _fake_write(pod_ip: str, notebook_path: str, notebook_json: dict) -> None:
        captured["pod_ip"] = pod_ip
        captured["path"] = notebook_path
        captured["content"] = notebook_json["content"]

    monkeypatch.setattr(service, "_write_notebook_to_pod", _fake_write)
    await service.restore_notebooks_to_pod("u1", "ws1", "10.0.0.9")

    assert captured["pod_ip"] == "10.0.0.9"
    assert captured["path"] == "demo.ipynb"
    assert captured["content"]["cells"][0]["source"] == "hello"


@pytest.mark.asyncio
async def test_presigned_url_has_correct_expiry():
    minio = FakeMinio()
    service = StorageService(minio_client=minio)

    url = await service.generate_presigned_url("u1", "ws1/demo.ipynb", expires=900)

    assert "exp=900" in url
    assert int(minio.last_presign_expires.total_seconds()) == 900
