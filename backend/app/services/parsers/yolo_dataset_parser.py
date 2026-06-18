from __future__ import annotations

import zipfile
from pathlib import Path
from typing import Any

import yaml

from app.services.dataset_upload_models import ParsedDataset, ValidationResult


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
MAX_ZIP_FILES = 50_000
MAX_EXTRACTED_BYTES = 20 * 1024 * 1024 * 1024


class YoloDatasetParser:
    def parse(self, *, root: Path, filename: str, size_bytes: int) -> tuple[ParsedDataset | None, ValidationResult]:
        validation = ValidationResult()
        data_yaml = self._find_data_yaml(root)
        if data_yaml is None:
            validation.add_error("YOLO_MISSING_DATA_YAML", "data.yaml is required at dataset root", "data.yaml")
            return None, validation

        dataset_root = data_yaml.parent
        try:
            config = yaml.safe_load(data_yaml.read_text(encoding="utf-8")) or {}
        except Exception as exc:
            validation.add_error("YOLO_INVALID_DATA_YAML", f"data.yaml could not be parsed: {exc}", str(data_yaml.relative_to(root)))
            return None, validation

        if not isinstance(config, dict):
            validation.add_error("YOLO_INVALID_DATA_YAML", "data.yaml must contain a YAML object", str(data_yaml.relative_to(root)))
            return None, validation
        for field in ["path", "train", "val", "names"]:
            if field not in config:
                validation.add_error("YOLO_MISSING_DATA_YAML_FIELD", f"data.yaml must define '{field}'", str(data_yaml.relative_to(root)))

        names = self._normalize_names(config.get("names"), validation)
        split_paths = {
            "train": str(config.get("train") or "images/train"),
            "val": str(config.get("val") or "images/val"),
        }
        if config.get("test"):
            split_paths["test"] = str(config["test"])

        splits: dict[str, dict[str, Any]] = {}
        class_distribution = {name: 0 for name in names.values()}
        annotation_count = 0
        image_count = 0
        label_file_count = 0

        for split, image_rel in split_paths.items():
            image_dir = (dataset_root / image_rel).resolve()
            label_dir = (dataset_root / image_rel.replace("images", "labels", 1)).resolve()
            images = sorted([p for p in image_dir.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS]) if image_dir.exists() else []
            labels = sorted(label_dir.glob("*.txt")) if label_dir.exists() else []
            split_annotations = 0
            for label_path in labels:
                for line in label_path.read_text(encoding="utf-8", errors="replace").splitlines():
                    if not line.strip():
                        continue
                    parts = line.split()
                    if len(parts) < 1:
                        continue
                    try:
                        class_id = int(parts[0])
                    except ValueError:
                        continue
                    class_name = names.get(class_id)
                    if class_name is not None:
                        class_distribution[class_name] = class_distribution.get(class_name, 0) + 1
                    split_annotations += 1
            splits[split] = {
                "images": len(images),
                "labels": len(labels),
                "annotations": split_annotations,
            }
            if split in {"train", "val"} and len(images) == 0:
                validation.add_error("YOLO_EMPTY_REQUIRED_SPLIT", f"{split} split must contain at least one image", f"images/{split}")
            image_count += len(images)
            label_file_count += len(labels)
            annotation_count += split_annotations

        dataset_name = Path(filename).stem or "yolo-dataset"
        details = {
            "data_yaml": config,
            "classes": [{"id": class_id, "name": name} for class_id, name in names.items()],
            "splits": splits,
            "class_distribution": class_distribution,
        }
        parsed = ParsedDataset(
            kind="yolo",
            format="yolo",
            dataset_type="image",
            task_type="object_detection",
            name=dataset_name,
            item_count=image_count,
            size_bytes=size_bytes,
            split_info=splits,
            schema_snapshot={"classes": details["classes"]},
            statistics={
                "image_count": image_count,
                "label_file_count": label_file_count,
                "annotation_count": annotation_count,
                "class_count": len(names),
            },
            preview={
                "classes": list(names.values()),
                "splits": splits,
                "class_distribution": class_distribution,
                "validation_status": validation.status,
            },
            details=details,
        )
        return parsed, validation

    @staticmethod
    def _find_data_yaml(root: Path) -> Path | None:
        direct = root / "data.yaml"
        if direct.exists():
            return direct
        matches = list(root.glob("*/data.yaml"))
        return matches[0] if len(matches) == 1 else None

    @staticmethod
    def _normalize_names(raw: Any, validation: ValidationResult) -> dict[int, str]:
        if isinstance(raw, list):
            names = {index: str(name) for index, name in enumerate(raw)}
            YoloDatasetParser._warn_duplicate_names(names, validation)
            return names
        if isinstance(raw, dict):
            names: dict[int, str] = {}
            for key, value in raw.items():
                try:
                    names[int(key)] = str(value)
                except (TypeError, ValueError):
                    validation.add_error("YOLO_INVALID_CLASS_KEY", f"Invalid class id in names: {key}", "data.yaml")
            names = dict(sorted(names.items()))
            YoloDatasetParser._warn_duplicate_names(names, validation)
            return names
        validation.add_error("YOLO_MISSING_NAMES", "data.yaml must define names as a list or id-to-name map", "data.yaml")
        return {}

    @staticmethod
    def _warn_duplicate_names(names: dict[int, str], validation: ValidationResult) -> None:
        seen: set[str] = set()
        duplicates: set[str] = set()
        for name in names.values():
            token = name.strip()
            if token in seen:
                duplicates.add(token)
            seen.add(token)
        for name in sorted(duplicates):
            validation.add_warning("YOLO_DUPLICATE_CLASS_NAME", f"Duplicate class name: {name}", "data.yaml")


def extract_zip_safely(zip_path: Path, target_dir: Path) -> ValidationResult:
    validation = ValidationResult()
    try:
        with zipfile.ZipFile(zip_path) as archive:
            members = archive.infolist()
            if len(members) > MAX_ZIP_FILES:
                validation.add_error("ZIP_TOO_MANY_FILES", f"ZIP contains too many files: {len(members)}", zip_path.name)
                return validation
            total_size = sum(max(member.file_size, 0) for member in members)
            if total_size > MAX_EXTRACTED_BYTES:
                validation.add_error("ZIP_TOO_LARGE_EXTRACTED", "ZIP extracted size exceeds the configured limit", zip_path.name)
                return validation
            for member in members:
                member_path = Path(member.filename)
                if member_path.is_absolute() or ".." in member_path.parts:
                    validation.add_error("ZIP_UNSAFE_PATH", "ZIP contains an unsafe path", member.filename)
                    continue
                archive.extract(member, target_dir)
    except zipfile.BadZipFile:
        validation.add_error("ZIP_INVALID", "Uploaded file is not a valid ZIP archive", zip_path.name)
    return validation
