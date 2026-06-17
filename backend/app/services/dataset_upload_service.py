from __future__ import annotations

import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext
from app.models.mlops_tracking import DatasetVersion, MLDataset
from app.services.dataset_storage_service import DatasetStorageService
from app.services.dataset_upload_models import ParsedDataset, ValidationResult
from app.services.dataset_version_service import DatasetVersionService
from app.services.metadata_generator import MetadataGenerator
from app.services.parsers.general_dataset_parser import GeneralDatasetParser
from app.services.parsers.yolo_dataset_parser import YoloDatasetParser, extract_zip_safely
from app.services.validation_report_generator import ValidationReportGenerator
from app.services.validators.yolo_dataset_validator import YoloDatasetValidator


class DatasetUploadService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.storage = DatasetStorageService()
        self.metadata_generator = MetadataGenerator()
        self.report_generator = ValidationReportGenerator()
        self.version_service = DatasetVersionService(db)

    async def upload_yolo(
        self,
        *,
        file: UploadFile,
        user: UserContext,
        name: str | None,
        version: str | None,
        description: str | None,
        tags: list[str],
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
            zip_path.write_bytes(raw)
            extract_dir = tmp_path / "extracted"
            extract_dir.mkdir()
            extract_validation = extract_zip_safely(zip_path, extract_dir)
            if extract_validation.errors:
                raise self._validation_exception("YOLO upload validation failed", extract_validation)

            parsed, validation = YoloDatasetParser().parse(root=extract_dir, filename=filename, size_bytes=len(raw))
            if parsed is None:
                raise self._validation_exception("YOLO upload validation failed", validation)
            validation = YoloDatasetValidator().validate(root=extract_dir, parsed=parsed, validation=validation)
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
            path.write_bytes(raw)
            parsed, validation = GeneralDatasetParser().parse(
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
    ) -> dict:
        dataset_id = f"ds_{uuid4().hex[:10]}"
        parsed.name = self._clean_name(name) or parsed.name
        normalized_version = await self._resolve_version(parsed.name, version)

        raw_uri = await self.storage.upload_raw(
            dataset_id=dataset_id,
            version=normalized_version,
            filename=filename,
            data=raw,
            content_type=content_type,
        )
        storage_payload = {"raw_upload_uri": raw_uri}
        if extracted_root is not None:
            storage_payload["dataset_uri"] = await self.storage.upload_directory(
                dataset_id=dataset_id,
                version=normalized_version,
                root=extracted_root,
            )

        report = self.report_generator.generate(validation)
        report_uri = await self.storage.upload_json(
            dataset_id=dataset_id,
            version=normalized_version,
            filename="validation_report.json",
            payload=report,
        )
        storage_payload["validation_report_uri"] = report_uri

        metadata = self.metadata_generator.generate(
            parsed=parsed,
            version=normalized_version,
            original_filename=filename,
            uploaded_by=user.user_id,
            storage=storage_payload,
            validation=validation,
            description=description,
            tags=tags,
            label_column=label_column,
        )
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

        class_count = parsed.statistics.get("class_count")
        public_dataset, _mlops_dataset, dataset_version = await self.version_service.create_upload_version(
            dataset_id=dataset_id,
            dataset_name=parsed.name,
            description=description,
            dataset_type=parsed.dataset_type,
            tags=tags,
            version=normalized_version,
            storage_path=raw_uri,
            size_bytes=len(raw),
            item_count=parsed.item_count,
            schema_snapshot=parsed.schema_snapshot,
            split_info=parsed.split_info,
            metadata_snapshot=metadata,
            validation_summary=report["summary"],
            validation_status=validation.status,
            format=parsed.format,
            task_type=parsed.task_type,
            class_count=int(class_count) if isinstance(class_count, int) else None,
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
                "metadata_uri": getattr(dataset_version, "metadata_uri", None),
                "validation_report_uri": getattr(dataset_version, "validation_report_uri", None),
                "validation_status": getattr(dataset_version, "validation_status", validation.status),
            },
            "preview": parsed.preview,
            "metadata": metadata,
            "validation_report": report,
        }

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
