from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal


ValidationSeverity = Literal["error", "warning"]
ValidationStatus = Literal["passed", "warning", "failed"]


@dataclass(slots=True)
class ValidationIssue:
    code: str
    message: str
    severity: ValidationSeverity
    path: str | None = None
    line: int | None = None

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "code": self.code,
            "message": self.message,
            "severity": self.severity,
        }
        if self.path:
            payload["path"] = self.path
        if self.line is not None:
            payload["line"] = self.line
        return payload


@dataclass(slots=True)
class ValidationResult:
    status: ValidationStatus = "passed"
    errors: list[ValidationIssue] = field(default_factory=list)
    warnings: list[ValidationIssue] = field(default_factory=list)

    def add_error(self, code: str, message: str, path: str | None = None, line: int | None = None) -> None:
        self.errors.append(ValidationIssue(code=code, message=message, severity="error", path=path, line=line))
        self.status = "failed"

    def add_warning(self, code: str, message: str, path: str | None = None, line: int | None = None) -> None:
        self.warnings.append(ValidationIssue(code=code, message=message, severity="warning", path=path, line=line))
        if self.status == "passed":
            self.status = "warning"

    def to_report(self) -> dict[str, Any]:
        return {
            "schema_version": "1.0",
            "status": self.status,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "error_count": len(self.errors),
                "warning_count": len(self.warnings),
            },
            "errors": [item.to_dict() for item in self.errors],
            "warnings": [item.to_dict() for item in self.warnings],
        }


@dataclass(slots=True)
class ParsedDataset:
    kind: Literal["yolo", "general"]
    format: str
    dataset_type: str
    task_type: str
    name: str
    item_count: int
    size_bytes: int
    split_info: dict[str, Any] = field(default_factory=dict)
    schema_snapshot: dict[str, Any] = field(default_factory=dict)
    statistics: dict[str, Any] = field(default_factory=dict)
    preview: dict[str, Any] = field(default_factory=dict)
    details: dict[str, Any] = field(default_factory=dict)

