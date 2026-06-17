from __future__ import annotations

import csv
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
        try:
            with zipfile.ZipFile(path) as archive:
                files = [item for item in archive.infolist() if not item.is_dir()]
                for item in files:
                    parts = Path(item.filename).parts
                    if Path(item.filename).is_absolute() or ".." in parts:
                        validation.add_error("ZIP_UNSAFE_PATH", "ZIP contains an unsafe path", item.filename)
                ext_counts = Counter(Path(item.filename).suffix.lower() or "[no_ext]" for item in files)
                tree = [item.filename for item in files[:200]]
        except zipfile.BadZipFile:
            validation.add_error("ZIP_INVALID", "Uploaded file is not a valid ZIP archive", filename)
            return None, validation
        return self._parsed(
            filename=filename,
            format="zip",
            dataset_type=dataset_type or "custom",
            task_type=task_type or "custom",
            size_bytes=size_bytes,
            item_count=len(files),
            statistics={"file_count": len(files), "extension_counts": dict(ext_counts)},
            schema_snapshot={"files": tree, "truncated": len(files) > len(tree)},
            preview={"file_name": filename, "format": "zip", "file_count": len(files), "extension_counts": dict(ext_counts), "validation_status": validation.status},
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
    ) -> ParsedDataset:
        return ParsedDataset(
            kind="general",
            format=format,
            dataset_type=dataset_type,
            task_type=task_type,
            name=Path(filename).stem or "general-dataset",
            item_count=item_count,
            size_bytes=size_bytes,
            schema_snapshot=schema_snapshot,
            statistics=statistics,
            preview=preview,
            details={},
        )

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

