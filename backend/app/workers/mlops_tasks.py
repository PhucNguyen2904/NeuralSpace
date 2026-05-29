from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.workers.celery_app import celery_app
from app.models.mlops_tracking import MLDataset
from src.integrations.dvc.client import DVCClient
from src.integrations.dvc.sync import DVCSyncService


@celery_app.task(name="app.workers.mlops_tasks.track_dataset_version_task", bind=True)
def track_dataset_version_task(
    self,
    *,
    dataset_id: str,
    created_by: str,
    local_path: str,
    dataset_name: str,
    commit_message: str,
    changelog: str,
    repo_path: str,
    remote_name: str = "minio",
) -> dict:
    async def _run() -> dict:
        settings = get_settings()
        engine = create_async_engine(settings.DATABASE_URL, future=True)
        session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with session_maker() as db:
            dataset = await db.get(MLDataset, dataset_id)
            if dataset is None:
                raise ValueError(f"Dataset not found: {dataset_id}")

            client = DVCClient(repo_path=repo_path, remote_name=remote_name)
            track_result = await client.track(local_path=local_path, dataset_name=dataset_name, commit_message=commit_message)
            sync = DVCSyncService(db_session=db, dvc_client=client)
            version = await sync.sync_dataset_version(
                dataset_id=dataset_id,
                dvc_track_result=track_result,
                created_by=created_by,
                changelog=changelog,
            )
        await engine.dispose()
        return {"dataset_version_id": version.id, "version": version.version, "dvc_md5": version.dvc_md5}

    return asyncio.run(_run())
