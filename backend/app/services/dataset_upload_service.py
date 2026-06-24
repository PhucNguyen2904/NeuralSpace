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
from app.models.storage_provider import StorageProvider
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

    async def inspect_yolo(self, *, file: UploadFile, name: str | None, version: str | None, description: str | None, tags: list[str]) -> dict:
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
                provider_model = await self.db.get(StorageProvider, storage_provider_id)

            report = self.report_generator.generate(validation)
            raw_uri = ""
            storage_payload = {"raw_upload_uri": ""}
            report_uri = ""
            metadata_uri = ""

            if not provider_model:
                raw_uri = await self.storage.upload_raw(
                    dataset_id=dataset_id,
                    version=normalized_version,
                    filename=filename,
                    data=raw,
                    content_type=content_type,
                )
                storage_payload["raw_upload_uri"] = raw_uri
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

            metadata = self.metadata_generator.generate(
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
            elif provider_model.type in ("minio", "s3"):
                from app.services.storage.factory import get_storage_provider
                import json
                provider = get_storage_provider(provider_model)
                report_bytes = json.dumps(report, ensure_ascii=False, indent=2).encode("utf-8")
                report_uri = await provider.upload_bytes(report_bytes, f"datasets/{dataset_id}/versions/{normalized_version}/validation_report.json", "application/json")
                storage_payload["validation_report_uri"] = report_uri
                
                metadata_bytes = json.dumps({**metadata, "storage": {**storage_payload, "metadata_uri": ""}}, ensure_ascii=False, indent=2).encode("utf-8")
                metadata_uri = await provider.upload_bytes(metadata_bytes, f"datasets/{dataset_id}/versions/{normalized_version}/dataset.metadata.json", "application/json")
                metadata["storage"]["metadata_uri"] = metadata_uri
                
                metadata_bytes2 = json.dumps(metadata, ensure_ascii=False, indent=2).encode("utf-8")
                await provider.upload_bytes(metadata_bytes2, f"datasets/{dataset_id}/versions/{normalized_version}/dataset.metadata.json", "application/json")
                
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
            provider = await self.db.get(StorageProvider, storage_provider_id)
            if provider:
                new_remote = f"provider_{provider.id}"
                dvc_client.remote_name = new_remote
                if provider.type in ("minio", "s3"):
                    bucket = provider.config.get("bucket", "datasets")
                    remote_url = f"s3://{bucket}"
                    endpoint = provider.config.get("endpoint") or provider.config.get("endpoint_url")
                    if endpoint and not endpoint.startswith("http"):
                        endpoint = f"http://{endpoint}"
                    await dvc_client._run_command(["dvc", "remote", "add", "-d", "-f", new_remote, remote_url], cwd=dvc_client.repo_path)
                    if endpoint:
                        await dvc_client._run_command(["dvc", "remote", "modify", new_remote, "endpointurl", endpoint], cwd=dvc_client.repo_path)
                    await dvc_client._run_command(["dvc", "remote", "modify", "--local", new_remote, "access_key_id", provider.config.get("access_key", "")], cwd=dvc_client.repo_path)
                    await dvc_client._run_command(["dvc", "remote", "modify", "--local", new_remote, "secret_access_key", provider.config.get("secret_key", "")], cwd=dvc_client.repo_path)
                elif provider.type == "gdrive":
                    folder_id = provider.config.get("folder_id", "")
                    remote_url = f"gdrive://{folder_id}"
                    await dvc_client._run_command(["dvc", "remote", "add", "-d", "-f", new_remote, remote_url], cwd=dvc_client.repo_path)
                    
                    if provider.config.get("refresh_token"):
                        from app.config import get_settings
                        import json
                        settings = get_settings()
                        creds_dict = {
                            "access_token": provider.config.get("access_token", ""),
                            "client_id": settings.GOOGLE_CLIENT_ID,
                            "client_secret": settings.GOOGLE_CLIENT_SECRET,
                            "refresh_token": provider.config.get("refresh_token"),
                            "token_expiry": None,
                            "token_uri": "https://oauth2.googleapis.com/token",
                            "user_agent": None,
                            "revoke_uri": None,
                            "id_token": None,
                            "id_token_jwt": None,
                            "token_response": None,
                            "scopes": ["https://www.googleapis.com/auth/drive.file"],
                            "token_info_uri": None,
                            "invalid": False,
                            "_class": "OAuth2Credentials",
                            "_module": "oauth2client.client"
                        }
                        creds_path = Path(dvc_client.repo_path) / ".dvc" / f"gdrive_creds_{new_remote}.json"
                        creds_path.parent.mkdir(parents=True, exist_ok=True)
                        creds_path.write_text(json.dumps(creds_dict))
                        
                        await dvc_client._run_command(["dvc", "remote", "modify", "--local", new_remote, "gdrive_use_service_account", "false"], cwd=dvc_client.repo_path)
                        await dvc_client._run_command(["dvc", "remote", "modify", "--local", new_remote, "gdrive_user_credentials_file", str(creds_path.absolute())], cwd=dvc_client.repo_path)
                    elif provider.config.get("service_account_json_path"):
                        await dvc_client._run_command(["dvc", "remote", "modify", "--local", new_remote, "gdrive_use_service_account", "true"], cwd=dvc_client.repo_path)
                        await dvc_client._run_command(["dvc", "remote", "modify", "--local", new_remote, "gdrive_service_account_json_file_path", provider.config.get("service_account_json_path")], cwd=dvc_client.repo_path)

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
