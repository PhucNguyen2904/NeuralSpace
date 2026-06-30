from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext
from app.models.mlops_tracking import DatasetVersion, MLDataset
from app.repositories.mlops_dataset_repository import DatasetVersionRepository, MLDatasetRepository
from app.schemas.mlops_dataset import (
    DatasetCreateRequest,
    DatasetUpdateRequest,
    DatasetVersionPatchRequest,
    DatasetVersionTrackRequest,
)
from src.integrations.dvc.client import DVCClient
from src.integrations.dvc.exceptions import DVCCommandError, DVCRepositoryError
from src.integrations.dvc.sync import DVCSyncService


class DatasetService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_dataset(self, payload: DatasetCreateRequest, user: UserContext) -> MLDataset:
        existing = await MLDatasetRepository.get_by_name(self.db, payload.name)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Dataset name already exists")
        row = MLDataset(
            id=str(uuid4()),
            name=payload.name,
            description=payload.description,
            type=payload.type,
            owner_id=user.user_id,
            team_id=payload.team_id,
            dvc_profile_id=payload.dvc_profile_id,
            dvc_repo_url=payload.dvc_repo_url,
            storage_path=payload.storage_path,
            tags=payload.tags,
            status="active",
        )
        return await MLDatasetRepository.create(self.db, row)

    async def list_datasets(self, page: int, page_size: int, status_filter: str | None, q: str | None) -> tuple[list[MLDataset], int]:
        return await MLDatasetRepository.list(self.db, page=page, page_size=page_size, status=status_filter, q=q)

    async def get_dataset(self, dataset_id: str) -> MLDataset:
        row = await MLDatasetRepository.get_by_id(self.db, dataset_id)
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
        return row

    async def update_dataset(self, dataset_id: str, payload: DatasetUpdateRequest, user: UserContext) -> MLDataset:
        row = await self.get_dataset(dataset_id)
        self._check_write_permission(row, user)
        if payload.description is not None:
            row.description = payload.description
        if payload.tags is not None:
            row.tags = payload.tags
        if payload.status is not None:
            row.status = payload.status
        return await MLDatasetRepository.save(self.db, row)

    async def archive_dataset(self, dataset_id: str, user: UserContext) -> MLDataset:
        row = await self.get_dataset(dataset_id)
        self._check_write_permission(row, user)
        row.status = "archived"
        return await MLDatasetRepository.save(self.db, row)

    async def list_versions(self, dataset_id: str) -> list[DatasetVersion]:
        await self.get_dataset(dataset_id)
        return await DatasetVersionRepository.list_by_dataset(self.db, dataset_id)

    async def get_version(self, dataset_id: str, version_id: str) -> DatasetVersion:
        row = await DatasetVersionRepository.get(self.db, version_id)
        if row is None or row.dataset_id != dataset_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset version not found")
        return row

    async def patch_version(self, dataset_id: str, version_id: str, payload: DatasetVersionPatchRequest) -> DatasetVersion:
        row = await self.get_version(dataset_id, version_id)
        if payload.changelog is not None:
            row.changelog = payload.changelog
        if payload.status is not None:
            row.status = payload.status
        return await DatasetVersionRepository.save(self.db, row)

    async def validate_integrity(self, version: DatasetVersion, dvc_client: DVCClient) -> dict:
        sync = DVCSyncService(self.db, dvc_client)
        result = await sync.validate_version_integrity(version.id)
        return {
            "is_valid": result.is_valid,
            "checked_at": result.checked_at,
            "details": {
                "db_md5": result.db_md5,
                "actual_md5": result.actual_md5,
            },
        }

    async def lineage(self, version: DatasetVersion) -> tuple[list[dict], list[dict]]:
        runs, models = await DatasetVersionRepository.lineage(self.db, version.id)
        run_items = [
            {
                "run_id": run.id,
                "mlflow_run_id": run.mlflow_run_id,
                "status": run.status,
                "start_time": run.start_time,
                "end_time": run.end_time,
            }
            for run in runs
        ]
        model_items = [
            {
                "model_version_id": mv.id,
                "model_name": mv.mlflow_name,
                "version": mv.mlflow_version,
                "stage": mv.stage,
            }
            for mv in models
        ]
        return run_items, model_items

    async def pull_version(self, version: DatasetVersion, dvc_client: DVCClient, target_path: str, user: UserContext = None) -> dict:
        if not version.storage_path:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Dataset version has no DVC storage_path")
            
        if user:
            from app.services.gdrive_service import GDriveTokenManager
            from app.config import get_settings
            gdrive_manager = GDriveTokenManager(self.db, get_settings())
            gdrive_provider = await gdrive_manager.get_gdrive_provider(user.user_id)
            if gdrive_provider:
                await gdrive_manager.write_credentials_file(str(dvc_client.repo_path), gdrive_provider)
                async def on_auth_error() -> bool:
                    success = await gdrive_manager.refresh_token(gdrive_provider)
                    if success:
                        await gdrive_manager.write_credentials_file(str(dvc_client.repo_path), gdrive_provider)
                    return success
                dvc_client.on_auth_error = on_auth_error

        await dvc_client.pull(version.storage_path, target_path)
        return {"workspace_path": target_path, "size_bytes": int(version.size_bytes or 0)}

    async def diff_versions(self, dataset_id: str, version_a: str, version_b: str, dvc_client: DVCClient) -> dict:
        versions = await DatasetVersionRepository.list_by_dataset(self.db, dataset_id)
        by_version = {v.version: v for v in versions}
        a = by_version.get(version_a)
        b = by_version.get(version_b)
        if a is None or b is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or both versions not found")
        if not a.storage_path or not a.dvc_commit or not b.dvc_commit:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Missing DVC metadata for diff")
        diff = await dvc_client.diff(a.dvc_commit, b.dvc_commit, a.storage_path)
        return diff.model_dump()

    async def track_new_version(
        self,
        *,
        dataset: MLDataset,
        file: UploadFile,
        version: str | None,
        commit_message: str,
        changelog: str,
        item_count: int,
        version_status: str,
        split_info: dict | None,
        schema_snapshot: dict | None,
        user: UserContext,
        dvc_repo_path: str,
        dvc_remote_name: str,
        dvc_profile_id: str | None = None,
        ssh_key_encrypted: bytes | None = None,
        git_ssh_url: str | None = None,
    ) -> DatasetVersion:
        """
        Upload *file* into the DVC working repo, run `dvc add` + `git commit`
        + `dvc push`, then persist a new DatasetVersion row in Postgres.
        """
        requested_version = self._normalize_version(version) if version else None
        if requested_version:
            existing_version = (
                await self.db.execute(
                    select(DatasetVersion.id).where(
                        DatasetVersion.dataset_id == dataset.id,
                        DatasetVersion.version == requested_version,
                    )
                )
            ).scalar_one_or_none()
            if existing_version is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Dataset version already exists: {requested_version}",
                )

        if not requested_version:
            existing_all = (
                await self.db.execute(
                    select(DatasetVersion.version).where(DatasetVersion.dataset_id == dataset.id)
                )
            ).scalars().all()
            majors = []
            for value in existing_all:
                token = str(value or "").lower().removeprefix("v").split(".", 1)[0]
                if token.isdigit():
                    majors.append(int(token))
            requested_version = f"v{(max(majors) if majors else 0) + 1}.0"

        # ── 1. Validate DVC repo & Setup Google Drive Token ─────────────────────────────
        try:
            from app.services.gdrive_service import GDriveTokenManager
            from app.config import get_settings
            
            settings = get_settings()
            gdrive_manager = GDriveTokenManager(self.db, settings)
            
            dvc_client = DVCClient(
                dvc_repo_path, 
                remote_name=dvc_remote_name,
                ssh_key_encrypted=ssh_key_encrypted,
                git_ssh_url=git_ssh_url,
            )
            
            # If the remote is Google Drive, we need to prepare the credentials file
            # Wait, mlops_dataset_service doesn't easily know if the remote is GDrive without reading dvc config.
            # But we can just fetch the GDrive provider and if it exists, assume it might be used.
            # A cleaner way is to inject an auth error handler that will try to refresh if it's GDrive.
            
            gdrive_provider = await gdrive_manager.get_gdrive_provider(user.user_id)
            if gdrive_provider:
                await gdrive_manager.write_credentials_file(dvc_repo_path, gdrive_provider)
                
                async def on_auth_error() -> bool:
                    success = await gdrive_manager.refresh_token(gdrive_provider)
                    if success:
                        await gdrive_manager.write_credentials_file(dvc_repo_path, gdrive_provider)
                    return success
                    
                dvc_client.on_auth_error = on_auth_error
                
        except DVCRepositoryError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"DVC repo not ready: {exc}",
            ) from exc

        folder_id = dataset.id

        # ── 2. Write file to a safe staging path inside the DVC repo ────────
        # Structure: <dvc_repo>/{folder_id}/{version}/{original_filename}
        safe_name = Path(file.filename or "upload").name
        staging_dir = Path(dvc_repo_path) / folder_id / requested_version
        staging_dir.mkdir(parents=True, exist_ok=True)
        staging_file = staging_dir / safe_name

        def _save_file() -> int:
            file.file.seek(0)
            size = 0
            with staging_file.open("wb") as f:
                import shutil
                shutil.copyfileobj(file.file, f)
            return staging_file.stat().st_size

        file_size = await asyncio.to_thread(_save_file)

        # ── Upload to MinIO: delta if previous version exists, full otherwise ──
        from app.services.dataset_storage_service import DatasetStorageService
        from app.services.dataset_delta_service import compute_zip_delta, apply_delta, detect_delta_type
        from app.clients.minio_client import get_minio_client

        storage = DatasetStorageService()
        minio = get_minio_client()

        # Find the latest existing version to use as base for delta
        existing_versions = (
            await self.db.execute(
                select(DatasetVersion)
                .where(DatasetVersion.dataset_id == dataset.id, DatasetVersion.is_latest.is_(True))
                .order_by(DatasetVersion.created_at.desc())
                .limit(1)
            )
        ).scalars().all()
        base_version_row = existing_versions[0] if existing_versions else None

        delta_metadata: dict = {}
        raw_uri = ""

        if base_version_row and base_version_row.storage_path:
            # ── Delta path: compute diff vs previous version ──────────────
            try:
                base_storage_path = base_version_row.storage_path
                base_object_name = base_storage_path
                base_bucket = None
                if base_storage_path.startswith("s3://"):
                    _, rest = base_storage_path.split("s3://", 1)
                    base_bucket, _, base_object_name = rest.partition("/")

                base_raw = await minio.get_object_data(base_object_name, bucket=base_bucket)
                new_raw = staging_file.read_bytes()

                delta_type = detect_delta_type(safe_name)
                if delta_type == "zip":
                    delta_bytes, manifest = compute_zip_delta(base_raw, new_raw, base_version_row.version)
                elif delta_type == "csv":
                    from app.services.dataset_delta_service import compute_csv_delta
                    delta_bytes, manifest = compute_csv_delta(base_raw, new_raw, base_version_row.version)
                elif delta_type == "json":
                    from app.services.dataset_delta_service import compute_json_delta
                    delta_bytes, manifest = compute_json_delta(base_raw, new_raw, base_version_row.version)
                else:
                    # Fallback for unknown types
                    delta_bytes = new_raw
                    from app.services.dataset_delta_service import DeltaManifest
                    manifest = DeltaManifest(
                        base_version=base_version_row.version,
                        delta_type=delta_type,
                        added=[],
                        modified=[safe_name],
                        removed=[],
                    )

                delta_filename = f"delta_{safe_name}"
                import io as _io
                with _io.BytesIO(delta_bytes) as delta_stream:
                    raw_uri = await storage.upload_raw_stream(
                        dataset_id=folder_id,
                        version=requested_version,
                        filename=delta_filename,
                        fileobj=delta_stream,
                        size=len(delta_bytes),
                        content_type="application/zip",
                    )

                delta_metadata = {
                    "is_delta": True,
                    "base_version_id": base_version_row.id,
                    "base_version": base_version_row.version,
                    "delta_type": delta_type,
                    "delta_manifest": manifest.to_dict(),
                    "delta_size_bytes": len(delta_bytes),
                    "full_size_bytes": file_size,
                    "savings_bytes": file_size - len(delta_bytes),
                }

            except Exception as exc:
                # If delta computation fails for any reason, fall back to full upload
                import traceback
                from app.core.logging import get_logger
                get_logger(__name__).error("Delta computation failed", error=str(exc), tb=traceback.format_exc())
                delta_metadata = {}
                try:
                    with staging_file.open("rb") as f:
                        raw_uri = await storage.upload_raw_stream(
                            dataset_id=folder_id,
                            version=requested_version,
                            filename=safe_name,
                            fileobj=f,
                            size=file_size,
                            content_type=file.content_type or "application/octet-stream",
                        )
                except Exception as e:
                    raise HTTPException(status_code=500, detail=f"Failed to upload file to MinIO: {e}")
        else:
            # ── Full upload: first version, no base to diff against ───────
            try:
                with staging_file.open("rb") as f:
                    raw_uri = await storage.upload_raw_stream(
                        dataset_id=folder_id,
                        version=requested_version,
                        filename=safe_name,
                        fileobj=f,
                        size=file_size,
                        content_type=file.content_type or "application/octet-stream",
                    )
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to upload raw file to MinIO: {e}")

        # ── 3. DVC track: add → git commit → push ────────────────────────
        try:
            track_result = await dvc_client.track(
                local_path=str(staging_file),
                dataset_name=dataset.name,
                commit_message=commit_message or f"chore(data): track version for {dataset.name}",
            )
        except DVCCommandError as exc:
            await storage.delete_version_prefix(dataset_id=dataset.id, version=requested_version)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"DVC tracking failed: {exc.stderr or exc}",
            ) from exc
        except Exception:
            await storage.delete_version_prefix(dataset_id=dataset.id, version=requested_version)
            raise

        try:
            # ── 4. Sync metadata into DB (marks old version as not-latest) ───
            sync = DVCSyncService(self.db, dvc_client)
            new_version = await sync.sync_dataset_version(
                dataset_id=UUID(dataset.id),
                dvc_track_result=track_result,
                created_by=UUID(user.user_id),
                version=requested_version,
                changelog=changelog,
                item_count=item_count,
                status=version_status,
                split_info=split_info,
                schema_snapshot=schema_snapshot,
            )

            # ── 5. Update parent MLDataset metadata ──────────────────────────
            dataset.storage_path = raw_uri
            new_version.storage_path = raw_uri
            if dvc_profile_id is not None:
                dataset.dvc_profile_id = dvc_profile_id
                new_version.dvc_profile_id = dvc_profile_id
            dataset.updated_at = datetime.now()

            # Merge delta info into metadata_snapshot (no migration needed)
            if delta_metadata:
                existing_snapshot = new_version.metadata_snapshot or {}
                new_version.metadata_snapshot = {**existing_snapshot, **delta_metadata}
                # size_bytes reflects what was actually stored (delta size)
                if "delta_size_bytes" in delta_metadata:
                    new_version.size_bytes = delta_metadata["delta_size_bytes"]

            await self.db.commit()
            await self.db.refresh(dataset)
            await self.db.refresh(new_version)
        except Exception:
            await self.db.rollback()
            await storage.delete_version_prefix(dataset_id=dataset.id, version=requested_version)
            raise


        return new_version

    async def track_delta_version(
        self,
        *,
        dataset: MLDataset,
        delta_file: UploadFile,
        base_version_id: str,
        version: str | None,
        commit_message: str,
        changelog: str,
        item_count: int,
        version_status: str,
        split_info: dict | None,
        schema_snapshot: dict | None,
        user: UserContext,
        dvc_repo_path: str,
        dvc_remote_name: str,
        dvc_profile_id: str | None = None,
        ssh_key_encrypted: bytes | None = None,
        git_ssh_url: str | None = None,
    ) -> DatasetVersion:
        """
        Upload a *delta* file, merge it with the base version, and create a
        new DatasetVersion as if the full merged file had been uploaded.

        Steps:
        1. Resolve the base DatasetVersion row and download its file from MinIO.
        2. Read the delta file from the client.
        3. Detect delta type (zip / csv / json) from the base filename.
        4. Apply delta → reconstructed full file.
        5. Delegate to track_new_version() with the merged bytes as an in-memory
           UploadFile, so all DVC / DB logic stays the same.
        """
        from app.clients.minio_client import get_minio_client
        from app.models.mlops_tracking import DVCProfile
        from app.services.dataset_delta_service import apply_delta, detect_delta_type
        import re as _re

        # ── 1. Resolve base version ───────────────────────────────────────
        base_version_row = (
            await self.db.execute(
                select(DatasetVersion)
                .where(
                    DatasetVersion.id == base_version_id,
                    DatasetVersion.dataset_id == dataset.id,
                )
            )
        ).scalar_one_or_none()
        if base_version_row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Base version not found: {base_version_id}",
            )

        # ── 2. Download base file from MinIO ─────────────────────────────
        base_storage_path = base_version_row.storage_path
        if not base_storage_path:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Base version has no storage path; cannot compute delta.",
            )

        minio = get_minio_client()
        bucket = None
        object_name = base_storage_path

        if base_storage_path.startswith("s3://"):
            _, rest = base_storage_path.split("s3://", 1)
            bucket, _, object_name = rest.partition("/")
        elif base_storage_path.startswith("datasets/"):
            object_name = base_storage_path

        # Resolve DVC-based storage if needed
        if base_version_row.dvc_md5:
            dvc_md5 = base_version_row.dvc_md5.strip()
            dvc_prefix = "dvc/"
            if base_version_row.dvc_profile_id:
                profile_row = await self.db.get(DVCProfile, base_version_row.dvc_profile_id)
                if profile_row and profile_row.remote_url:
                    m = _re.match(r"s3://([^/]+)(/.*)?", profile_row.remote_url.strip())
                    if m:
                        bucket = m.group(1)
                        parsed_prefix = m.group(2).strip("/") if m.group(2) else ""
                        if parsed_prefix:
                            dvc_prefix = parsed_prefix + "/"
            object_name = f"{dvc_prefix}files/md5/{dvc_md5[:2]}/{dvc_md5[2:]}"

        try:
            base_raw = await minio.get_object_data(object_name, bucket=bucket)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to download base version from storage: {exc}",
            ) from exc

        # ── 3. Read delta bytes ───────────────────────────────────────────
        delta_raw = await delta_file.read()
        if not delta_raw:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Delta file is empty.",
            )

        # ── 4. Detect type & apply delta ─────────────────────────────────
        base_filename = (delta_file.filename or "upload.zip")
        # Try to infer from the base version storage path
        if base_storage_path:
            base_filename = Path(base_storage_path).name

        delta_type = detect_delta_type(base_filename)
        try:
            merged_raw, manifest = apply_delta(base_raw, delta_raw, delta_type)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Failed to apply delta: {exc}",
            ) from exc

        # ── 5. Build an in-memory UploadFile from merged bytes ────────────
        import io as _io

        class _InMemoryUploadFile:
            """Minimal shim that satisfies the interface used by track_new_version."""
            def __init__(self, raw: bytes, filename: str, content_type: str) -> None:
                self.filename = filename
                self.content_type = content_type
                self.size = len(raw)
                self.file = _io.BytesIO(raw)

            async def read(self, size: int = -1) -> bytes:
                return self.file.read() if size < 0 else self.file.read(size)

        merged_filename = base_filename
        merged_content_type = "application/zip" if delta_type == "zip" else (
            "text/csv" if delta_type == "csv" else "application/json"
        )
        merged_upload = _InMemoryUploadFile(merged_raw, merged_filename, merged_content_type)

        # Enrich changelog with delta summary
        delta_summary = (
            f"[delta from {base_version_row.version}] "
            f"+{len(manifest.added)} added, "
            f"~{len(manifest.modified)} modified, "
            f"-{len(manifest.removed)} removed"
        )
        enriched_changelog = f"{delta_summary}\n{changelog}".strip()

        # ── 6. Delegate to the standard track_new_version() ──────────────
        new_version = await self.track_new_version(
            dataset=dataset,
            file=merged_upload,  # type: ignore[arg-type]
            version=version,
            commit_message=commit_message or f"chore(data): delta update for {dataset.name}",
            changelog=enriched_changelog,
            item_count=item_count,
            version_status=version_status,
            split_info=split_info,
            schema_snapshot=schema_snapshot,
            user=user,
            dvc_repo_path=dvc_repo_path,
            dvc_remote_name=dvc_remote_name,
            dvc_profile_id=dvc_profile_id,
            ssh_key_encrypted=ssh_key_encrypted,
            git_ssh_url=git_ssh_url,
        )

        return new_version


    @staticmethod
    def _normalize_version(version: str | None) -> str:
        token = (version or "").strip().lower()
        if not token:
            return ""
        if token.startswith("v"):
            token = token[1:]
        if not token:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="version must not be empty",
            )
        parts = token.split(".")
        if len(parts) == 1:
            parts.append("0")
        if len(parts) != 2 or not all(part.isdigit() for part in parts):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="version must look like v2 or v2.0",
            )
        return f"v{int(parts[0])}.{int(parts[1])}"

    def _check_write_permission(self, row: MLDataset, user: UserContext) -> None:
        if row.owner_id != user.user_id and "admin" not in user.roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permission")


def ensure_staging_file_exists(local_path: str) -> None:
    if not Path(local_path).exists():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Staging file does not exist")
