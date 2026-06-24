"""Sync service for DVC metadata into PostgreSQL."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mlops_tracking import AuditLog, DatasetVersion

from .client import DVCClient
from .exceptions import DVCSyncError
from .schemas import DVCTrackResult, IntegrityCheckResult


class DVCSyncService:
    """Synchronize tracked DVC metadata into internal tables."""

    def __init__(self, db_session: AsyncSession, dvc_client: DVCClient) -> None:
        self.db = db_session
        self.dvc_client = dvc_client

    async def sync_dataset_version(
        self,
        dataset_id: UUID,
        dvc_track_result: DVCTrackResult,
        created_by: UUID,
        version: str | None = None,
        changelog: str = "",
        item_count: int = 0,
        status: str = "draft",
        split_info: dict | None = None,
        schema_snapshot: dict | None = None,
    ) -> DatasetVersion:
        try:
            version = version or await self._next_version(str(dataset_id))
            latest_version = (await self.db.execute(
                select(DatasetVersion)
                .where(DatasetVersion.dataset_id == str(dataset_id), DatasetVersion.is_latest.is_(True))
            )).scalar_one_or_none()

            inherited_format = latest_version.format if latest_version else None
            inherited_task_type = latest_version.task_type if latest_version else None
            resolved_item_count = item_count if item_count > 0 else (latest_version.item_count if latest_version else 0)
            inherited_metadata_uri = latest_version.metadata_uri if latest_version else None
            inherited_validation_report_uri = latest_version.validation_report_uri if latest_version else None
            inherited_metadata_snapshot = latest_version.metadata_snapshot if latest_version else None

            await self.db.execute(
                update(DatasetVersion)
                .where(DatasetVersion.dataset_id == str(dataset_id), DatasetVersion.is_latest.is_(True))
                .values(is_latest=False)
            )

            row = DatasetVersion(
                id=str(uuid4()),
                dataset_id=str(dataset_id),
                version=version,
                dvc_md5=dvc_track_result.md5,
                dvc_commit=dvc_track_result.git_commit,
                storage_path=dvc_track_result.dvc_file_path,
                size_bytes=dvc_track_result.size_bytes,
                item_count=resolved_item_count,
                status=status,
                split_info=split_info or {},
                schema_snapshot=schema_snapshot or {},
                created_by=str(created_by),
                changelog=changelog,
                format=inherited_format,
                task_type=inherited_task_type,
                metadata_uri=inherited_metadata_uri,
                validation_report_uri=inherited_validation_report_uri,
                metadata_snapshot=inherited_metadata_snapshot,
                is_latest=True,
            )
            self.db.add(row)

            audit = AuditLog(
                entity_type="dataset_version",
                entity_id=row.id,
                action="create",
                actor_id=str(created_by),
                metadata_payload={
                    "dataset_id": str(dataset_id),
                    "version": version,
                    "dvc_md5": dvc_track_result.md5,
                    "dvc_commit": dvc_track_result.git_commit,
                    "size_bytes": dvc_track_result.size_bytes,
                    "item_count": item_count,
                },
            )
            self.db.add(audit)

            await self.db.commit()
            await self.db.refresh(row)
            return row
        except Exception as exc:  # noqa: BLE001
            await self.db.rollback()
            raise DVCSyncError(f"sync_dataset_version failed: {exc}") from exc


    async def sync_all_from_git(self, dataset_id: UUID, dataset_name: str) -> list[DatasetVersion]:
        versions = await self.dvc_client.list_versions(dataset_name)
        stmt = select(DatasetVersion.dvc_commit).where(DatasetVersion.dataset_id == str(dataset_id))
        existing_commits = {row[0] for row in (await self.db.execute(stmt)).all() if row[0]}

        created_rows: list[DatasetVersion] = []
        for item in reversed(versions):
            if not item.git_commit or item.git_commit in existing_commits:
                continue
            row = DatasetVersion(
                id=str(uuid4()),
                dataset_id=str(dataset_id),
                version=await self._next_version(str(dataset_id)),
                dvc_md5=item.md5,
                dvc_commit=item.git_commit,
                storage_path=item.dvc_file_path,
                size_bytes=item.size_bytes,
                created_by="00000000-0000-0000-0000-000000000000",
                changelog="resync from git history",
                is_latest=False,
                status="validated",
            )
            self.db.add(row)
            created_rows.append(row)

        if created_rows:
            await self.db.execute(
                update(DatasetVersion)
                .where(DatasetVersion.dataset_id == str(dataset_id), DatasetVersion.id == created_rows[-1].id)
                .values(is_latest=True)
            )
            await self.db.commit()
            for row in created_rows:
                await self.db.refresh(row)
        return created_rows

    async def validate_version_integrity(self, dataset_version_id: UUID) -> IntegrityCheckResult:
        row = await self.db.get(DatasetVersion, str(dataset_version_id))
        if row is None:
            raise DVCSyncError(f"dataset_version not found: {dataset_version_id}")
        if not row.storage_path:
            raise DVCSyncError(f"dataset_version has empty storage_path: {dataset_version_id}")

        actual = await self.dvc_client.get_version_info(row.storage_path)
        return IntegrityCheckResult(
            is_valid=(row.dvc_md5 == actual.md5),
            db_md5=str(row.dvc_md5 or ""),
            actual_md5=actual.md5,
            checked_at=datetime.now(timezone.utc),
        )

    async def _next_version(self, dataset_id: str) -> str:
        stmt = (
            select(DatasetVersion.version)
            .where(DatasetVersion.dataset_id == dataset_id)
            .order_by(DatasetVersion.created_at.desc())
            .limit(1)
        )
        current = (await self.db.execute(stmt)).scalar_one_or_none()
        if not current:
            return "v1.0"
        major, minor = self._parse_version(current)
        return f"v{major}.{minor + 1}"

    @staticmethod
    def _parse_version(version: str) -> tuple[int, int]:
        token = version.strip().lower().removeprefix("v")
        major_s, minor_s = token.split(".", maxsplit=1)
        return int(major_s), int(minor_s)
