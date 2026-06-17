from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.services.dataset_upload_models import ParsedDataset, ValidationResult


class MetadataGenerator:
    def generate(
        self,
        *,
        parsed: ParsedDataset,
        version: str,
        original_filename: str,
        uploaded_by: str,
        storage: dict[str, str],
        validation: ValidationResult,
        description: str | None = None,
        tags: list[str] | None = None,
        label_column: str | None = None,
    ) -> dict[str, Any]:
        base: dict[str, Any] = {
            "schema_version": "1.0",
            "dataset_kind": parsed.kind,
            "name": parsed.name,
            "version": version,
            "dataset_type": parsed.dataset_type,
            "task": parsed.task_type,
            "description": description or "",
            "tags": tags or [],
            "source": {
                "original_filename": original_filename,
                "format": parsed.format,
                "uploaded_by": uploaded_by,
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
            },
            "statistics": parsed.statistics,
            "storage": storage,
            "validation": {
                "status": validation.status,
                "error_count": len(validation.errors),
                "warning_count": len(validation.warnings),
            },
        }
        if parsed.kind == "yolo":
            base["yolo"] = parsed.details
        else:
            base["schema"] = parsed.schema_snapshot
            if label_column:
                base["label_column"] = label_column
        return base

