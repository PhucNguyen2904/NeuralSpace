"""Legacy-compatible models API for frontend list/detail pages."""

from __future__ import annotations

import json
import csv
import io
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import UserContext, get_current_user, get_db
from app.models.mlops_tracking import ApprovalRequest, DatasetVersion, Experiment, ModelDatasetLink, ModelVersion, Run, RunLog
from app.models.model_registry import ModelRegistry
from app.models.workspace_assets import WorkspaceModel

router = APIRouter(prefix="/models", tags=["models"])


def _object_from_storage_path(storage_path: str | None) -> tuple[str | None, str] | None:
    if not storage_path:
        return None
    if storage_path.startswith("s3://"):
        _, rest = storage_path.split("s3://", 1)
        bucket, _, object_name = rest.partition("/")
        return (bucket or None, object_name) if object_name else None
    normalized = storage_path.replace("\\", "/").lstrip("/")
    return (None, normalized) if normalized else None


def _collect_source_payload_refs(source_payload: dict) -> set[tuple[str | None, str]]:
    refs: set[tuple[str | None, str]] = set()
    minio_object = source_payload.get("minio_object")
    if isinstance(minio_object, str) and minio_object.strip():
        refs.add((None, minio_object.strip()))
    for item in source_payload.get("files") or []:
        if isinstance(item, dict):
            ref = _object_from_storage_path(item.get("storage_path"))
            if ref:
                refs.add(ref)
    for item in source_payload.get("version_history") or []:
        if isinstance(item, dict):
            object_name = item.get("object_name")
            if isinstance(object_name, str) and object_name.strip():
                refs.add((None, object_name.strip()))
            ref = _object_from_storage_path(item.get("storage_path"))
            if ref:
                refs.add(ref)
    return refs


def _parse_metadata(metadata: str | None) -> dict:
    if not metadata:
        return {}
    try:
        parsed = json.loads(metadata)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="metadata must be valid JSON") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="metadata must be a JSON object")
    return parsed


def _parse_tags(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _safe_filename(filename: str | None) -> str:
    name = (filename or "model").replace("\\", "/").split("/")[-1].strip()
    if not name:
        return "model"
    return "".join(char if char.isalnum() or char in {".", "-", "_"} else "_" for char in name)


def _safe_zip_members(archive: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    members: list[zipfile.ZipInfo] = []
    for info in archive.infolist():
        name = info.filename.replace("\\", "/")
        path = PurePosixPath(name)
        if info.is_dir():
            continue
        if path.is_absolute() or ".." in path.parts or (path.parts and ":" in path.parts[0]):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "message": "YOLO model validation failed",
                    "status": "failed",
                    "errors": [{"code": "YOLO_ZIP_UNSAFE_PATH", "message": "ZIP contains an unsafe path", "path": info.filename, "severity": "error"}],
                    "warnings": [],
                },
            )
        members.append(info)
    return members


def _strip_common_root(paths: list[str]) -> dict[str, str]:
    parts = [PurePosixPath(path).parts for path in paths if PurePosixPath(path).parts]
    if not parts:
        return {}
    first_parts = {item[0] for item in parts}
    package_roots = {"weights", "exports", "reports", "samples", "logs"}
    package_files = {"args.yaml", "model.metadata.json", "results.csv", "results.png", "confusion_matrix.png"}
    only_root = next(iter(first_parts)) if len(first_parts) == 1 else None
    strip_root = (
        only_root is not None
        and only_root not in package_roots
        and only_root not in package_files
        and all(len(item) > 1 for item in parts)
    )
    return {
        path: str(PurePosixPath(*PurePosixPath(path).parts[1:])) if strip_root else path
        for path in paths
    }


def _issue(code: str, message: str, severity: str, path: str | None = None) -> dict:
    payload = {"code": code, "message": message, "severity": severity}
    if path:
        payload["path"] = path
    return payload


def _nested_dict(payload: dict, key: str) -> dict:
    value = payload.get(key)
    return value if isinstance(value, dict) else {}


def _nested_string(payload: dict, *keys: str) -> str | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _normalize_model_task(task: str | None) -> str:
    value = (task or "object_detection").strip().lower()
    mapping = {
        "object_detection": "object_detection",
        "detect": "object_detection",
        "detection": "object_detection",
        "segmentation": "semantic_segmentation",
        "semantic_segmentation": "semantic_segmentation",
        "classification": "image_classification",
        "image_classification": "image_classification",
        "pose": "object_detection",
        "tracking": "object_detection",
    }
    return mapping.get(value, "object_detection")


def _normalize_csv_col(col: str) -> str:
    """Strip common YOLO CSV prefixes and normalize column name."""
    name = col.strip()
    for prefix in ("metrics/", "val/", "train/", "test/"):
        if name.startswith(prefix):
            name = name[len(prefix):]
    # Remove trailing (B) / (M) / (S) suffixes used by YOLO box/mask/pose heads
    name = name.rstrip().rstrip(")")
    if name and name[-1].upper() in {"B", "M", "S"} and name[-2:] in {"(B", "(M", "(S"}:
        name = name[:-2].rstrip()
    # Replace common special chars
    name = name.replace("-", "_").replace(" ", "_")
    return name


def _extract_metrics_from_results_csv(raw: bytes) -> dict[str, float]:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return {}
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        return {}
    last = rows[-1]

    # Priority aliases: well-known short names mapped from verbose YOLO column names
    priority_aliases: dict[str, list[str]] = {
        "precision": ["metrics/precision(B)", "metrics/precision", "precision"],
        "recall": ["metrics/recall(B)", "metrics/recall", "recall"],
        "mAP50": ["metrics/mAP50(B)", "metrics/mAP50", "mAP50"],
        "mAP50_95": ["metrics/mAP50-95(B)", "metrics/mAP50-95", "mAP50_95"],
        "box_loss": ["val/box_loss", "box_loss"],
        "cls_loss": ["val/cls_loss", "cls_loss"],
        "dfl_loss": ["val/dfl_loss", "dfl_loss"],
    }
    metrics: dict[str, float] = {}

    # 1. Apply priority aliases first
    for target, candidates in priority_aliases.items():
        for candidate in candidates:
            value = last.get(candidate)
            if value not in (None, ""):
                try:
                    metrics[target] = float(str(value).strip())
                    break
                except ValueError:
                    continue

    # 2. Read ALL remaining numeric columns not yet captured
    already_covered = {col for col_list in priority_aliases.values() for col in col_list}
    for col, raw_value in last.items():
        if col in already_covered or raw_value in (None, ""):
            continue
        stripped = str(raw_value).strip()
        if not stripped:
            continue
        try:
            float_val = float(stripped)
        except ValueError:
            continue
        norm = _normalize_csv_col(col)
        if not norm or norm in metrics:
            continue
        metrics[norm] = float_val

    return metrics


def _class_names_from_dataset_snapshot(snapshot: dict | None) -> list[str]:
    if not isinstance(snapshot, dict):
        return []
    candidates = [
        snapshot.get("classes"),
        snapshot.get("class_names"),
        _nested_dict(snapshot, "preview").get("classes"),
        _nested_dict(snapshot, "statistics").get("classes"),
        _nested_dict(snapshot, "dataset_lineage").get("classes"),
    ]
    for value in candidates:
        if isinstance(value, list):
            return [str(item) for item in value]
        if isinstance(value, dict):
            return [str(item) for _, item in sorted(value.items(), key=lambda pair: str(pair[0]))]
    return []


async def _dataset_classes_for_version(db: AsyncSession, dataset_version_id: str | None) -> list[str]:
    if not dataset_version_id:
        return []
    row = await db.get(DatasetVersion, dataset_version_id)
    if row is None:
        return []
    return _class_names_from_dataset_snapshot(row.metadata_snapshot) or _class_names_from_dataset_snapshot(row.schema_snapshot)


from app.services.validators.yolo_validators import get_validator

def _analyze_yolo_package(raw: bytes, filename: str, yolo_type: str = "detection") -> dict:
    warnings: list[dict] = []
    errors: list[dict] = []
    try:
        archive = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        errors.append(_issue("YOLO_ZIP_INVALID", "Uploaded file is not a valid ZIP archive.", "error", filename))
        return {"errors": errors, "warnings": warnings}

    with archive:
        members = _safe_zip_members(archive)
        path_map = _strip_common_root([item.filename.replace("\\", "/") for item in members])
        rel_to_info = {path_map[item.filename.replace("\\", "/")]: item for item in members}
        names = set(rel_to_info)

        best_path = "weights/best.pt" if "weights/best.pt" in names else next((name for name in names if name.endswith("/weights/best.pt")), None)
        last_path = "weights/last.pt" if "weights/last.pt" in names else next((name for name in names if name.endswith("/weights/last.pt")), None)
        primary_artifact = best_path or last_path
        
        validator = get_validator(yolo_type)
        validation_errors = validator.validate(names, filename)
        if validation_errors:
            errors.extend(validation_errors)

        metadata: dict = {}
        metadata_path = "model.metadata.json" if "model.metadata.json" in names else next((name for name in names if name.endswith("/model.metadata.json")), None)
        if metadata_path:
            try:
                parsed = json.loads(archive.read(rel_to_info[metadata_path]).decode("utf-8"))
                if isinstance(parsed, dict):
                    metadata = parsed
                else:
                    errors.append(_issue("YOLO_METADATA_INVALID", "model.metadata.json must be a JSON object.", "error", metadata_path))
            except (UnicodeDecodeError, json.JSONDecodeError):
                errors.append(_issue("YOLO_METADATA_INVALID", "model.metadata.json is not valid JSON.", "error", metadata_path))
        else:
            warnings.append(_issue("YOLO_METADATA_MISSING", "model.metadata.json is missing; metadata will be generated by backend.", "warning"))

        metrics = _nested_dict(metadata, "metrics")
        results_path = "reports/results.csv" if "reports/results.csv" in names else "results.csv" if "results.csv" in names else next((name for name in names if name.endswith("/results.csv")), None)
        if results_path:
            csv_metrics = _extract_metrics_from_results_csv(archive.read(rel_to_info[results_path]))
            metrics = {**csv_metrics, **{k: float(v) for k, v in metrics.items() if isinstance(v, (int, float))}}
        elif not metrics:
            warnings.append(_issue("YOLO_METRICS_MISSING", "No results.csv or metrics block found.", "warning"))

        artifacts = {
            "best_model_path": best_path,
            "last_model_path": last_path,
            "args_path": "args.yaml" if "args.yaml" in names else next((name for name in names if name.endswith("/args.yaml")), None),
            "results_csv_path": results_path,
            "results_plot_path": "reports/results.png" if "reports/results.png" in names else "results.png" if "results.png" in names else None,
            "confusion_matrix_path": "reports/confusion_matrix.png" if "reports/confusion_matrix.png" in names else "confusion_matrix.png" if "confusion_matrix.png" in names else None,
            "sample_prediction_paths": sorted([name for name in names if name.startswith("samples/") or "batch" in Path(name).name or "pred" in Path(name).name])[:20],
            "exported_model_paths": sorted([name for name in names if Path(name).suffix.lower() in {".onnx", ".engine", ".tflite", ".openvino", ".torchscript"}]),
            "artifact_files": sorted(names),
        }

        model_info = _nested_dict(metadata, "model_info")
        dataset_lineage = _nested_dict(metadata, "dataset_lineage")
        validation_checks = {
            "artifact_exists": bool(primary_artifact),
            "model_loadable": False,
            "inference_test_passed": False,
            "classes_match_dataset": False,
            "metrics_available": bool(metrics),
            "export_valid": bool(artifacts["exported_model_paths"]),
        }

        return {
            "errors": errors,
            "warnings": warnings,
            "metadata": metadata,
            "model_info": model_info,
            "dataset_lineage": dataset_lineage,
            "primary_artifact": _nested_string(model_info, "primary_artifact") or primary_artifact,
            "metrics": metrics,
            "artifacts": artifacts,
            "validation_checks": validation_checks,
        }


def _loadable_check(raw: bytes, analysis: dict) -> tuple[bool, dict | None]:
    primary = analysis.get("primary_artifact")
    if not primary:
        return False, None
    try:
        from ultralytics import YOLO  # type: ignore
    except Exception:
        return False, _issue("YOLO_LOAD_CHECK_SKIPPED", "Ultralytics is not installed on the backend; model load check was skipped.", "warning")

    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive, tempfile.TemporaryDirectory(prefix="neuralspace-yolo-model-") as tmp:
            members = _safe_zip_members(archive)
            path_map = _strip_common_root([item.filename.replace("\\", "/") for item in members])
            source_name = next((original for original, rel in path_map.items() if rel == primary), None)
            if not source_name:
                return False, _issue("YOLO_PRIMARY_ARTIFACT_MISSING", "Primary artifact declared in metadata does not exist.", "error", str(primary))
            target = Path(tmp) / Path(primary).name
            target.write_bytes(archive.read(source_name))
            YOLO(str(target))
            return True, None
    except HTTPException:
        raise
    except Exception as exc:
        return False, _issue("YOLO_MODEL_LOAD_FAILED", f"Ultralytics could not load the model: {exc}", "error", str(primary))


def _metadata_from_model_zip(raw: bytes) -> dict:
    try:
        archive = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        return {}
    with archive:
        members = _safe_zip_members(archive)
        path_map = _strip_common_root([item.filename.replace("\\", "/") for item in members])
        rel_to_info = {path_map[item.filename.replace("\\", "/")]: item for item in members}
        candidates = (
            "model.metadata.json",
            "upload-metadata.json",
            "version-metadata.json",
            "metadata.json",
        )
        metadata_path = next((name for name in candidates if name in rel_to_info), None)
        if metadata_path is None:
            metadata_path = next((name for name in rel_to_info if name.endswith("/model.metadata.json") or name.endswith("/metadata.json")), None)
        if metadata_path is None:
            return {}
        try:
            parsed = json.loads(archive.read(rel_to_info[metadata_path]).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}


def _flatten_model_metadata(parsed: dict) -> dict:
    model_info = _nested_dict(parsed, "model_info")
    metrics = _nested_dict(parsed, "metrics")
    dataset_lineage = _nested_dict(parsed, "dataset_lineage")
    versioning = _nested_dict(parsed, "versioning")
    flat = dict(parsed)
    if model_info:
        flat.setdefault("name", model_info.get("name"))
        flat.setdefault("version", model_info.get("version"))
        flat.setdefault("description", model_info.get("description"))
        flat.setdefault("architecture", model_info.get("architecture"))
        flat.setdefault("framework", model_info.get("framework"))
        flat.setdefault("task_type", _normalize_model_task(_nested_string(model_info, "task")))
        flat.setdefault("tags", model_info.get("tags"))
    if metrics:
        numeric_metrics = {str(key): float(value) for key, value in metrics.items() if isinstance(value, (int, float))}
        if numeric_metrics:
            flat.setdefault("all_metrics", numeric_metrics)
            metric_name = "mAP50_95" if "mAP50_95" in numeric_metrics else "mAP50" if "mAP50" in numeric_metrics else next(iter(numeric_metrics))
            flat.setdefault("primary_metric_name", metric_name)
            flat.setdefault("primary_metric_value", numeric_metrics[metric_name])
    if dataset_lineage:
        flat.setdefault("dataset_id", dataset_lineage.get("dataset_version_id") or dataset_lineage.get("dataset_id"))
        flat.setdefault("dataset_version_id", dataset_lineage.get("dataset_version_id"))
    if versioning:
        flat.setdefault("run_id", versioning.get("run_id"))
        flat.setdefault("experiment_id", versioning.get("experiment_id"))
    return {key: value for key, value in flat.items() if value is not None}



def _file_payload(filename: str, size_bytes: int, content_type: str | None, storage_path: str, md5: str) -> dict:
    size_mb = round(size_bytes / 1024**2, 1)
    return {
        "name": filename,
        "size": f"{size_mb} MB",
        "type": content_type or "application/octet-stream",
        "storage_path": storage_path,
        "md5": md5,
    }


def _coerce_metrics(parsed: dict) -> tuple[str | None, float | None, dict]:
    metrics = parsed.get("metrics") or parsed.get("all_metrics") or {}
    if not isinstance(metrics, dict):
        metrics = {}
    numeric_metrics: dict[str, float] = {}
    for key, value in metrics.items():
        try:
            numeric_metrics[str(key)] = float(value)
        except (TypeError, ValueError):
            continue

    primary_name = parsed.get("primary_metric_name")
    primary_value = parsed.get("primary_metric_value")
    if primary_name is None and numeric_metrics:
        primary_name = next(iter(numeric_metrics))
    if primary_value is None and primary_name is not None and str(primary_name) in numeric_metrics:
        primary_value = numeric_metrics[str(primary_name)]
    if primary_name is not None:
        primary_name = str(primary_name)
    if primary_value is not None:
        try:
            primary_value = float(primary_value)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="primary_metric_value must be numeric") from exc
    return primary_name, primary_value, numeric_metrics


def _merge_source_payload(row: ModelRegistry, patch: dict) -> dict:
    source_payload = dict(row.source_payload or {})
    source_payload.update({key: value for key, value in patch.items() if value is not None})
    return source_payload


def _format_model_version(version: int | str | None) -> str | None:
    if version is None:
        return None
    value = str(version)
    return value if value.startswith("v") else f"v{value}"


def _model_version_label(row: ModelVersion) -> str:
    return _format_model_version(row.mlflow_version) or "v1.0"


def _to_payload(row: ModelRegistry, latest_version: int | str | None = None) -> dict:
    source_payload = row.source_payload or {}
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description if hasattr(row, "description") else source_payload.get("description", ""),
        "architecture": row.architecture or "unknown",
        "framework": row.framework,
        "task_type": row.task_type or "image_classification",
        "status": row.status,
        "size_bytes": int(row.size_bytes or 0),
        "parameter_count": int(row.parameter_count or 0),
        "primary_metric_name": row.primary_metric_name or "accuracy",
        "primary_metric_value": float(row.primary_metric_value or 0),
        "all_metrics": row.all_metrics or {},
        "tags": row.tags or [],
        "dataset_id": source_payload.get("dataset_id"),
        "custom_metadata": source_payload.get("custom_metadata") or {},
        "created_by": row.created_by or "system",
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
        "training_duration_seconds": source_payload.get("training_duration_seconds"),
        "version": row.version or _format_model_version(latest_version) or "v1.0",
        "storage_path": row.storage_path or "",
    }


async def _latest_versions_by_model_name(db: AsyncSession, model_names: list[str]) -> dict[str, int]:
    if not model_names:
        return {}

    rows = (
        (
            await db.execute(
                select(ModelVersion.mlflow_name, func.max(ModelVersion.mlflow_version))
                .where(ModelVersion.mlflow_name.in_(model_names))
                .group_by(ModelVersion.mlflow_name)
            )
        )
        .tuples()
        .all()
    )
    return {name: int(version) for name, version in rows if version is not None}


async def _ensure_upload_experiment(db: AsyncSession, user: UserContext) -> Experiment:
    name = "Manual model uploads"
    existing = (
        await db.execute(select(Experiment).where(Experiment.name == name).limit(1))
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    next_mlflow_id = (
        await db.execute(select(func.coalesce(func.max(Experiment.mlflow_experiment_id), 0) + 1))
    ).scalar_one()
    experiment = Experiment(
        mlflow_experiment_id=int(next_mlflow_id),
        name=name,
        description="Models uploaded through the NeuralSpace API",
        owner_id=str(getattr(user, "user_id", "upload-user")),
        lifecycle_stage="active",
    )
    db.add(experiment)
    await db.flush()
    return experiment


async def _create_tracked_model_version(
    *,
    db: AsyncSession,
    row: ModelRegistry,
    user: UserContext,
    source: str,
    file_size: int,
    parsed: dict,
    metrics: dict,
) -> ModelVersion:
    now = datetime.now()
    experiment = await _ensure_upload_experiment(db, user)
    run = Run(
        mlflow_run_id=uuid4().hex,
        experiment_id=experiment.id,
        name=f"Upload {row.name} {row.version or ''}".strip(),
        status="FINISHED",
        start_time=now,
        end_time=now,
        artifact_uri=source,
        source_type="LOCAL",
        source_name="models/upload",
        user_id=str(getattr(user, "user_id", "upload-user")),
        metrics_snapshot=metrics,
        params_snapshot={
            "architecture": row.architecture,
            "framework": row.framework,
            "task_type": row.task_type,
        },
        tags_snapshot={"model_registry_id": row.id},
    )
    db.add(run)
    await db.flush()

    next_version = (
        await db.execute(
            select(func.coalesce(func.max(ModelVersion.mlflow_version), 0) + 1).where(
                ModelVersion.mlflow_name == row.name
            )
        )
    ).scalar_one()
    model_version = ModelVersion(
        mlflow_name=row.name,
        mlflow_version=int(next_version),
        run_id=run.id,
        description=parsed.get("changelog") or parsed.get("description") or "Uploaded model",
        stage="None",
        status="READY",
        source=source,
        framework=row.framework,
        task_type=row.task_type,
        size_bytes=file_size,
        metrics=metrics,
        tags={
            "model_registry_id": row.id,
            "md5": (row.source_payload or {}).get("md5"),
            "uploaded_version": row.version,
        },
        created_by=str(getattr(user, "user_id", "upload-user")),
    )
    db.add(model_version)
    await db.flush()

    dataset_version_id = parsed.get("dataset_version_id")
    if dataset_version_id:
        db.add(
            ModelDatasetLink(
                model_version_id=model_version.id,
                dataset_version_id=str(dataset_version_id),
                link_type=str(parsed.get("dataset_link_type") or "train"),
                created_by=str(getattr(user, "user_id", "upload-user")),
                notes=parsed.get("dataset_link_notes"),
            )
        )

    return model_version


@router.get("")
async def list_models(
    page: int = Query(1, ge=1),
    limit: int = Query(18, ge=1, le=200),
    search: str | None = Query(default=None),
    framework: list[str] | None = Query(default=None),
    task_type: list[str] | None = Query(default=None),
    status: str | None = Query(default=None),
    size_category: str | None = Query(default=None),
    min_metric: float | None = Query(default=None),
    sort: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
) -> dict:
    filters = []
    if search:
        filters.append(func.lower(ModelRegistry.name).like(f"%{search.lower()}%"))
    if framework:
        filters.append(ModelRegistry.framework.in_(framework))
    if task_type:
        filters.append(ModelRegistry.task_type.in_(task_type))
    if status:
        filters.append(ModelRegistry.status == status)
    if size_category:
        if size_category == "small":
            filters.append(ModelRegistry.size_bytes < 100 * 1024 * 1024)
        elif size_category == "medium":
            filters.append(ModelRegistry.size_bytes.between(100 * 1024 * 1024, 1024 * 1024 * 1024))
        elif size_category == "large":
            filters.append(ModelRegistry.size_bytes >= 1024 * 1024 * 1024)
    if min_metric is not None:
        filters.append((ModelRegistry.primary_metric_value >= min_metric) | (ModelRegistry.primary_metric_value * 100 >= min_metric))

    stmt = select(ModelRegistry)
    count_stmt = select(func.count(ModelRegistry.id))
    if filters:
        for cond in filters:
            stmt = stmt.where(cond)
            count_stmt = count_stmt.where(cond)

    if sort == "oldest":
        stmt = stmt.order_by(ModelRegistry.updated_at.asc())
    elif sort == "name-asc":
        stmt = stmt.order_by(ModelRegistry.name.asc())
    elif sort == "name-desc":
        stmt = stmt.order_by(ModelRegistry.name.desc())
    elif sort == "size-asc":
        stmt = stmt.order_by(ModelRegistry.size_bytes.asc())
    elif sort == "size-desc":
        stmt = stmt.order_by(ModelRegistry.size_bytes.desc())
    else:
        stmt = stmt.order_by(ModelRegistry.updated_at.desc())

    stmt = stmt.offset((page - 1) * limit).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    latest_versions = await _latest_versions_by_model_name(db, [row.name for row in rows])
    total = int((await db.execute(count_stmt)).scalar() or 0)
    return {
        "items": [_to_payload(row, latest_versions.get(row.name)) for row in rows],
        "total": total,
        "page": page,
        "pageSize": limit,
    }


@router.get("/{model_id}")
async def get_model(model_id: str, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)) -> dict:
    row = await db.get(ModelRegistry, model_id)
    if row is None:
        return {}
    latest_versions = await _latest_versions_by_model_name(db, [row.name])
    payload = _to_payload(row, latest_versions.get(row.name))
    payload.update(
        {
            "framework_version": (row.source_payload or {}).get("framework_version", "unknown"),
            "input_shape": (row.source_payload or {}).get("input_shape", "-"),
            "output_shape": (row.source_payload or {}).get("output_shape", "-"),
            "files": (row.source_payload or {}).get("files", [{"name": "model.bin", "size": f"{round((row.size_bytes or 0)/1024**2,1)} MB", "type": "weights"}]),
        }
    )
    return payload


@router.get("/{model_id}/metrics")
async def get_model_metrics(model_id: str, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)) -> dict:
    row = await db.get(ModelRegistry, model_id)
    if row is None:
        return {"training_history": [], "final_metrics": {}}
    final_metrics = row.all_metrics or {}
    history = [{"epoch": e, "train_loss": max(0.01, 1.2 - 0.02 * e), "val_loss": max(0.01, 1.3 - 0.019 * e), "train_accuracy": min(0.99, 0.55 + 0.008 * e), "val_accuracy": min(0.98, 0.53 + 0.0075 * e)} for e in range(1, 21)]
    return {"training_history": history, "final_metrics": final_metrics}


@router.get("/{model_id}/versions")
async def get_model_versions(model_id: str, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)) -> list[dict]:
    row = await db.get(ModelRegistry, model_id)
    if row is None:
        return []
    rows = (
        (
            await db.execute(
                select(ModelVersion)
                .where(ModelVersion.mlflow_name == row.name)
                .order_by(ModelVersion.mlflow_version.desc())
            )
        )
        .scalars()
        .all()
    )
    manual_history = list((row.source_payload or {}).get("version_history") or [])
    if manual_history:
        return [
            {
                "id": item.get("id") or f"{model_id}-{item.get('version', index)}",
                "version": item.get("version") or "unknown",
                "note": item.get("changelog") or "Manual upload",
                "created_at": item.get("created_at") or row.updated_at.isoformat(),
                "current": item.get("version") == row.version,
            }
            for index, item in enumerate(reversed(manual_history), start=1)
        ]

    if not rows:
        return [
            {
                "id": f"{model_id}-{row.version or 'v1.0'}",
                "version": row.version or "v1.0",
                "note": "Model registry version",
                "created_at": row.updated_at.isoformat(),
                "current": True,
            }
        ]

    latest_version = max(item.mlflow_version for item in rows)
    return [
        {
            "id": item.id,
            "version": _model_version_label(item),
            "note": item.description or item.stage,
            "created_at": item.created_at.isoformat(),
            "current": item.mlflow_version == latest_version,
        }
        for item in rows
    ]


@router.patch("/{model_id}")
async def update_model(
    model_id: str,
    payload: dict = Body(default_factory=dict),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
) -> dict:
    row = await db.get(ModelRegistry, model_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")

    if "status" in payload and payload["status"] is not None:
        allowed_statuses = {"ready", "training", "trained", "failed"}
        model_status = str(payload["status"])
        if model_status not in allowed_statuses:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"status must be one of {sorted(allowed_statuses)}",
            )
        row.status = model_status
    if "architecture" in payload and payload["architecture"] is not None:
        row.architecture = str(payload["architecture"])
    if "framework" in payload and payload["framework"] is not None:
        allowed_frameworks = {"pytorch", "tensorflow", "onnx", "huggingface", "sklearn", "ultralytics"}
        framework = str(payload["framework"])
        if framework not in allowed_frameworks:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"framework must be one of {sorted(allowed_frameworks)}",
            )
        row.framework = framework
    if "task_type" in payload and payload["task_type"] is not None:
        allowed_task_types = {
            "image_classification",
            "object_detection",
            "semantic_segmentation",
            "text_classification",
            "text_generation",
            "regression",
        }
        task_type = str(payload["task_type"])
        if task_type not in allowed_task_types:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"task_type must be one of {sorted(allowed_task_types)}",
            )
        row.task_type = task_type
    if "parameter_count" in payload and payload["parameter_count"] is not None:
        try:
            parameter_count = int(payload["parameter_count"])
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="parameter_count must be an integer",
            ) from exc
        if parameter_count < 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="parameter_count must be greater than or equal to 0",
            )
        row.parameter_count = parameter_count
    if "tags" in payload and isinstance(payload["tags"], list):
        row.tags = [str(item).strip() for item in payload["tags"] if str(item).strip()]
    if "custom_metadata" in payload and not isinstance(payload["custom_metadata"], dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="custom_metadata must be an object",
        )

    primary_name, primary_value, metrics = _coerce_metrics(payload)
    if primary_name is not None:
        row.primary_metric_name = primary_name
    if primary_value is not None:
        row.primary_metric_value = primary_value
    if metrics:
        row.all_metrics = metrics

    source_patch = {
        "description": payload.get("description"),
        "framework_version": payload.get("framework_version"),
        "input_shape": payload.get("input_shape"),
        "output_shape": payload.get("output_shape"),
        "dataset_id": payload.get("dataset_id"),
        "training_duration_seconds": payload.get("training_duration_seconds"),
        "custom_metadata": {
            str(key).strip(): str(value).strip()
            for key, value in (payload.get("custom_metadata") or {}).items()
            if str(key).strip() and value is not None and str(value).strip()
        }
        if "custom_metadata" in payload
        else None,
    }
    row.source_payload = _merge_source_payload(row, source_patch)
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return _to_payload(row)


@router.delete("/{model_id}")
async def delete_model(
    model_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    from app.clients.minio_client import get_minio_client
    from app.core.logging import get_logger

    logger = get_logger(__name__)

    row = await db.get(ModelRegistry, model_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
    if row.created_by and row.created_by != current_user.user_id and "admin" not in current_user.roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permission")

    # Collect all tracked ModelVersions for this model
    versions = list(
        (
            await db.execute(select(ModelVersion).where(ModelVersion.mlflow_name == row.name))
        ).scalars().all()
    )
    run_ids = [item.run_id for item in versions if item.run_id]
    runs: list[Run] = []
    if run_ids:
        runs = list((await db.execute(select(Run).where(Run.id.in_(run_ids)))).scalars().all())

    # Collect MinIO references
    refs = _collect_source_payload_refs(row.source_payload or {})
    ref = _object_from_storage_path(row.storage_path)
    if ref:
        refs.add(ref)
    for version in versions:
        ref = _object_from_storage_path(version.source)
        if ref:
            refs.add(ref)
    for run in runs:
        ref = _object_from_storage_path(run.artifact_uri)
        if ref:
            refs.add(ref)

    # Delete storage objects — errors are logged but do NOT abort the DB delete
    storage_provider_id = (row.source_payload or {}).get("storage_provider_id")
    provider = None
    if storage_provider_id:
        from app.models.storage_provider import StorageProvider
        from app.services.storage.factory import get_storage_provider
        provider_model = await db.get(StorageProvider, storage_provider_id)
        if provider_model:
            provider = get_storage_provider(provider_model)

    deleted_objects = 0
    
    if provider:
        for bucket, object_name in refs:
            try:
                # `object_name` retains `gdrive://` prefix for Google Drive due to _object_from_storage_path
                await provider.delete(object_name)
                deleted_objects += 1
            except Exception as exc:
                logger.warning("Failed to delete storage object", object_name=object_name, error=str(exc))
    else:
        minio = get_minio_client()
        for bucket, object_name in refs:
            try:
                await minio.delete_object(object_name, bucket=bucket)
                deleted_objects += 1
            except Exception as exc:
                logger.warning("Failed to delete MinIO object", object_name=object_name, error=str(exc))
        try:
            deleted_objects += await minio.delete_prefix(f"models/{row.id}/")
        except Exception as exc:
            logger.warning("Failed to delete MinIO prefix", prefix=f"models/{row.id}/", error=str(exc))

    # Delete DB records in dependency order
    try:
        version_ids = [item.id for item in versions]
        if version_ids:
            await db.execute(delete(ApprovalRequest).where(ApprovalRequest.model_version_id.in_(version_ids)))
            await db.execute(delete(ModelDatasetLink).where(ModelDatasetLink.model_version_id.in_(version_ids)))
            await db.execute(delete(ModelVersion).where(ModelVersion.id.in_(version_ids)))
        if run_ids:
            await db.execute(delete(RunLog).where(RunLog.run_id.in_(run_ids)))
            await db.execute(delete(Run).where(Run.id.in_(run_ids)))
        # Delete workspace associations (explicit delete to avoid cascade conflict)
        await db.execute(delete(WorkspaceModel).where(WorkspaceModel.model_id == row.id))
        # Expunge from session to avoid relationship cascade re-triggering on delete
        await db.refresh(row)
        await db.delete(row)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        logger.error("Failed to delete model from DB", model_id=model_id, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete model: {exc}",
        ) from exc

    return {"deleted": True, "model_id": model_id, "deleted_objects": deleted_objects}


@router.post("/{model_id}/versions")
async def upload_model_version(
    model_id: str,
    file: UploadFile = File(...),
    metadata: str | None = Form(default=None),
    storage_provider_id: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    from app.clients.minio_client import get_minio_client, md5_hex

    row = await db.get(ModelRegistry, model_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")

    parsed = _parse_metadata(metadata)
    now = datetime.now(timezone.utc)
    safe_filename = _safe_filename(file.filename)
    version_history = list((row.source_payload or {}).get("version_history") or [])
    version = str(parsed.get("version") or f"v{len(version_history) + 2}.0")
    safe_version = _safe_filename(version)

    raw = await file.read()
    file_size = len(raw)
    file_md5 = md5_hex(raw)
    content_type = file.content_type or "application/octet-stream"
    object_name = f"models/{model_id}/versions/{safe_version}/{safe_filename}"
    
    if storage_provider_id:
        from app.models.storage_provider import StorageProvider
        from app.services.storage.factory import get_storage_provider
        provider_model = await db.get(StorageProvider, storage_provider_id)
        if not provider_model:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Storage provider not found")
        provider = get_storage_provider(provider_model)
        storage_path = await provider.upload_bytes(data=raw, dest_path=object_name, content_type=content_type)
    else:
        minio = get_minio_client()
        storage_path = await minio.upload_bytes(
            object_name=object_name,
            data=raw,
            content_type=content_type,
        )

    primary_name, primary_value, metrics = _coerce_metrics(parsed)
    if primary_name is not None:
        row.primary_metric_name = primary_name
    if primary_value is not None:
        row.primary_metric_value = primary_value
    if metrics:
        row.all_metrics = metrics

    file_info = _file_payload(safe_filename, file_size, content_type, storage_path, file_md5)
    history_item = {
        "id": f"{model_id}-{safe_version}-{uuid4().hex[:8]}",
        "version": version,
        "changelog": parsed.get("changelog"),
        "framework_version": parsed.get("framework_version"),
        "input_shape": parsed.get("input_shape"),
        "output_shape": parsed.get("output_shape"),
        "metrics": metrics,
        "storage_path": storage_path,
        "object_name": object_name,
        "file": file_info,
        "created_at": now.isoformat(),
        "created_by": str(getattr(current_user, "user_id", "upload-user")),
    }

    row.version = version
    row.storage_path = storage_path
    row.size_bytes = file_size
    row.source_payload = _merge_source_payload(
        row,
        {
            "framework_version": parsed.get("framework_version"),
            "input_shape": parsed.get("input_shape"),
            "output_shape": parsed.get("output_shape"),
            "minio_object": object_name,
            "md5": file_md5,
            "storage_provider_id": storage_provider_id,
            "files": [file_info],
            "version_history": [*version_history, history_item],
        },
    )
    row.updated_at = now
    model_version = await _create_tracked_model_version(
        db=db,
        row=row,
        user=current_user,
        source=storage_path,
        file_size=file_size,
        parsed=parsed,
        metrics=metrics,
    )
    await db.commit()
    await db.refresh(row)
    response = _to_payload(row, model_version.mlflow_version)
    response["latest_model_version_id"] = model_version.id
    return response


@router.post("/upload")
async def upload_model(
    file: UploadFile = File(...),
    metadata: str | None = Form(default=None),
    storage_provider_id: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    from app.clients.minio_client import get_minio_client, md5_hex

    now = datetime.now(timezone.utc)
    model_id = f"model_{uuid4().hex[:10]}"

    # --- Read file contents ---
    raw = await file.read()
    file_size = len(raw)
    file_md5 = md5_hex(raw)
    safe_filename = _safe_filename(file.filename)
    parsed = _parse_metadata(metadata)
    if not parsed and safe_filename.lower().endswith(".zip"):
        parsed = _metadata_from_model_zip(raw)
    parsed = _flatten_model_metadata(parsed)

    # --- Upload to Storage ---
    version = str(parsed.get("version") or "v1.0")
    safe_version = _safe_filename(version)
    object_name = f"models/{model_id}/versions/{safe_version}/{safe_filename}"
    content_type = file.content_type or "application/octet-stream"
    
    if storage_provider_id:
        from app.models.storage_provider import StorageProvider
        from app.services.storage.factory import get_storage_provider
        provider_model = await db.get(StorageProvider, storage_provider_id)
        if not provider_model:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Storage provider not found")
        provider = get_storage_provider(provider_model)
        storage_path = await provider.upload_bytes(data=raw, dest_path=object_name, content_type=content_type)
    else:
        minio = get_minio_client()
        storage_path = await minio.upload_bytes(
            object_name=object_name,
            data=raw,
            content_type=content_type,
        )

    # --- Persist metadata to DB ---
    row = ModelRegistry(
        id=model_id,
        name=parsed.get("name") or safe_filename.rsplit(".", 1)[0],
        architecture=parsed.get("architecture") or "unknown",
        framework=parsed.get("framework") or "onnx",
        task_type=parsed.get("task_type") or "image_classification",
        status="ready",
        version=version,
        size_bytes=file_size,
        parameter_count=int(parsed.get("parameter_count") or 0),
        primary_metric_name=parsed.get("primary_metric_name") or "accuracy",
        primary_metric_value=float(parsed.get("primary_metric_value") or 0),
        all_metrics=parsed.get("all_metrics") or {},
        tags=parsed.get("tags") or [],
        storage_path=storage_path,
        created_by=str(getattr(current_user, "user_id", "upload-user")),
        source_payload={
            "framework_version": parsed.get("framework_version", "unknown"),
            "input_shape": parsed.get("input_shape", "-"),
            "output_shape": parsed.get("output_shape", "-"),
            "dataset_id": parsed.get("dataset_id"),
            "training_duration_seconds": parsed.get("training_duration_seconds"),
            "minio_object": object_name,
            "md5": file_md5,
            "storage_provider_id": storage_provider_id,
            "description": parsed.get("description"),
            "files": [_file_payload(safe_filename, file_size, content_type, storage_path, file_md5)],
            "version_history": [
                {
                    "id": f"{model_id}-{version}",
                    "version": version,
                    "changelog": parsed.get("changelog") or "Initial upload",
                    "metrics": parsed.get("all_metrics") or {},
                    "storage_path": storage_path,
                    "object_name": object_name,
                    "created_at": now.isoformat(),
                    "created_by": str(getattr(current_user, "user_id", "upload-user")),
                }
            ],
        },
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    await db.flush()
    model_version = await _create_tracked_model_version(
        db=db,
        row=row,
        user=current_user,
        source=storage_path,
        file_size=file_size,
        parsed=parsed,
        metrics=parsed.get("all_metrics") or {},
    )
    await db.commit()
    await db.refresh(row)
    response = _to_payload(row, model_version.mlflow_version)
    response["latest_model_version_id"] = model_version.id
    return response


@router.post("/general/upload")
async def upload_general_model(
    file: UploadFile = File(...),
    metadata: str | None = Form(default=None),
    storage_provider_id: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    return await upload_model(file=file, metadata=metadata, storage_provider_id=storage_provider_id, db=db, current_user=current_user)


@router.post("/general/inspect")
async def inspect_general_model(
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    version: str | None = Form(default=None),
    description: str | None = Form(default=None),
    architecture: str | None = Form(default=None),
    framework: str | None = Form(default=None),
    task: str | None = Form(default=None),
    tags: str | None = Form(default=None),
    _db: AsyncSession = Depends(get_db),
    _current_user: UserContext = Depends(get_current_user),
) -> dict:
    """Inspect a general model file without saving to DB. Returns suggested form values and metadata."""
    raw = await file.read()
    safe_filename = _safe_filename(file.filename or "model")
    file_size = len(raw)

    parsed: dict = {}
    if safe_filename.lower().endswith(".zip"):
        parsed = _metadata_from_model_zip(raw)
    parsed = _flatten_model_metadata(parsed)

    resolved_name = name or parsed.get("name") or safe_filename.rsplit(".", 1)[0]
    resolved_version = version or str(parsed.get("version") or "v1.0")
    resolved_description = description or str(parsed.get("description") or "")
    resolved_architecture = architecture or str(parsed.get("architecture") or "")
    resolved_framework = framework or str(parsed.get("framework") or "onnx")
    resolved_task = task or str(parsed.get("task_type") or "object_detection")
    resolved_tags_list = _parse_tags(tags)
    if not resolved_tags_list and isinstance(parsed.get("tags"), list):
        resolved_tags_list = [str(item).strip() for item in parsed["tags"] if str(item).strip()]

    all_metrics: dict[str, float] = {}
    if isinstance(parsed.get("all_metrics"), dict):
        all_metrics = {str(k): float(v) for k, v in parsed["all_metrics"].items() if isinstance(v, (int, float))}
    primary_metric_name = str(parsed.get("primary_metric_name") or (next(iter(all_metrics), None) or ""))
    primary_metric_value_raw = parsed.get("primary_metric_value")
    primary_metric_value: float | None = float(primary_metric_value_raw) if isinstance(primary_metric_value_raw, (int, float)) else None

    ext = safe_filename.rsplit(".", 1)[-1].lower() if "." in safe_filename else "unknown"
    format_label = "zip" if ext == "zip" else ext

    warnings: list[dict] = []
    errors: list[dict] = []
    if not raw:
        errors.append(_issue("INSPECT_EMPTY_FILE", "Uploaded file is empty.", "error", safe_filename))

    return {
        "form": {
            "name": resolved_name,
            "version": resolved_version,
            "description": resolved_description,
            "architecture": resolved_architecture,
            "framework": resolved_framework,
            "task": resolved_task,
            "tags": resolved_tags_list,
        },
        "metadata": {
            "name": resolved_name,
            "format": format_label,
            "framework": resolved_framework,
            "task_type": resolved_task,
            "size_bytes": file_size,
            "architecture": resolved_architecture or None,
            "primary_metric_name": primary_metric_name or None,
            "primary_metric_value": primary_metric_value,
            "all_metrics": all_metrics or None,
        },
        "validation_report": {
            "status": "failed" if errors else ("warning" if warnings else "passed"),
            "summary": {"error_count": len(errors), "warning_count": len(warnings)},
            "errors": errors,
            "warnings": warnings,
        },
    }


@router.post("/yolo/inspect")
async def inspect_yolo_model(
    file: UploadFile = File(..., description="YOLO/Ultralytics model package ZIP"),
    name: str | None = Form(default=None),
    version: str | None = Form(default=None),
    description: str | None = Form(default=None),
    architecture: str | None = Form(default=None),
    task: str | None = Form(default=None),
    tags: str | None = Form(default=None),
    dataset_version_id: str | None = Form(default=None),
    experiment_id: str | None = Form(default=None),
    yolo_type: str = Form(default="detection"),
    db: AsyncSession = Depends(get_db),
    _current_user: UserContext = Depends(get_current_user),
) -> dict:
    """Inspect a YOLO model ZIP without saving to DB. Returns suggested form values, metadata, and validation report."""
    safe_filename = _safe_filename(file.filename or "model.zip")
    errors: list[dict] = []
    warnings: list[dict] = []

    if not safe_filename.lower().endswith(".zip"):
        errors.append(_issue("YOLO_REQUIRES_ZIP", "YOLO model upload requires a .zip package.", "error", safe_filename))
        return {
            "form": {"name": name or safe_filename, "version": version or "v1.0", "description": description or "", "architecture": architecture or "", "framework": "ultralytics", "task": task or "object_detection", "tags": _parse_tags(tags)},
            "metadata": {"name": name or safe_filename, "format": "unknown", "framework": "ultralytics", "task_type": task or "object_detection", "size_bytes": 0},
            "validation_report": {"status": "failed", "summary": {"error_count": 1, "warning_count": 0}, "errors": errors, "warnings": warnings},
        }

    raw = await file.read()
    if not raw:
        errors.append(_issue("UPLOAD_EMPTY_FILE", "Uploaded file is empty.", "error", safe_filename))
        return {
            "form": {"name": name or safe_filename, "version": version or "v1.0", "description": description or "", "architecture": architecture or "", "framework": "ultralytics", "task": task or "object_detection", "tags": _parse_tags(tags)},
            "metadata": {"name": name or safe_filename, "format": "zip", "framework": "ultralytics", "task_type": task or "object_detection", "size_bytes": 0},
            "validation_report": {"status": "failed", "summary": {"error_count": 1, "warning_count": 0}, "errors": errors, "warnings": warnings},
        }

    analysis = _analyze_yolo_package(raw, safe_filename, yolo_type)
    errors = list(analysis.get("errors") or [])
    warnings = list(analysis.get("warnings") or [])
    metadata = analysis.get("metadata") if isinstance(analysis.get("metadata"), dict) else {}
    model_info = analysis.get("model_info") if isinstance(analysis.get("model_info"), dict) else {}
    dataset_lineage = analysis.get("dataset_lineage") if isinstance(analysis.get("dataset_lineage"), dict) else {}
    metrics = analysis.get("metrics") if isinstance(analysis.get("metrics"), dict) else {}
    artifacts = analysis.get("artifacts") if isinstance(analysis.get("artifacts"), dict) else {}

    # Validate dataset version linkage if provided
    resolved_dataset_version_id = (
        dataset_version_id
        or _nested_string(dataset_lineage, "dataset_version_id")
        or _nested_string(metadata, "dataset_version_id")
    )
    dataset_classes: list[str] = []
    if resolved_dataset_version_id:
        dataset_version = await db.get(DatasetVersion, resolved_dataset_version_id)
        if dataset_version is None:
            errors.append(_issue("YOLO_DATASET_VERSION_NOT_FOUND", "Selected dataset version does not exist.", "error", resolved_dataset_version_id))
        else:
            dataset_classes = await _dataset_classes_for_version(db, resolved_dataset_version_id)
    else:
        warnings.append(_issue("YOLO_DATASET_VERSION_MISSING", "No dataset version selected; lineage will be incomplete.", "warning"))

    model_classes = dataset_lineage.get("classes") if isinstance(dataset_lineage.get("classes"), list) else []
    model_classes = [str(item) for item in model_classes]
    if model_classes and dataset_classes and model_classes != dataset_classes:
        errors.append(_issue("YOLO_CLASSES_MISMATCH", "Classes in model metadata do not match the selected dataset version.", "error"))

    # Resolve final form values
    all_metrics = {str(k): float(v) for k, v in metrics.items() if isinstance(v, (int, float))}
    primary_metric_name = "mAP50_95" if "mAP50_95" in all_metrics else "mAP50" if "mAP50" in all_metrics else next(iter(all_metrics), "metric")
    primary_metric_value = float(all_metrics.get(primary_metric_name, 0)) if all_metrics else None

    resolved_name = name or _nested_string(model_info, "name") or safe_filename.rsplit(".", 1)[0]
    resolved_version = version or _nested_string(model_info, "version") or "v1.0"
    resolved_description = description or _nested_string(model_info, "description") or ""
    resolved_architecture = architecture or _nested_string(model_info, "architecture") or "yolo"
    resolved_task = _normalize_model_task(task or _nested_string(model_info, "task"))
    resolved_tags_list = _parse_tags(tags)
    if not resolved_tags_list and isinstance(model_info.get("tags"), list):
        resolved_tags_list = [str(item).strip() for item in model_info["tags"] if str(item).strip()]

    has_weights = bool(artifacts.get("best_model_path") or artifacts.get("last_model_path"))
    has_onnx = bool(artifacts.get("exported_model_paths"))

    validation_status = "failed" if errors else ("warning" if warnings else "passed")

    return {
        "form": {
            "name": resolved_name,
            "version": resolved_version,
            "description": resolved_description,
            "architecture": resolved_architecture,
            "framework": "ultralytics",
            "task": resolved_task,
            "tags": resolved_tags_list,
        },
        "metadata": {
            "name": resolved_name,
            "format": "yolo_zip",
            "framework": "ultralytics",
            "task_type": resolved_task,
            "size_bytes": len(raw),
            "architecture": resolved_architecture,
            "has_weights": has_weights,
            "has_onnx": has_onnx,
            "primary_metric_name": primary_metric_name if all_metrics else None,
            "primary_metric_value": primary_metric_value,
            "all_metrics": all_metrics or None,
        },
        "validation_report": {
            "status": validation_status,
            "summary": {"error_count": len(errors), "warning_count": len(warnings)},
            "errors": errors,
            "warnings": warnings,
        },
    }


@router.post("/yolo/upload", status_code=status.HTTP_201_CREATED)
async def upload_yolo_model(
    file: UploadFile = File(..., description="YOLO/Ultralytics model package ZIP"),
    name: str | None = Form(default=None),
    version: str | None = Form(default=None),
    description: str | None = Form(default=None),
    architecture: str | None = Form(default=None),
    task: str | None = Form(default=None),
    tags: str | None = Form(default=None, description="Comma-separated tags"),
    dataset_version_id: str | None = Form(default=None),
    experiment_id: str | None = Form(default=None),
    yolo_type: str = Form(default="detection"),
    storage_provider_id: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
) -> dict:
    from app.clients.minio_client import get_minio_client, md5_hex

    safe_filename = _safe_filename(file.filename or "yolo-model.zip")
    if not safe_filename.lower().endswith(".zip"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "YOLO model validation failed",
                "status": "failed",
                "errors": [_issue("YOLO_REQUIRES_ZIP", "YOLO model upload requires a .zip package.", "error", safe_filename)],
                "warnings": [],
            },
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "YOLO model validation failed",
                "status": "failed",
                "errors": [_issue("UPLOAD_EMPTY_FILE", "Uploaded file is empty.", "error", safe_filename)],
                "warnings": [],
            },
        )

    analysis = _analyze_yolo_package(raw, safe_filename, yolo_type)
    errors = list(analysis.get("errors") or [])
    warnings = list(analysis.get("warnings") or [])
    metadata = analysis.get("metadata") if isinstance(analysis.get("metadata"), dict) else {}
    model_info = analysis.get("model_info") if isinstance(analysis.get("model_info"), dict) else {}
    dataset_lineage = analysis.get("dataset_lineage") if isinstance(analysis.get("dataset_lineage"), dict) else {}
    metrics = analysis.get("metrics") if isinstance(analysis.get("metrics"), dict) else {}
    artifacts = analysis.get("artifacts") if isinstance(analysis.get("artifacts"), dict) else {}
    validation_checks = analysis.get("validation_checks") if isinstance(analysis.get("validation_checks"), dict) else {}

    resolved_dataset_version_id = (
        dataset_version_id
        or _nested_string(dataset_lineage, "dataset_version_id")
        or _nested_string(metadata, "dataset_version_id")
    )
    dataset_classes: list[str] = []
    if resolved_dataset_version_id:
        dataset_version = await db.get(DatasetVersion, resolved_dataset_version_id)
        if dataset_version is None:
            errors.append(_issue("YOLO_DATASET_VERSION_NOT_FOUND", "Selected dataset version does not exist.", "error", resolved_dataset_version_id))
        else:
            dataset_classes = await _dataset_classes_for_version(db, resolved_dataset_version_id)
    else:
        warnings.append(_issue("YOLO_DATASET_VERSION_MISSING", "No dataset version selected; lineage will be incomplete.", "warning"))

    model_classes = dataset_lineage.get("classes") if isinstance(dataset_lineage.get("classes"), list) else []
    model_classes = [str(item) for item in model_classes]
    if model_classes and dataset_classes:
        validation_checks["classes_match_dataset"] = model_classes == dataset_classes
        if model_classes != dataset_classes:
            errors.append(_issue("YOLO_CLASSES_MISMATCH", "Classes in model metadata do not match the selected dataset version.", "error"))
    elif dataset_classes and not model_classes:
        warnings.append(_issue("YOLO_MODEL_CLASSES_MISSING", "Dataset classes were found, but model metadata does not declare classes.", "warning"))

    loadable, load_issue = _loadable_check(raw, analysis)
    validation_checks["model_loadable"] = loadable
    if load_issue:
        if load_issue["severity"] == "error":
            errors.append(load_issue)
        else:
            warnings.append(load_issue)

    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "YOLO model validation failed",
                "status": "failed",
                "errors": errors,
                "warnings": warnings,
            },
        )

    now = datetime.now(timezone.utc)
    model_id = f"model_{uuid4().hex[:10]}"
    file_size = len(raw)
    file_md5 = md5_hex(raw)
    resolved_version = str(version or _nested_string(model_info, "version") or "v1.0")
    safe_version = _safe_filename(resolved_version)
    minio_object = f"models/{model_id}/versions/{safe_version}/{safe_filename}"
    
    if storage_provider_id:
        from app.models.storage_provider import StorageProvider
        from app.services.storage.factory import get_storage_provider
        provider_model = await db.get(StorageProvider, storage_provider_id)
        if not provider_model:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Storage provider not found")
        provider = get_storage_provider(provider_model)
        storage_path = await provider.upload_bytes(data=raw, dest_path=minio_object, content_type="application/zip")
    else:
        minio = get_minio_client()
        storage_path = await minio.upload_bytes(
            object_name=minio_object,
            data=raw,
            content_type="application/zip",
        )

    all_metrics = {str(key): float(value) for key, value in metrics.items() if isinstance(value, (int, float))}
    primary_metric_name = "mAP50_95" if "mAP50_95" in all_metrics else "mAP50" if "mAP50" in all_metrics else next(iter(all_metrics), "metric")
    primary_metric_value = float(all_metrics.get(primary_metric_name, 0))
    validation_status = "warning" if warnings else "passed"
    validation_report = {
        "schema_version": "1.0",
        "status": validation_status,
        "checked_at": now.isoformat(),
        "summary": {"error_count": 0, "warning_count": len(warnings)},
        "errors": [],
        "warnings": warnings,
        "checks": validation_checks,
    }
    resolved_name = name or _nested_string(model_info, "name") or safe_filename.rsplit(".", 1)[0]
    resolved_architecture = architecture or _nested_string(model_info, "architecture") or "yolo"
    resolved_task = _normalize_model_task(task or _nested_string(model_info, "task"))
    resolved_tags = _parse_tags(tags)
    if not resolved_tags and isinstance(model_info.get("tags"), list):
        resolved_tags = [str(item).strip() for item in model_info["tags"] if str(item).strip()]

    row = ModelRegistry(
        id=model_id,
        name=resolved_name,
        architecture=resolved_architecture,
        framework="ultralytics",
        task_type=resolved_task,
        status="ready",
        version=resolved_version,
        size_bytes=file_size,
        parameter_count=0,
        primary_metric_name=primary_metric_name,
        primary_metric_value=primary_metric_value,
        all_metrics=all_metrics,
        tags=resolved_tags,
        storage_path=storage_path,
        created_by=str(getattr(current_user, "user_id", "upload-user")),
        source_payload={
            "framework_version": "ultralytics",
            "input_shape": str(_nested_dict(metadata, "deployment_info").get("input_size") or "-"),
            "output_shape": "-",
            "dataset_id": resolved_dataset_version_id,
            "description": description or _nested_string(model_info, "description") or "",
            "minio_object": minio_object,
            "storage_provider_id": storage_provider_id,
            "md5": file_md5,
            "custom_metadata": {
                "package_type": "yolo_model",
                "metadata": metadata,
                "artifacts": artifacts,
                "validation_report": validation_report,
                "lineage": {
                    "dataset_version_id": resolved_dataset_version_id,
                    "run_id": run_id or _nested_string(_nested_dict(metadata, "versioning"), "run_id"),
                    "experiment_id": experiment_id or _nested_string(_nested_dict(metadata, "versioning"), "experiment_id"),
                },
                "classes": model_classes or dataset_classes,
            },
            "files": [_file_payload(safe_filename, file_size, file.content_type or "application/zip", storage_path, file_md5)],
            "version_history": [
                {
                    "id": f"{model_id}-{safe_version}",
                    "version": resolved_version,
                    "changelog": "Initial YOLO model package upload",
                    "metrics": all_metrics,
                    "storage_path": storage_path,
                    "object_name": minio_object,
                    "created_at": now.isoformat(),
                    "created_by": str(getattr(current_user, "user_id", "upload-user")),
                }
            ],
        },
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    await db.flush()
    model_version = await _create_tracked_model_version(
        db=db,
        row=row,
        user=current_user,
        source=storage_path,
        file_size=file_size,
        parsed={
            "description": description or _nested_string(model_info, "description") or "Uploaded YOLO model package",
            "dataset_version_id": resolved_dataset_version_id,
            "run_id": run_id,
            "experiment_id": experiment_id,
            "all_metrics": all_metrics,
        },
        metrics=all_metrics,
    )
    await db.commit()
    await db.refresh(row)
    response = _to_payload(row, model_version.mlflow_version)
    response["latest_model_version_id"] = model_version.id
    return response
