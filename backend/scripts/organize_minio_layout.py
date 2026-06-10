"""Normalize workspace-data object layout and DB storage references.

The script copies objects into canonical prefixes and updates DB rows to
reference the new S3 URIs. Legacy objects are kept by default.
"""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from pathlib import PurePosixPath

from minio.commonconfig import CopySource
from minio.error import S3Error
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.clients.minio_client import get_minio_client
from app.config import get_settings
from app.models.dataset import Dataset
from app.models.model_registry import ModelRegistry


@dataclass
class MigrationResult:
    copied: int = 0
    updated: int = 0
    skipped: int = 0
    missing: int = 0


def storage_location(storage_path: str, default_bucket: str) -> tuple[str, str]:
    value = storage_path.strip()
    if value.startswith("s3://"):
        bucket, _, object_name = value.removeprefix("s3://").partition("/")
        return bucket or default_bucket, object_name.lstrip("/")
    return default_bucket, value.lstrip("/")


def safe_part(value: str | None, fallback: str) -> str:
    raw = (value or fallback).replace("\\", "/").split("/")[-1].strip()
    if not raw:
        raw = fallback
    return "".join(char if char.isalnum() or char in {".", "-", "_"} else "_" for char in raw)


def filename_from_object(object_name: str, fallback: str) -> str:
    return safe_part(PurePosixPath(object_name).name, fallback)


def s3_uri(bucket: str, object_name: str) -> str:
    return f"s3://{bucket}/{object_name}"


def object_exists(client, bucket: str, object_name: str) -> bool:
    try:
        client.stat_object(bucket, object_name)
        return True
    except S3Error as exc:
        if exc.code in {"NoSuchBucket", "NoSuchKey"}:
            return False
        raise


def copy_if_needed(client, source_bucket: str, source_object: str, target_bucket: str, target_object: str, apply: bool) -> bool:
    if source_bucket == target_bucket and source_object == target_object:
        return False
    if object_exists(client, target_bucket, target_object):
        return False
    if not apply:
        return True
    client.copy_object(target_bucket, target_object, CopySource(source_bucket, source_object))
    return True


def update_model_source_payload(row: ModelRegistry, new_storage_path: str, new_object_name: str) -> dict:
    payload = dict(row.source_payload or {})
    payload["minio_object"] = new_object_name

    files = list(payload.get("files") or [])
    if files:
        first = dict(files[0])
        first["storage_path"] = new_storage_path
        files[0] = first
        payload["files"] = files

    history = []
    for item in payload.get("version_history") or []:
        entry = dict(item)
        if entry.get("version") == row.version:
            entry["storage_path"] = new_storage_path
            entry["object_name"] = new_object_name
            if isinstance(entry.get("file"), dict):
                file_info = dict(entry["file"])
                file_info["storage_path"] = new_storage_path
                entry["file"] = file_info
        history.append(entry)
    if history:
        payload["version_history"] = history
    return payload


def notebook_target_object(source_object: str) -> str | None:
    old_prefix = "migration/server/notebooks/"
    if not source_object.startswith(old_prefix):
        return None
    relative = source_object.removeprefix(old_prefix).lstrip("/")
    if not relative:
        return None
    return f"notebooks/{relative}"


async def migrate_datasets(session: AsyncSession, client, bucket: str, apply: bool) -> MigrationResult:
    result = MigrationResult()
    rows = (await session.execute(select(Dataset).where(Dataset.storage_path.is_not(None)))).scalars().all()
    for row in rows:
        source_bucket, source_object = storage_location(row.storage_path or "", bucket)
        target_object = f"datasets/{row.id}/versions/v1/{filename_from_object(source_object, 'dataset')}"
        if not object_exists(client, source_bucket, source_object):
            print(f"MISSING dataset {row.id}: {row.storage_path}")
            result.missing += 1
            continue
        if copy_if_needed(client, source_bucket, source_object, bucket, target_object, apply):
            print(f"COPY dataset {row.id}: {source_object} -> {target_object}")
            result.copied += 1
        new_path = s3_uri(bucket, target_object)
        if row.storage_path != new_path:
            print(f"UPDATE dataset {row.id}: {row.storage_path} -> {new_path}")
            if apply:
                row.storage_path = new_path
                row.source_payload = {**(row.source_payload or {}), "minio_object": target_object}
            result.updated += 1
        else:
            result.skipped += 1
    return result


async def migrate_models(session: AsyncSession, client, bucket: str, apply: bool) -> MigrationResult:
    result = MigrationResult()
    rows = (await session.execute(select(ModelRegistry).where(ModelRegistry.storage_path.is_not(None)))).scalars().all()
    for row in rows:
        source_bucket, source_object = storage_location(row.storage_path or "", bucket)
        version = safe_part(row.version, "v1")
        target_object = f"models/{row.id}/versions/{version}/{filename_from_object(source_object, 'model.bin')}"
        if not object_exists(client, source_bucket, source_object):
            print(f"MISSING model {row.id}: {row.storage_path}")
            result.missing += 1
            continue
        if copy_if_needed(client, source_bucket, source_object, bucket, target_object, apply):
            print(f"COPY model {row.id}: {source_object} -> {target_object}")
            result.copied += 1
        new_path = s3_uri(bucket, target_object)
        if row.storage_path != new_path:
            print(f"UPDATE model {row.id}: {row.storage_path} -> {new_path}")
            if apply:
                row.storage_path = new_path
                row.source_payload = update_model_source_payload(row, new_path, target_object)
            result.updated += 1
        else:
            result.skipped += 1
    return result


async def migrate_notebooks(client, bucket: str, apply: bool, delete_legacy: bool) -> MigrationResult:
    result = MigrationResult()
    objects = list(client.list_objects(bucket, prefix="migration/server/notebooks/", recursive=True))
    for obj in objects:
        source_object = obj.object_name
        target_object = notebook_target_object(source_object)
        if target_object is None:
            result.skipped += 1
            continue
        if copy_if_needed(client, bucket, source_object, bucket, target_object, apply):
            print(f"COPY notebook: {source_object} -> {target_object}")
            result.copied += 1
        if delete_legacy:
            print(f"DELETE notebook legacy: {source_object}")
            if apply:
                client.remove_object(bucket, source_object)
            result.updated += 1
    return result


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Apply object copies and DB updates.")
    parser.add_argument("--include-notebooks", action="store_true", help="Move legacy notebook objects to notebooks/{workspace_id}/...")
    parser.add_argument("--delete-legacy-notebooks", action="store_true", help="Delete old migration/server/notebooks objects after copying.")
    args = parser.parse_args()

    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    client = get_minio_client()._client
    bucket = settings.MINIO_BUCKET

    async with session_factory() as session:
        dataset_result = await migrate_datasets(session, client, bucket, args.apply)
        model_result = await migrate_models(session, client, bucket, args.apply)
        notebook_result = MigrationResult()
        if args.include_notebooks:
            notebook_result = await migrate_notebooks(client, bucket, args.apply, args.delete_legacy_notebooks)
        if args.apply:
            await session.commit()
        else:
            await session.rollback()

    await engine.dispose()
    print(
        "SUMMARY "
        f"datasets={dataset_result} "
        f"models={model_result} "
        f"notebooks={notebook_result} "
        f"mode={'apply' if args.apply else 'dry-run'}"
    )


if __name__ == "__main__":
    asyncio.run(main())
