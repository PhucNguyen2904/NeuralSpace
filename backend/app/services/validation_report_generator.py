from __future__ import annotations

from app.services.dataset_upload_models import ValidationResult


class ValidationReportGenerator:
    def generate(self, validation: ValidationResult) -> dict:
        return validation.to_report()

