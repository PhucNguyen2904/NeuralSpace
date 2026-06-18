from __future__ import annotations

import csv
import io
import json
import zipfile
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

from app.services.dataset_upload_models import ParsedDataset, ValidationResult


class GeneralDatasetParser:
    def parse(
        self,
        *,
        path: Path,
        filename: str,
        size_bytes: int,
        dataset_type: str | None,
        task_type: str | None,
        label_column: str | None,
    ) -> tuple[ParsedDataset | None, ValidationResult]:
        validation = ValidationResult()
        suffix = path.suffix.lower()
        if suffix == ".csv":
            return self._parse_csv(path, filename, size_bytes, dataset_type, task_type, label_column, validation)
        if suffix == ".json":
            return self._parse_json(path, filename, size_bytes, dataset_type, task_type, label_column, validation)
        if suffix == ".zip":
            return self._parse_zip(path, filename, size_bytes, dataset_type, task_type, validation)
        if suffix == ".parquet":
            return self._parse_parquet(path, filename, size_bytes, dataset_type, task_type, label_column, validation)
        validation.add_error("GENERAL_UNSUPPORTED_FORMAT", "Supported formats are .csv, .json, .parquet, and .zip", filename)
        return None, validation

    def _parse_csv(
        self,
        path: Path,
        filename: str,
        size_bytes: int,
        dataset_type: str | None,
        task_type: str | None,
        label_column: str | None,
        validation: ValidationResult,
    ) -> tuple[ParsedDataset | None, ValidationResult]:
        try:
            with path.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.DictReader(handle)
                columns = reader.fieldnames or []
                if not columns:
                    validation.add_error("CSV_MISSING_HEADER", "CSV must contain a header row", filename)
                    return None, validation
                samples: list[dict[str, str]] = []
                row_count = 0
                missing = Counter({column: 0 for column in columns})
                for row in reader:
                    row_count += 1
                    if len(samples) < 500:
                        samples.append(row)
                    for column in columns:
                        if row.get(column) in {None, ""}:
                            missing[column] += 1
        except UnicodeDecodeError:
            validation.add_error("CSV_ENCODING_UNSUPPORTED", "CSV must be UTF-8 encoded", filename)
            return None, validation

        if label_column and label_column not in columns:
            validation.add_error("GENERAL_LABEL_COLUMN_NOT_FOUND", f"label_column '{label_column}' does not exist", filename)

        column_schema = [
            {
                "name": column,
                "type": self._infer_type([row.get(column, "") for row in samples]),
                "missing": int(missing[column]),
                "nullable": missing[column] > 0,
            }
            for column in columns
        ]
        return self._parsed(
            filename=filename,
            format="csv",
            dataset_type=dataset_type or "tabular",
            task_type=task_type or "custom",
            size_bytes=size_bytes,
            item_count=row_count,
            statistics={"row_count": row_count, "column_count": len(columns), "missing_values": dict(missing)},
            schema_snapshot={"columns": column_schema},
            preview={
                "file_name": filename,
                "format": "csv",
                "row_count": row_count,
                "column_count": len(columns),
                "columns": column_schema,
                "missing_values": dict(missing),
                "validation_status": validation.status,
            },
        ), validation

    def _parse_json(
        self,
        path: Path,
        filename: str,
        size_bytes: int,
        dataset_type: str | None,
        task_type: str | None,
        label_column: str | None,
        validation: ValidationResult,
    ) -> tuple[ParsedDataset | None, ValidationResult]:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            validation.add_error("JSON_INVALID", f"JSON could not be parsed: {exc.msg}", filename, exc.lineno)
            return None, validation
        records = payload if isinstance(payload, list) else payload.get("records", []) if isinstance(payload, dict) else []
        if not isinstance(records, list):
            validation.add_error("JSON_UNSUPPORTED_SHAPE", "JSON must be an array of objects or contain a records array", filename)
            return None, validation
        keys = sorted({key for row in records[:500] if isinstance(row, dict) for key in row.keys()})
        if label_column and label_column not in keys:
            validation.add_error("GENERAL_LABEL_COLUMN_NOT_FOUND", f"label_column '{label_column}' does not exist", filename)
        columns = [{"name": key, "type": self._infer_json_type([row.get(key) for row in records[:500] if isinstance(row, dict)]), "nullable": True} for key in keys]
        return self._parsed(
            filename=filename,
            format="json",
            dataset_type=dataset_type or "tabular",
            task_type=task_type or "custom",
            size_bytes=size_bytes,
            item_count=len(records),
            statistics={"record_count": len(records), "column_count": len(keys)},
            schema_snapshot={"columns": columns},
            preview={"file_name": filename, "format": "json", "record_count": len(records), "columns": columns, "validation_status": validation.status},
        ), validation

    def _parse_zip(
        self,
        path: Path,
        filename: str,
        size_bytes: int,
        dataset_type: str | None,
        task_type: str | None,
        validation: ValidationResult,
    ) -> tuple[ParsedDataset | None, ValidationResult]:
        embedded_metadata: dict[str, Any] = {}
        primary_name: str | None = None
        primary_parsed: ParsedDataset | None = None
        try:
            with zipfile.ZipFile(path) as archive:
                files = [item for item in archive.infolist() if not item.is_dir()]
                if len(files) > 50_000:
                    validation.add_error("ZIP_TOO_MANY_FILES", f"ZIP contains too many files: {len(files)}", filename)
                for item in files:
                    parts = Path(item.filename).parts
                    if Path(item.filename).is_absolute() or ".." in parts:
                        validation.add_error("ZIP_UNSAFE_PATH", "ZIP contains an unsafe path", item.filename)
                ext_counts = Counter(Path(item.filename).suffix.lower() or "[no_ext]" for item in files)
                tree = [item.filename for item in files[:200]]
                metadata_item = self._find_metadata_file(files)
                if metadata_item is not None:
                    try:
                        embedded_metadata = json.loads(archive.read(metadata_item).decode("utf-8-sig"))
                        if not isinstance(embedded_metadata, dict):
                            embedded_metadata = {}
                            validation.add_warning("ZIP_METADATA_UNSUPPORTED_SHAPE", "Metadata JSON must be an object", metadata_item.filename)
                    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                        validation.add_warning("ZIP_METADATA_INVALID", f"Metadata JSON could not be parsed: {exc}", metadata_item.filename)
                primary_item = self._find_primary_data_file(files, metadata_item)
                if primary_item is not None:
                    primary_name = primary_item.filename
                    primary_parsed = self._parse_zip_primary_file(
                        archive=archive,
                        item=primary_item,
                        dataset_type=dataset_type or self._metadata_string(embedded_metadata, "dataset_type", "type"),
                        task_type=task_type or self._metadata_string(embedded_metadata, "task", "task_type"),
                        validation=validation,
                    )
        except zipfile.BadZipFile:
            validation.add_error("ZIP_INVALID", "Uploaded file is not a valid ZIP archive", filename)
            return None, validation

        metadata_item_count = self._metadata_int(embedded_metadata, "item_count", "itemCount", "row_count", "record_count")
        item_count = metadata_item_count if metadata_item_count is not None else primary_parsed.item_count if primary_parsed is not None else len(files)
        metadata_name = self._metadata_string(embedded_metadata, "name", "dataset_name")
        metadata_dataset_type = self._metadata_string(embedded_metadata, "dataset_type", "type")
        metadata_task_type = self._metadata_string(embedded_metadata, "task", "task_type")
        split_info = self._metadata_dict(embedded_metadata, "split_info", "splitInfo", "splits")
        schema_snapshot = primary_parsed.schema_snapshot if primary_parsed is not None else {}
        if "schema" in embedded_metadata and isinstance(embedded_metadata["schema"], dict):
            schema_snapshot = embedded_metadata["schema"]
        elif "schema_snapshot" in embedded_metadata and isinstance(embedded_metadata["schema_snapshot"], dict):
            schema_snapshot = embedded_metadata["schema_snapshot"]
        schema_snapshot = {
            **schema_snapshot,
            "archive": {"files": tree, "truncated": len(files) > len(tree), "primary_file": primary_name},
        }
        statistics = {
            "file_count": len(files),
            "extension_counts": dict(ext_counts),
            **(primary_parsed.statistics if primary_parsed is not None else {}),
        }
        if embedded_metadata:
            statistics["embedded_metadata"] = {"present": True, "keys": sorted(embedded_metadata.keys())}
        preview = {
            "file_name": filename,
            "format": "zip",
            "file_count": len(files),
            "extension_counts": dict(ext_counts),
            "primary_file": primary_name,
            "validation_status": validation.status,
        }
        if primary_parsed is not None:
            preview.update(primary_parsed.preview)
            preview["archive_name"] = filename
            preview["primary_file"] = primary_name
        resolved_dataset_type = metadata_dataset_type or dataset_type or (primary_parsed.dataset_type if primary_parsed is not None else "custom")
        resolved_task_type = metadata_task_type or task_type or (primary_parsed.task_type if primary_parsed is not None else "custom")
        return self._parsed(
            filename=filename,
            format="zip",
            dataset_type=resolved_dataset_type,
            task_type=resolved_task_type,
            size_bytes=size_bytes,
            item_count=item_count,
            statistics=statistics,
            schema_snapshot=schema_snapshot,
            preview=preview,
            split_info=split_info,
            name=metadata_name,
            details={"embedded_metadata": embedded_metadata} if embedded_metadata else {},
        ), validation

    def _parse_parquet(
        self,
        path: Path,
        filename: str,
        size_bytes: int,
        dataset_type: str | None,
        task_type: str | None,
        label_column: str | None,
        validation: ValidationResult,
    ) -> tuple[ParsedDataset | None, ValidationResult]:
        try:
            import pyarrow.parquet as pq  # type: ignore[import-not-found]
        except ImportError:
            validation.add_warning("PARQUET_ENGINE_MISSING", "pyarrow is not installed; only basic Parquet metadata is available", filename)
            return self._parsed(
                filename=filename,
                format="parquet",
                dataset_type=dataset_type or "tabular",
                task_type=task_type or "custom",
                size_bytes=size_bytes,
                item_count=0,
                statistics={"row_count": 0, "column_count": 0},
                schema_snapshot={"columns": []},
                preview={"file_name": filename, "format": "parquet", "row_count": 0, "columns": [], "validation_status": validation.status},
            ), validation
        table = pq.ParquetFile(path)
        schema = table.schema_arrow
        columns = [{"name": field.name, "type": str(field.type), "nullable": field.nullable} for field in schema]
        if label_column and label_column not in {column["name"] for column in columns}:
            validation.add_error("GENERAL_LABEL_COLUMN_NOT_FOUND", f"label_column '{label_column}' does not exist", filename)
        return self._parsed(
            filename=filename,
            format="parquet",
            dataset_type=dataset_type or "tabular",
            task_type=task_type or "custom",
            size_bytes=size_bytes,
            item_count=table.metadata.num_rows if table.metadata else 0,
            statistics={"row_count": table.metadata.num_rows if table.metadata else 0, "column_count": len(columns)},
            schema_snapshot={"columns": columns},
            preview={"file_name": filename, "format": "parquet", "row_count": table.metadata.num_rows if table.metadata else 0, "columns": columns, "validation_status": validation.status},
        ), validation

    @staticmethod
    def _parsed(
        *,
        filename: str,
        format: str,
        dataset_type: str,
        task_type: str,
        size_bytes: int,
        item_count: int,
        statistics: dict[str, Any],
        schema_snapshot: dict[str, Any],
        preview: dict[str, Any],
        split_info: dict[str, Any] | None = None,
        name: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> ParsedDataset:
        return ParsedDataset(
            kind="general",
            format=format,
            dataset_type=dataset_type,
            task_type=task_type,
            name=name or Path(filename).stem or "general-dataset",
            item_count=item_count,
            size_bytes=size_bytes,
            split_info=split_info or {},
            schema_snapshot=schema_snapshot,
            statistics=statistics,
            preview=preview,
            details=details or {},
        )

    @staticmethod
    def _find_metadata_file(files: list[zipfile.ZipInfo]) -> zipfile.ZipInfo | None:
        preferred = {"metadata.json", "dataset.metadata.json", "dataset_metadata.json", "version.metadata.json"}
        for item in files:
            name = Path(item.filename).name.lower()
            if name in preferred:
                return item
        return None

    @staticmethod
    def _find_primary_data_file(files: list[zipfile.ZipInfo], metadata_item: zipfile.ZipInfo | None) -> zipfile.ZipInfo | None:
        supported = {".csv", ".json", ".parquet"}
        candidates = [
            item
            for item in files
            if item != metadata_item and Path(item.filename).suffix.lower() in supported and Path(item.filename).name.lower() not in {"metadata.json", "dataset.metadata.json", "dataset_metadata.json", "version.metadata.json"}
        ]
        if not candidates:
            return None
        return sorted(candidates, key=lambda item: item.file_size, reverse=True)[0]

    def _parse_zip_primary_file(
        self,
        *,
        archive: zipfile.ZipFile,
        item: zipfile.ZipInfo,
        dataset_type: str | None,
        task_type: str | None,
        validation: ValidationResult,
    ) -> ParsedDataset | None:
        suffix = Path(item.filename).suffix.lower()
        if suffix == ".csv":
            return self._parse_zip_csv(archive, item, dataset_type, task_type, validation)
        if suffix == ".json":
            return self._parse_zip_json(archive, item, dataset_type, task_type, validation)
        return None

    def _parse_zip_csv(
        self,
        archive: zipfile.ZipFile,
        item: zipfile.ZipInfo,
        dataset_type: str | None,
        task_type: str | None,
        validation: ValidationResult,
    ) -> ParsedDataset | None:
        try:
            text = archive.read(item).decode("utf-8-sig")
        except UnicodeDecodeError:
            validation.add_warning("ZIP_PRIMARY_CSV_ENCODING_UNSUPPORTED", "CSV inside ZIP must be UTF-8 encoded to infer schema", item.filename)
            return None
        reader = csv.DictReader(io.StringIO(text))
        columns = reader.fieldnames or []
        if not columns:
            validation.add_warning("ZIP_PRIMARY_CSV_MISSING_HEADER", "CSV inside ZIP has no header row", item.filename)
            return None
        samples: list[dict[str, str]] = []
        row_count = 0
        missing = Counter({column: 0 for column in columns})
        for row in reader:
            row_count += 1
            if len(samples) < 500:
                samples.append(row)
            for column in columns:
                if row.get(column) in {None, ""}:
                    missing[column] += 1
        column_schema = [
            {"name": column, "type": self._infer_type([row.get(column, "") for row in samples]), "missing": int(missing[column]), "nullable": missing[column] > 0}
            for column in columns
        ]
        return self._parsed(
            filename=item.filename,
            format="csv",
            dataset_type=dataset_type or "tabular",
            task_type=task_type or "custom",
            size_bytes=item.file_size,
            item_count=row_count,
            statistics={"row_count": row_count, "column_count": len(columns), "missing_values": dict(missing)},
            schema_snapshot={"columns": column_schema},
            preview={"file_name": item.filename, "format": "csv", "row_count": row_count, "column_count": len(columns), "columns": column_schema, "missing_values": dict(missing)},
        )

    def _parse_zip_json(
        self,
        archive: zipfile.ZipFile,
        item: zipfile.ZipInfo,
        dataset_type: str | None,
        task_type: str | None,
        validation: ValidationResult,
    ) -> ParsedDataset | None:
        try:
            payload = json.loads(archive.read(item).decode("utf-8-sig"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            validation.add_warning("ZIP_PRIMARY_JSON_INVALID", f"JSON inside ZIP could not be parsed: {exc}", item.filename)
            return None
        records = payload if isinstance(payload, list) else payload.get("records", []) if isinstance(payload, dict) else []
        if not isinstance(records, list):
            validation.add_warning("ZIP_PRIMARY_JSON_UNSUPPORTED_SHAPE", "JSON inside ZIP must be an array or contain records", item.filename)
            return None
        keys = sorted({key for row in records[:500] if isinstance(row, dict) for key in row.keys()})
        columns = [{"name": key, "type": self._infer_json_type([row.get(key) for row in records[:500] if isinstance(row, dict)]), "nullable": True} for key in keys]
        return self._parsed(
            filename=item.filename,
            format="json",
            dataset_type=dataset_type or "tabular",
            task_type=task_type or "custom",
            size_bytes=item.file_size,
            item_count=len(records),
            statistics={"record_count": len(records), "column_count": len(keys)},
            schema_snapshot={"columns": columns},
            preview={"file_name": item.filename, "format": "json", "record_count": len(records), "columns": columns},
        )

    @staticmethod
    def _metadata_string(payload: dict[str, Any], *keys: str) -> str | None:
        for key in keys:
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _metadata_int(payload: dict[str, Any], *keys: str) -> int | None:
        for key in keys:
            value = payload.get(key)
            if isinstance(value, int) and not isinstance(value, bool):
                return value
        return None

    @staticmethod
    def _metadata_dict(payload: dict[str, Any], *keys: str) -> dict[str, Any]:
        for key in keys:
            value = payload.get(key)
            if isinstance(value, dict):
                return value
        return {}

    @staticmethod
    def _infer_type(values: list[str]) -> str:
        non_empty = [value for value in values if value not in {None, ""}]
        if not non_empty:
            return "string"
        checks = [
            ("boolean", lambda v: str(v).lower() in {"true", "false", "0", "1", "yes", "no"}),
            ("integer", lambda v: int(str(v)) is not None),
            ("float", lambda v: float(str(v)) is not None),
            ("datetime", lambda v: datetime.fromisoformat(str(v).replace("Z", "+00:00")) is not None),
        ]
        for type_name, check in checks:
            try:
                if all(check(value) for value in non_empty[:200]):
                    return type_name
            except (TypeError, ValueError):
                continue
        unique_count = len(set(non_empty))
        if unique_count <= max(20, len(non_empty) // 10):
            return "category"
        return "string"

    @staticmethod
    def _infer_json_type(values: list[Any]) -> str:
        non_null = [value for value in values if value is not None]
        if not non_null:
            return "string"
        if all(isinstance(value, bool) for value in non_null):
            return "boolean"
        if all(isinstance(value, int) and not isinstance(value, bool) for value in non_null):
            return "integer"
        if all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in non_null):
            return "float"
        return "string"
