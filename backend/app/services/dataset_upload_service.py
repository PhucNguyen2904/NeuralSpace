from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.dependencies import UserContext
from app.models.mlops_tracking import DatasetVersion, MLDataset
from app.models.storage_connection import StorageConnection
from app.services.dataset_storage_service import DatasetStorageService
from app.services.dataset_upload_models import ParsedDataset, ValidationResult
from app.services.dataset_version_service import DatasetVersionService
from app.services.dvc_profile_service import DVCProfileService
from app.services.metadata_generator import MetadataGenerator
from app.services.parsers.general_dataset_parser import GeneralDatasetParser
from app.services.parsers.yolo_dataset_parser import YoloDatasetParser, extract_zip_safely
from app.services.validation_report_generator import ValidationReportGenerator
from app.services.validators.yolo_dataset_validator import YoloDatasetValidator
from src.integrations.dvc.client import DVCClient
from src.integrations.dvc.exceptions import DVCCommandError, DVCRepositoryError
from src.integrations.dvc.schemas import DVCTrackResult


class DatasetUploadService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.storage = DatasetStorageService()
        self.metadata_generator = MetadataGenerator()
        self.report_generator = ValidationReportGenerator()
        self.version_service = DatasetVersionService(db)

    async def inspect_yolo(self, *, file: UploadFile, name: str | None, version: str | None, description: str | None, tags: list[str], task_type: str | None = None) -> dict:
        filename = Path(file.filename or "upload.zip").name
        if not filename.lower().endswith(".zip"):
            raise self._validation_exception(
                "YOLO upload validation failed",
                ValidationResult(errors=[]),
                [{"code": "YOLO_REQUIRES_ZIP", "message": "YOLO dataset upload requires a .zip file", "path": filename, "severity": "error"}],
            )
        raw = await file.read()
        if not raw:
            raise self._simple_error("UPLOAD_EMPTY_FILE", "Uploaded file is empty", filename)

        with tempfile.TemporaryDirectory(prefix="neuralspace-yolo-inspect-") as tmp:
            tmp_path = Path(tmp)
            zip_path = tmp_path / filename
            await asyncio.to_thread(zip_path.write_bytes, raw)
            extract_dir = tmp_path / "extracted"
            extract_dir.mkdir()
            extract_validation = await asyncio.to_thread(extract_zip_safely, zip_path, extract_dir)
            if extract_validation.errors:
                raise self._validation_exception("YOLO upload validation failed", extract_validation)
            parser = YoloDatasetParser()
            parsed, validation = await asyncio.to_thread(parser.parse, root=extract_dir, filename=filename, size_bytes=len(raw))
            if parsed is None:
                raise self._validation_exception("YOLO upload validation failed", validation)
            if task_type:
                parsed.task_type = task_type
            validator = YoloDatasetValidator()
            validation = await asyncio.to_thread(validator.validate, root=extract_dir, parsed=parsed, validation=validation)
            return await self._inspect_payload(parsed=parsed, validation=validation, name=name, version=version, description=description, tags=tags)

    async def inspect_general(
        self,
        *,
        file: UploadFile,
        name: str | None,
        version: str | None,
        description: str | None,
        dataset_type: str | None,
        task_type: str | None,
        tags: list[str],
        label_column: str | None,
    ) -> dict:
        filename = Path(file.filename or "upload").name
        raw = await file.read()
        if not raw:
            raise self._simple_error("UPLOAD_EMPTY_FILE", "Uploaded file is empty", filename)
        if dataset_type and dataset_type not in {"tabular", "image", "text", "audio", "video", "custom"}:
            raise self._simple_error("GENERAL_INVALID_DATASET_TYPE", "dataset_type is not supported", filename)
        if task_type and task_type not in {"classification", "regression", "clustering", "nlp", "custom"}:
            raise self._simple_error("GENERAL_INVALID_TASK", "task is not supported", filename)

        with tempfile.TemporaryDirectory(prefix="neuralspace-general-inspect-") as tmp:
            path = Path(tmp) / filename
            await asyncio.to_thread(path.write_bytes, raw)
            parser = GeneralDatasetParser()
            parsed, validation = await asyncio.to_thread(
                parser.parse,
                path=path,
                filename=filename,
                size_bytes=len(raw),
                dataset_type=dataset_type,
                task_type=task_type,
                label_column=label_column,
            )
            if parsed is None or validation.errors:
                raise self._validation_exception("General dataset validation failed", validation)
            return await self._inspect_payload(parsed=parsed, validation=validation, name=name, version=version, description=description, tags=tags)

    async def upload_yolo(
        self,
        *,
        file: UploadFile,
        user: UserContext,
        name: str | None,
        version: str | None,
        description: str | None,
        tags: list[str],
        task_type: str | None = None,
        dvc_profile_id: str | None = None,
        storage_provider_id: str | None = None,
    ) -> dict:
        filename = Path(file.filename or "upload.zip").name
        if not filename.lower().endswith(".zip"):
            raise self._validation_exception(
                "YOLO upload validation failed",
                ValidationResult(errors=[]),
                [{"code": "YOLO_REQUIRES_ZIP", "message": "YOLO dataset upload requires a .zip file", "path": filename, "severity": "error"}],
            )
        raw = await file.read()
        if not raw:
            raise self._simple_error("UPLOAD_EMPTY_FILE", "Uploaded file is empty", filename)

        with tempfile.TemporaryDirectory(prefix="neuralspace-yolo-") as tmp:
            tmp_path = Path(tmp)
            zip_path = tmp_path / filename
            await asyncio.to_thread(zip_path.write_bytes, raw)
            extract_dir = tmp_path / "extracted"
            extract_dir.mkdir()
            extract_validation = await asyncio.to_thread(extract_zip_safely, zip_path, extract_dir)
            if extract_validation.errors:
                raise self._validation_exception("YOLO upload validation failed", extract_validation)

            parser = YoloDatasetParser()
            parsed, validation = await asyncio.to_thread(parser.parse, root=extract_dir, filename=filename, size_bytes=len(raw))
            if parsed is None:
                raise self._validation_exception("YOLO upload validation failed", validation)
            if task_type:
                parsed.task_type = task_type
            validator = YoloDatasetValidator()
            validation = await asyncio.to_thread(validator.validate, root=extract_dir, parsed=parsed, validation=validation)
            if validation.errors:
                raise self._validation_exception("YOLO upload validation failed", validation)
            return await self._persist_upload(
                parsed=parsed,
                raw=raw,
                filename=filename,
                content_type=file.content_type or "application/zip",
                user=user,
                name=name,
                version=version,
                description=description,
                tags=tags,
                validation=validation,
                extracted_root=extract_dir,
                dvc_profile_id=dvc_profile_id,
                storage_provider_id=storage_provider_id,
            )

    async def upload_general(
        self,
        *,
        file: UploadFile,
        user: UserContext,
        name: str | None,
        version: str | None,
        description: str | None,
        dataset_type: str | None,
        task_type: str | None,
        tags: list[str],
        label_column: str | None,
        dvc_profile_id: str | None = None,
        storage_provider_id: str | None = None,
    ) -> dict:
        filename = Path(file.filename or "upload").name
        raw = await file.read()
        if not raw:
            raise self._simple_error("UPLOAD_EMPTY_FILE", "Uploaded file is empty", filename)
        if dataset_type and dataset_type not in {"tabular", "image", "text", "audio", "video", "custom"}:
            raise self._simple_error("GENERAL_INVALID_DATASET_TYPE", "dataset_type is not supported", filename)
        if task_type and task_type not in {"classification", "regression", "clustering", "nlp", "custom"}:
            raise self._simple_error("GENERAL_INVALID_TASK", "task is not supported", filename)

        with tempfile.TemporaryDirectory(prefix="neuralspace-general-") as tmp:
            path = Path(tmp) / filename
            await asyncio.to_thread(path.write_bytes, raw)
            parser = GeneralDatasetParser()
            parsed, validation = await asyncio.to_thread(
                parser.parse,
                path=path,
                filename=filename,
                size_bytes=len(raw),
                dataset_type=dataset_type,
                task_type=task_type,
                label_column=label_column,
            )
            if parsed is None or validation.errors:
                raise self._validation_exception("General dataset validation failed", validation)
            return await self._persist_upload(
                parsed=parsed,
                raw=raw,
                filename=filename,
                content_type=file.content_type or "application/octet-stream",
                user=user,
                name=name,
                version=version,
                description=description,
                tags=tags,
                validation=validation,
                label_column=label_column,
                dvc_profile_id=dvc_profile_id,
                storage_provider_id=storage_provider_id,
            )

    async def _persist_upload(
        self,
        *,
        parsed: ParsedDataset,
        raw: bytes,
        filename: str,
        content_type: str,
        user: UserContext,
        name: str | None,
        version: str | None,
        description: str | None,
        tags: list[str],
        validation: ValidationResult,
        label_column: str | None = None,
        extracted_root: Path | None = None,
        dvc_profile_id: str | None = None,
        storage_provider_id: str | None = None,
    ) -> dict:
        from sqlalchemy import select
        from app.models.dataset import Dataset
        
        embedded_metadata = parsed.details.get("embedded_metadata") if isinstance(parsed.details, dict) else None
        if not isinstance(embedded_metadata, dict):
            embedded_metadata = {}
        metadata_name = self._metadata_string(embedded_metadata, "name", "dataset_name")
        metadata_version = self._metadata_string(embedded_metadata, "version")
        metadata_description = self._metadata_string(embedded_metadata, "description")
        metadata_tags = self._metadata_tags(embedded_metadata)
        parsed.name = self._clean_name(name) or metadata_name or parsed.name
        resolved_description = description if description not in (None, "") else metadata_description
        resolved_tags = tags or metadata_tags
        
        existing_dataset = (await self.db.execute(select(Dataset.id).where(Dataset.name == parsed.name))).scalar_one_or_none()
        dataset_id = existing_dataset or f"ds_{uuid4().hex[:10]}"
        
        normalized_version = await self._resolve_upload_version(
            dataset_name=parsed.name,
            requested=version,
            metadata_version=metadata_version,
        )

        try:
            provider_model = None
            if storage_provider_id:
                provider_model = await self.db.get(StorageConnection, storage_provider_id)

            # ── Delta Computation ─────────────────────────────────────────
            upload_data = raw
            upload_filename = filename
            upload_size = len(raw)
            delta_metadata = {}

            from app.core.logging import get_logger
            logger = get_logger(__name__)

            if existing_dataset and not provider_model:
                from app.models.mlops_tracking import DatasetVersion as MLOpsDatasetVersion
                
                logger.info(f"Checking for existing MLDataset for name={parsed.name}")
                existing_mlops_dataset = (await self.db.execute(select(MLDataset.id).where(MLDataset.name == parsed.name))).scalar_one_or_none()
                base_version_row = None
                
                if existing_mlops_dataset:
                    logger.info(f"Found existing MLDataset id={existing_mlops_dataset}. Querying latest MLOpsDatasetVersion...")
                    base_version_row = (await self.db.execute(
                        select(MLOpsDatasetVersion)
                        .where(MLOpsDatasetVersion.dataset_id == existing_mlops_dataset, MLOpsDatasetVersion.is_latest.is_(True))
                        .order_by(MLOpsDatasetVersion.created_at.desc())
                        .limit(1)
                    )).scalar_one_or_none()
                else:
                    logger.info("No existing MLDataset found by name.")
                
                if base_version_row:
                    base_storage_path = None
                    if base_version_row.metadata_snapshot and "storage" in base_version_row.metadata_snapshot:
                        base_storage_path = base_version_row.metadata_snapshot["storage"].get("raw_upload_uri")
                    if not base_storage_path:
                        base_storage_path = base_version_row.storage_path

                    if base_storage_path:
                        logger.info(f"Found base_version_row {base_version_row.version} with path {base_storage_path}")
                        if base_storage_path.startswith("s3://"):
                            try:
                                from app.clients.minio_client import get_minio_client
                                minio = get_minio_client()
                                _, rest = base_storage_path.split("s3://", 1)
                                base_bucket, _, base_object_name = rest.partition("/")
                                logger.info(f"Fetching base_raw from minio: bucket={base_bucket}, object={base_object_name}")
                                base_raw = await minio.get_object_data(base_object_name, bucket=base_bucket)
                                
                                from app.services.dataset_delta_service import detect_delta_type, compute_zip_delta, compute_csv_delta, compute_json_delta
                                delta_type = detect_delta_type(filename)
                                logger.info(f"Delta type detected as: {delta_type}")
                                
                                delta_bytes, manifest = None, None
                                if delta_type == "zip":
                                    delta_bytes, manifest = compute_zip_delta(base_raw, raw, base_version_row.version)
                                elif delta_type == "csv":
                                    delta_bytes, manifest = compute_csv_delta(base_raw, raw, base_version_row.version)
                                elif delta_type == "json":
                                    delta_bytes, manifest = compute_json_delta(base_raw, raw, base_version_row.version)
                                
                                if delta_bytes is not None:
                                    logger.info(f"Delta computed successfully! Original size: {len(raw)}, Delta size: {len(delta_bytes)}")
                                    upload_data = delta_bytes
                                    upload_filename = f"delta_{filename}"
                                    upload_size = len(delta_bytes)
                                    delta_metadata = {
                                        "is_delta": True,
                                        "base_version_id": base_version_row.id,
                                        "base_version": base_version_row.version,
                                        "delta_type": delta_type,
                                        "manifest": manifest.to_dict(),
                                        "delta_size_bytes": upload_size,
                                        "full_size_bytes": len(raw),
                                        "savings_bytes": len(raw) - upload_size,
                                    }
                                else:
                                    logger.info("compute_delta returned None (fallback to full upload).")
                            except Exception as e:
                                import traceback
                                logger.error("Delta computation failed in _persist_upload", error=str(e), tb=traceback.format_exc())
            # ──────────────────────────────────────────────────────────────

            report = await asyncio.to_thread(self.report_generator.generate, validation)
            raw_uri = ""
            storage_payload = {"raw_upload_uri": ""}
            report_uri = ""
            metadata_uri = ""

            if not provider_model:
                raw_uri = await self.storage.upload_raw(
                    dataset_id=dataset_id,
                    version=normalized_version,
                    filename=upload_filename,
                    data=upload_data,
                    content_type=content_type,
                )
                storage_payload["raw_upload_uri"] = raw_uri
                if delta_metadata:
                    storage_payload["delta_metadata"] = delta_metadata
                
                if extracted_root is not None:
                    storage_payload["dataset_uri"] = await self.storage.upload_directory(
                        dataset_id=dataset_id,
                        version=normalized_version,
                        root=extracted_root,
                    )

                report_uri = await self.storage.upload_json(
                    dataset_id=dataset_id,
                    version=normalized_version,
                    filename="validation_report.json",
                    payload=report,
                )
                storage_payload["validation_report_uri"] = report_uri

            metadata = await asyncio.to_thread(
                self.metadata_generator.generate,
                parsed=parsed,
                version=normalized_version,
                original_filename=filename,
                uploaded_by=user.user_id,
                storage=storage_payload,
                validation=validation,
                description=resolved_description,
                tags=resolved_tags,
                label_column=label_column,
            )
            if delta_metadata:
                metadata.update(delta_metadata)

            if not provider_model:
                metadata_uri = await self.storage.upload_json(
                    dataset_id=dataset_id,
                    version=normalized_version,
                    filename="dataset.metadata.json",
                    payload={**metadata, "storage": {**storage_payload, "metadata_uri": ""}},
                )
                metadata["storage"]["metadata_uri"] = metadata_uri
                await self.storage.upload_json(
                    dataset_id=dataset_id,
                    version=normalized_version,
                    filename="dataset.metadata.json",
                    payload=metadata,
                )
            elif provider_model.provider in ("minio", "s3"):
                # TODO: Refactor direct external storage upload to use Rclone service
                pass
                
            class_count = parsed.statistics.get("class_count")
            profile = await DVCProfileService(self.db, get_settings()).resolve_for_dataset(
                dataset=MLDataset(
                    id="00000000-0000-0000-0000-000000000000",
                    name=parsed.name,
                    description=resolved_description,
                    type=parsed.dataset_type,
                    owner_id=user.user_id,
                    team_id=None,
                    dvc_profile_id=None,
                    dvc_repo_url=None,
                    storage_path=None,
                    tags=resolved_tags,
                    status="active",
                ),
                user=user,
                requested_profile_id=dvc_profile_id,
            )
            dvc_result = await self._track_dvc_upload(
                dataset_id=dataset_id,
                dataset_name=dataset_id,
                version=normalized_version,
                filename=filename,
                raw=raw,
                dvc_repo_path=profile.repo_path,
                dvc_remote_name=profile.remote_name,
                ssh_key_encrypted=profile.ssh_key_encrypted,
                git_ssh_url=profile.git_ssh_url,
                storage_provider_id=storage_provider_id,
            )



            public_dataset, _mlops_dataset, dataset_version = await self.version_service.create_upload_version(
                dataset_id=dataset_id,
                dataset_name=parsed.name,
                description=resolved_description,
                dataset_type=parsed.dataset_type,
                tags=resolved_tags,
                version=normalized_version,
                storage_path=raw_uri,
                size_bytes=upload_size,
                item_count=parsed.item_count,
                schema_snapshot=parsed.schema_snapshot,
                split_info=parsed.split_info,
                metadata_snapshot=metadata,
                validation_summary=report["summary"],
                validation_status=validation.status,
                format=parsed.format,
                task_type=parsed.task_type,
                class_count=int(class_count) if isinstance(class_count, int) else None,
                dvc_md5=dvc_result.md5,
                dvc_commit=dvc_result.git_commit,
                dvc_storage_path=dvc_result.dvc_file_path,
                dvc_profile_id=profile.id,
                user=user,
            )

            return {
                "dataset": {
                    "id": public_dataset.id,
                    "name": public_dataset.name,
                    "description": public_dataset.description or "",
                    "type": public_dataset.dataset_type,
                    "task": parsed.task_type,
                    "tags": public_dataset.tags or [],
                    "storage_path": public_dataset.storage_path or "",
                },
                "version": {
                    "id": dataset_version.id,
                    "dataset_id": dataset_version.dataset_id,
                    "version": dataset_version.version,
                    "status": dataset_version.status,
                    "storage_path": dataset_version.storage_path or "",
                    "dvc_md5": dataset_version.dvc_md5 or "",
                    "dvc_commit": dataset_version.dvc_commit or "",
                    "metadata_uri": getattr(dataset_version, "metadata_uri", None),
                    "validation_report_uri": getattr(dataset_version, "validation_report_uri", None),
                    "validation_status": getattr(dataset_version, "validation_status", validation.status),
                },
                "preview": parsed.preview,
                "metadata": metadata,
                "validation_report": report,
            }
        except Exception:
            await self.storage.delete_version_prefix(dataset_id=dataset_id, version=normalized_version)
            raise

    async def _track_dvc_upload(
        self,
        *,
        dataset_id: str,
        dataset_name: str,
        version: str,
        filename: str,
        raw: bytes,
        dvc_repo_path: str,
        dvc_remote_name: str,
        ssh_key_encrypted: bytes | None = None,
        git_ssh_url: str | None = None,
        storage_provider_id: str | None = None,
    ) -> DVCTrackResult:
        try:
            dvc_client = DVCClient(
                dvc_repo_path,
                remote_name=dvc_remote_name,
                ssh_key_encrypted=ssh_key_encrypted,
                git_ssh_url=git_ssh_url,
            )
        except DVCRepositoryError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"DVC repo not ready: {exc}",
            ) from exc

        if storage_provider_id:
            provider = await self.db.get(StorageConnection, storage_provider_id)
            if provider:
                # TODO: Implement rclone remote configuration in DVC
                pass

        safe_filename = Path(filename).name or "upload"
        staging_dir = Path(dvc_repo_path) / dataset_name
        staging_dir.mkdir(parents=True, exist_ok=True)
        staging_file = staging_dir / safe_filename
        await asyncio.to_thread(staging_file.write_bytes, raw)

        try:
            return await dvc_client.track(
                local_path=str(staging_file),
                dataset_name=dataset_name,
                commit_message=f"chore(data): track {dataset_name} {version}",
            )
        except DVCCommandError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"DVC tracking failed: {exc.stderr or exc}",
            ) from exc

    async def _resolve_version(self, dataset_name: str, requested: str | None) -> str:
        normalized = self._normalize_version(requested) if requested else None
        mlops_dataset = (
            await self.db.execute(select(MLDataset).where(MLDataset.name == dataset_name))
        ).scalar_one_or_none()
        if mlops_dataset is None:
            return normalized or "v1.0"
        existing = (
            await self.db.execute(
                select(DatasetVersion.version).where(DatasetVersion.dataset_id == mlops_dataset.id)
            )
        ).scalars().all()
        if normalized:
            if normalized in set(existing):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Dataset version already exists: {normalized}")
            return normalized
        majors = []
        for value in existing:
            token = str(value or "").lower().removeprefix("v").split(".", 1)[0]
            if token.isdigit():
                majors.append(int(token))
        return f"v{(max(majors) if majors else 0) + 1}.0"

    async def _resolve_upload_version(self, *, dataset_name: str, requested: str | None, metadata_version: str | None) -> str:
        if requested and requested.strip():
            return await self._resolve_version(dataset_name, requested)

        normalized_metadata = self._normalize_version(metadata_version) if metadata_version else None
        mlops_dataset = (
            await self.db.execute(select(MLDataset).where(MLDataset.name == dataset_name))
        ).scalar_one_or_none()
        if mlops_dataset is None:
            return normalized_metadata or "v1.0"

        existing = set(
            (
                await self.db.execute(
                    select(DatasetVersion.version).where(DatasetVersion.dataset_id == mlops_dataset.id)
                )
            ).scalars().all()
        )
        if normalized_metadata and normalized_metadata not in existing:
            return normalized_metadata

        return await self._resolve_version(dataset_name, None)

    @staticmethod
    def _normalize_version(version: str | None) -> str:
        token = (version or "").strip().lower()
        if not token:
            return "v1.0"
        token = token.removeprefix("v")
        parts = token.split(".")
        if len(parts) == 1:
            parts.append("0")
        if len(parts) != 2 or not all(part.isdigit() for part in parts):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="version must look like v2 or v2.0")
        return f"v{int(parts[0])}.{int(parts[1])}"

    @staticmethod
    def _clean_name(name: str | None) -> str | None:
        value = (name or "").strip()
        return value or None

    async def _inspect_payload(
        self,
        *,
        parsed: ParsedDataset,
        validation: ValidationResult,
        name: str | None,
        version: str | None,
        description: str | None,
        tags: list[str],
    ) -> dict:
        embedded_metadata = parsed.details.get("embedded_metadata") if isinstance(parsed.details, dict) else None
        if not isinstance(embedded_metadata, dict):
            embedded_metadata = {}
        metadata_tags = self._metadata_tags(embedded_metadata)
        resolved_name = self._clean_name(name) or self._metadata_string(embedded_metadata, "name", "dataset_name") or parsed.name
        resolved_version = await self._resolve_upload_version(
            dataset_name=resolved_name,
            requested=version,
            metadata_version=self._metadata_string(embedded_metadata, "version"),
        )
        return {
            "form": {
                "name": resolved_name,
                "version": resolved_version,
                "description": description if description not in (None, "") else self._metadata_string(embedded_metadata, "description") or "",
                "tags": tags or metadata_tags,
                "dataset_type": parsed.dataset_type,
                "task": parsed.task_type,
            },
            "preview": parsed.preview,
            "metadata": {
                "name": parsed.name,
                "format": parsed.format,
                "dataset_type": parsed.dataset_type,
                "task": parsed.task_type,
                "item_count": parsed.item_count,
                "size_bytes": parsed.size_bytes,
                "schema_snapshot": parsed.schema_snapshot,
                "split_info": parsed.split_info,
                "statistics": parsed.statistics,
                "embedded_metadata": embedded_metadata,
            },
            "validation_report": self.report_generator.generate(validation),
        }

    @staticmethod
    def _metadata_string(payload: dict, *keys: str) -> str | None:
        for key in keys:
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _metadata_tags(payload: dict) -> list[str]:
        value = payload.get("tags")
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return []

    @staticmethod
    def _simple_error(code: str, message: str, path: str | None = None) -> HTTPException:
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": message,
                "status": "failed",
                "errors": [{"code": code, "message": message, "path": path, "severity": "error"}],
                "warnings": [],
            },
        )

    @staticmethod
    def _validation_exception(message: str, validation: ValidationResult, extra_errors: list[dict] | None = None) -> HTTPException:
        errors = [item.to_dict() for item in validation.errors]
        if extra_errors:
            errors.extend(extra_errors)
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": message,
                "status": "failed",
                "errors": errors,
                "warnings": [item.to_dict() for item in validation.warnings],
            },
        )
