from __future__ import annotations

from pathlib import Path

from app.services.dataset_upload_models import ParsedDataset, ValidationResult
from app.services.parsers.yolo_dataset_parser import IMAGE_EXTENSIONS


class YoloDatasetValidator:
    def validate(self, *, root: Path, parsed: ParsedDataset, validation: ValidationResult) -> ValidationResult:
        data_yaml = self._find_data_yaml(root)
        if data_yaml is None:
            validation.add_error("YOLO_MISSING_DATA_YAML", "data.yaml is required at dataset root", "data.yaml")
            return validation
        dataset_root = data_yaml.parent
        classes = {item["id"] for item in parsed.details.get("classes", [])}

        required_dirs = ["images/train", "images/val", "labels/train", "labels/val"]
        for rel in required_dirs:
            if not (dataset_root / rel).is_dir():
                validation.add_error("YOLO_MISSING_REQUIRED_DIR", f"Missing required directory: {rel}", rel)

        for split in ["train", "val", "test"]:
            image_dir = dataset_root / "images" / split
            label_dir = dataset_root / "labels" / split
            if not image_dir.exists() and not label_dir.exists():
                continue
            images = {p.stem: p for p in image_dir.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS} if image_dir.exists() else {}
            labels = {p.stem: p for p in label_dir.glob("*.txt")} if label_dir.exists() else {}
            for stem, path in images.items():
                if stem not in labels:
                    validation.add_warning("YOLO_IMAGE_WITHOUT_LABEL", "Image has no matching label file", str(path.relative_to(dataset_root)))
            for stem, path in labels.items():
                if stem not in images:
                    validation.add_warning("YOLO_LABEL_WITHOUT_IMAGE", "Label file has no matching image", str(path.relative_to(dataset_root)))
                self._validate_label_file(path, dataset_root, classes, validation)

        parsed.preview["validation_status"] = validation.status
        return validation

    @staticmethod
    def _find_data_yaml(root: Path) -> Path | None:
        direct = root / "data.yaml"
        if direct.exists():
            return direct
        matches = list(root.glob("*/data.yaml"))
        return matches[0] if len(matches) == 1 else None

    @staticmethod
    def _validate_label_file(path: Path, dataset_root: Path, classes: set[int], validation: ValidationResult) -> None:
        rel = str(path.relative_to(dataset_root))
        for line_no, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), start=1):
            if not line.strip():
                continue
            parts = line.split()
            if len(parts) != 5:
                validation.add_error("YOLO_INVALID_LABEL_FORMAT", "Label line must be: class_id x_center y_center width height", rel, line_no)
                continue
            try:
                class_id = int(parts[0])
            except ValueError:
                validation.add_error("YOLO_INVALID_CLASS_ID", "class_id must be an integer", rel, line_no)
                continue
            if class_id not in classes:
                validation.add_error("YOLO_UNKNOWN_CLASS_ID", f"class_id {class_id} is not defined in data.yaml names", rel, line_no)
            for value in parts[1:]:
                try:
                    parsed_value = float(value)
                except ValueError:
                    validation.add_error("YOLO_INVALID_BBOX_VALUE", "bbox values must be numeric", rel, line_no)
                    continue
                if parsed_value < 0 or parsed_value > 1:
                    validation.add_error("YOLO_BBOX_OUT_OF_RANGE", "bbox values must be between 0 and 1", rel, line_no)

