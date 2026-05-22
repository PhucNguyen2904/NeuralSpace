"""Storage service abstraction for notebook synchronization."""

from __future__ import annotations

import asyncio
import io
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import PurePosixPath
from urllib.parse import quote

import httpx
from minio import Minio

from app.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class StorageSyncError(RuntimeError):
    """Raised when notebook sync or restore cannot complete."""


@dataclass
class SyncResult:
    files_synced: int
    bytes_transferred: int
    errors: list[str]


@dataclass
class NotebookMeta:
    name: str
    size: int
    last_modified: datetime | None
    workspace_id: str
    path: str


class StorageService:
    """Storage operations used by lifecycle workers."""

    _SYNC_META_FILENAME = "_sync_metadata.json"

    def __init__(self, minio_client: Minio | None = None, jupyter_token: str = "") -> None:
        """Initialize storage service with MinIO and optional Jupyter token."""
        settings = get_settings()
        self.settings = settings
        self.bucket = settings.MINIO_BUCKET
        self.jupyter_token = jupyter_token
        self.minio = minio_client or Minio(
            endpoint=settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=False,
        )
        # Option A is implemented below (Jupyter Contents API sync).
        # Option B fallback design: mount shared notebook PVC into a storage worker and
        # perform rsync/rclone to MinIO for post-mortem sync when pod is gone.

    async def ensure_user_buckets(self, user_id: str) -> None:
        """Ensure the shared bucket exists and create a marker path for the user."""
        if not self.minio.bucket_exists(self.bucket):
            self.minio.make_bucket(self.bucket)
        marker_key = f"users/{user_id}/notebooks/.keep"
        self.minio.put_object(self.bucket, marker_key, io.BytesIO(b""), length=0)

    async def sync_notebooks_to_storage(self, user_id: str, workspace_id: str, pod_ip: str) -> SyncResult:
        """
        Sync all `.ipynb` files from Jupyter pod to MinIO.

        This is Option A (Jupyter API-based sync):
        - list files from `/api/contents/notebooks`
        - fetch notebook JSON content file-by-file
        - upload objects under `users/{user_id}/notebooks/{workspace_id}/`
        - write sync metadata
        """
        await self.ensure_user_buckets(user_id)
        notebook_paths = await self._list_notebook_paths(pod_ip)
        errors: list[str] = []
        files_synced = 0
        bytes_transferred = 0

        for notebook_path in notebook_paths:
            try:
                size = await asyncio.wait_for(
                    self._sync_single_notebook(user_id, workspace_id, pod_ip, notebook_path),
                    timeout=30.0,
                )
                files_synced += 1
                bytes_transferred += size
            except Exception as exc:
                message = f"{notebook_path}: {exc}"
                errors.append(message)
                logger.warning("Notebook sync failed", user_id=user_id, workspace_id=workspace_id, error=message)

        if notebook_paths and files_synced == 0:
            raise StorageSyncError(f"All notebook sync operations failed for workspace {workspace_id}")

        await self._store_sync_metadata(user_id, workspace_id, files_synced, bytes_transferred)
        return SyncResult(files_synced=files_synced, bytes_transferred=bytes_transferred, errors=errors)

    async def restore_notebooks_to_pod(self, user_id: str, workspace_id: str, pod_ip: str) -> SyncResult:
        """Restore all notebooks from MinIO workspace prefix back into a running pod."""
        prefix = self._workspace_prefix(user_id, workspace_id)
        objects = list(self.minio.list_objects(self.bucket, prefix=prefix, recursive=True))
        errors: list[str] = []
        files_synced = 0
        bytes_transferred = 0

        for obj in objects:
            object_name = getattr(obj, "object_name", "")
            if not object_name or object_name.endswith(self._SYNC_META_FILENAME):
                continue
            rel_path = object_name[len(prefix) :]
            try:
                payload = self.minio.get_object(self.bucket, object_name).read()
                notebook_json = json.loads(payload.decode("utf-8"))
                await asyncio.wait_for(
                    self._write_notebook_to_pod(pod_ip, rel_path, notebook_json),
                    timeout=30.0,
                )
                files_synced += 1
                bytes_transferred += len(payload)
            except Exception as exc:
                message = f"{rel_path}: {exc}"
                errors.append(message)
                logger.warning("Notebook restore failed", user_id=user_id, workspace_id=workspace_id, error=message)

        if objects and files_synced == 0:
            raise StorageSyncError(f"All notebook restore operations failed for workspace {workspace_id}")

        return SyncResult(files_synced=files_synced, bytes_transferred=bytes_transferred, errors=errors)

    async def restore_notebook_to_pod(self, user_id: str, file_path: str, pod_ip: str) -> SyncResult:
        """Restore a single notebook object path to pod via Jupyter Contents API."""
        object_name = file_path
        if not object_name.startswith(f"users/{user_id}/"):
            object_name = f"users/{user_id}/notebooks/{file_path.lstrip('/')}"
        payload = self.minio.get_object(self.bucket, object_name).read()
        notebook_rel_path = object_name.split("/notebooks/", maxsplit=1)[-1].split("/", maxsplit=1)[-1]
        if notebook_rel_path.endswith(".ipynb"):
            notebook_json = json.loads(payload.decode("utf-8"))
            await asyncio.wait_for(self._write_notebook_to_pod(pod_ip, notebook_rel_path, notebook_json), timeout=30.0)
        else:
            await asyncio.wait_for(self._write_file_to_pod(pod_ip, notebook_rel_path, payload.decode("utf-8")), timeout=30.0)
        return SyncResult(files_synced=1, bytes_transferred=len(payload), errors=[])

    async def generate_presigned_url(self, user_id: str, file_path: str, expires: int = 3600) -> str:
        """Generate MinIO presigned download URL for a user notebook object."""
        object_name = file_path
        if not object_name.startswith(f"users/{user_id}/"):
            object_name = f"users/{user_id}/notebooks/{file_path.lstrip('/')}"
        return self.minio.presigned_get_object(
            self.bucket,
            object_name,
            expires=timedelta(seconds=expires),
        )

    async def upload_user_notebook(self, user_id: str, workspace_id: str, filename: str, payload: bytes) -> NotebookMeta:
        """Upload one user notebook/script object to MinIO."""
        await self.ensure_user_buckets(user_id)
        safe_name = PurePosixPath(filename).name
        object_name = f"{self._workspace_prefix(user_id, workspace_id)}{safe_name}"
        self.minio.put_object(self.bucket, object_name, io.BytesIO(payload), length=len(payload))
        return NotebookMeta(
            name=safe_name,
            size=len(payload),
            last_modified=datetime.now(timezone.utc),
            workspace_id=workspace_id,
            path=object_name,
        )

    async def delete_user_notebook(self, user_id: str, file_path: str) -> None:
        """Delete one user notebook object from MinIO."""
        object_name = file_path
        if not object_name.startswith(f"users/{user_id}/"):
            object_name = f"users/{user_id}/notebooks/{file_path.lstrip('/')}"
        self.minio.remove_object(self.bucket, object_name)

    async def read_user_notebook_content(self, user_id: str, file_path: str) -> str:
        """Read notebook/script content from MinIO for preview usage."""
        object_name = file_path
        if not object_name.startswith(f"users/{user_id}/"):
            object_name = f"users/{user_id}/notebooks/{file_path.lstrip('/')}"
        payload = self.minio.get_object(self.bucket, object_name).read()
        return payload.decode("utf-8")

    async def list_user_notebooks(self, user_id: str, workspace_id: str | None = None) -> list[NotebookMeta]:
        """List notebook objects for a user, optionally filtered by workspace id."""
        prefix = f"users/{user_id}/notebooks/"
        if workspace_id:
            prefix = self._workspace_prefix(user_id, workspace_id)
        objects = self.minio.list_objects(self.bucket, prefix=prefix, recursive=True)

        notebooks: list[NotebookMeta] = []
        for obj in objects:
            object_name = getattr(obj, "object_name", "")
            if not object_name or object_name.endswith(self._SYNC_META_FILENAME):
                continue
            parsed = self._parse_notebook_key(object_name)
            if not parsed:
                continue
            notebooks.append(
                NotebookMeta(
                    name=parsed["name"],
                    size=int(getattr(obj, "size", 0)),
                    last_modified=getattr(obj, "last_modified", None),
                    workspace_id=parsed["workspace_id"],
                    path=object_name,
                )
            )
        return notebooks

    async def sync_notebooks_to_minio(self, user_id: str, namespace: str, pod_ip: str | None = None) -> None:
        """Backward-compatible wrapper used by legacy worker flow."""
        if not pod_ip:
            logger.warning("Skipping notebook sync because pod_ip is missing", user_id=user_id, workspace_id=namespace)
            return
        _ = await self.sync_notebooks_to_storage(user_id=user_id, workspace_id=namespace, pod_ip=pod_ip)

    async def _list_notebook_paths(self, pod_ip: str) -> list[str]:
        """List all notebook paths recursively under `notebooks/` in Jupyter."""
        entries = await self._read_jupyter_path(pod_ip, "notebooks")
        return await self._collect_ipynb(entries, pod_ip)

    async def _collect_ipynb(self, entries: list[dict], pod_ip: str) -> list[str]:
        """Recursively collect `.ipynb` paths from Jupyter contents tree."""
        results: list[str] = []
        for item in entries:
            kind = item.get("type")
            path = str(item.get("path") or "")
            if kind == "notebook" and path.endswith(".ipynb"):
                results.append(path)
                continue
            if kind == "directory" and path:
                children = await self._read_jupyter_path(pod_ip, path)
                results.extend(await self._collect_ipynb(children, pod_ip))
        return results

    async def _sync_single_notebook(self, user_id: str, workspace_id: str, pod_ip: str, notebook_path: str) -> int:
        """Fetch one notebook JSON from Jupyter and upload it to MinIO."""
        notebook = await self._fetch_notebook_content(pod_ip, notebook_path)
        raw = json.dumps(notebook, ensure_ascii=False).encode("utf-8")
        rel_path = notebook_path.split("notebooks/", maxsplit=1)[-1]
        object_name = f"{self._workspace_prefix(user_id, workspace_id)}{rel_path}"
        self.minio.put_object(self.bucket, object_name, io.BytesIO(raw), length=len(raw))
        return len(raw)

    async def _store_sync_metadata(
        self,
        user_id: str,
        workspace_id: str,
        file_count: int,
        total_size: int,
    ) -> None:
        """Write per-workspace sync metadata object after sync completes."""
        payload = {
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
            "file_count": file_count,
            "total_size": total_size,
        }
        raw = json.dumps(payload).encode("utf-8")
        self.minio.put_object(
            self.bucket,
            f"{self._workspace_prefix(user_id, workspace_id)}{self._SYNC_META_FILENAME}",
            io.BytesIO(raw),
            length=len(raw),
        )

    async def _read_jupyter_path(self, pod_ip: str, path: str) -> list[dict]:
        """Read directory entries from Jupyter Contents API path."""
        endpoint = f"http://{pod_ip}:8888/api/contents/{quote(path, safe='/')}?content=1"
        data = await self._jupyter_get_json(endpoint)
        content = data.get("content", [])
        if not isinstance(content, list):
            return []
        return content

    async def _fetch_notebook_content(self, pod_ip: str, notebook_path: str) -> dict:
        """Fetch full notebook document from Jupyter Contents API."""
        endpoint = f"http://{pod_ip}:8888/api/contents/{quote(notebook_path, safe='/')}?content=1"
        return await self._jupyter_get_json(endpoint)

    async def _write_notebook_to_pod(self, pod_ip: str, notebook_path: str, notebook_json: dict) -> None:
        """Write notebook JSON into pod using Jupyter Contents API PUT."""
        endpoint = f"http://{pod_ip}:8888/api/contents/{quote('notebooks/' + notebook_path, safe='/')}"
        payload = {
            "type": "notebook",
            "format": "json",
            "content": notebook_json.get("content"),
        }
        headers = {"Authorization": f"token {self.jupyter_token}"} if self.jupyter_token else {}
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.put(endpoint, json=payload, headers=headers)
            response.raise_for_status()

    async def _jupyter_get_json(self, endpoint: str) -> dict:
        """Execute authenticated Jupyter GET and parse JSON response."""
        headers = {"Authorization": f"token {self.jupyter_token}"} if self.jupyter_token else {}
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(endpoint, headers=headers)
            response.raise_for_status()
            return response.json()

    async def _write_file_to_pod(self, pod_ip: str, file_path: str, text_content: str) -> None:
        """Write text file (e.g. .py) into pod using Jupyter Contents API PUT."""
        endpoint = f"http://{pod_ip}:8888/api/contents/{quote('notebooks/' + file_path, safe='/')}"
        payload = {
            "type": "file",
            "format": "text",
            "content": text_content,
        }
        headers = {"Authorization": f"token {self.jupyter_token}"} if self.jupyter_token else {}
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.put(endpoint, json=payload, headers=headers)
            response.raise_for_status()

    def _workspace_prefix(self, user_id: str, workspace_id: str) -> str:
        """Build MinIO object prefix for a specific user workspace."""
        return f"users/{user_id}/notebooks/{workspace_id}/"

    @staticmethod
    def _parse_notebook_key(object_name: str) -> dict | None:
        """Parse MinIO object key to notebook metadata fields."""
        parts = object_name.split("/")
        if len(parts) < 5 or parts[0] != "users" or parts[2] != "notebooks":
            return None
        return {"workspace_id": parts[3], "name": parts[-1]}
