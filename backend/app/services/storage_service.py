"""Storage service abstraction for notebook synchronization."""

from __future__ import annotations


class StorageService:
    """Storage operations used by lifecycle workers."""

    async def sync_notebooks_to_minio(self, user_id: str, namespace: str) -> None:
        # Placeholder for MinIO synchronization workflow.
        _ = (user_id, namespace)
        return None
