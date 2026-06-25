from abc import ABC, abstractmethod


class BaseYoloValidator(ABC):
    @abstractmethod
    def validate(self, names: set[str], filename: str) -> list[dict]:
        """Validate the YOLO package structure based on type. Returns a list of error dictionaries."""
        pass

    def _issue(self, code: str, message: str, severity: str, path: str = None) -> dict:
        return {"code": code, "message": message, "severity": severity, "path": path}

    def _check_weights(self, names: set[str]) -> bool:
        return any(name.endswith("/weights/best.pt") for name in names) or \
               "weights/best.pt" in names or \
               any(name.endswith("/weights/last.pt") for name in names) or \
               "weights/last.pt" in names


class YoloDetectionValidator(BaseYoloValidator):
    # File/directory name fragments that are exclusive to pose packages
    _POSE_MARKERS = ("pose_labels", "keypoints", "skeleton", "kps_", "_kpts", "pose_pred", "val_pose")

    def validate(self, names: set[str], filename: str) -> list[dict]:
        errors = []
        if not self._check_weights(names):
            errors.append(self._issue("YOLO_WEIGHT_MISSING", "Detection package must include weights/best.pt or weights/last.pt.", "error", filename))

        # Reject clear segmentation markers
        if any("masks/" in name for name in names):
            errors.append(self._issue("YOLO_STRUCTURE_MISMATCH", "Detection package should not contain masks/ (looks like Segmentation).", "error", filename))
        # Reject clear classification markers
        if any("class_preds" in name for name in names):
            errors.append(self._issue("YOLO_STRUCTURE_MISMATCH", "Detection package should not contain class_preds.jpg (looks like Classification).", "error", filename))
        # Reject pose-specific markers
        pose_hit = next(
            (name for name in names if any(marker in name.lower() for marker in self._POSE_MARKERS)),
            None,
        )
        if pose_hit:
            errors.append(self._issue(
                "YOLO_STRUCTURE_MISMATCH",
                f"Detection package should not contain pose-specific artifacts ('{pose_hit}'). Upload as Pose instead.",
                "error",
                filename,
            ))

        return errors


class YoloClassificationValidator(BaseYoloValidator):
    def validate(self, names: set[str], filename: str) -> list[dict]:
        errors = []
        if not self._check_weights(names):
            errors.append(self._issue("YOLO_WEIGHT_MISSING", "Classification package must include weights/best.pt or weights/last.pt.", "error", filename))
        
        has_metrics_json = any(name.endswith("metrics.json") for name in names)
        has_class_preds = any("class_preds" in name for name in names)

        # Classification MUST have one of its unique artifacts to distinguish from minimal detection zips
        if not (has_metrics_json or has_class_preds):
            errors.append(self._issue("YOLO_CLASSIFICATION_MISSING", "Classification package must strictly include 'metrics.json' or 'class_preds.jpg' according to the template.", "error", filename))
        
        has_masks = any(name.startswith("masks/") or "/masks/" in name for name in names)
        if has_masks:
            errors.append(self._issue("YOLO_STRUCTURE_MISMATCH", "Classification package should not contain masks/ (looks like Segmentation).", "error", filename))
            
        has_detection_samples = any("val_batch" in name and "pred" in name for name in names)
        if has_detection_samples:
            errors.append(self._issue("YOLO_STRUCTURE_MISMATCH", "Classification package should not contain detection prediction samples (val_batch*_pred.jpg).", "error", filename))
            
        return errors


class YoloSegmentationValidator(BaseYoloValidator):
    def validate(self, names: set[str], filename: str) -> list[dict]:
        errors = []
        if not self._check_weights(names):
            errors.append(self._issue("YOLO_WEIGHT_MISSING", "Segmentation package must include weights/best.pt or weights/last.pt.", "error", filename))
        
        # Segmentation MUST have masks to distinguish from minimal detection zips
        has_masks = any(name.startswith("masks/") or "/masks/" in name for name in names)
        if not has_masks:
            errors.append(self._issue("YOLO_MASKS_MISSING", "Segmentation package must strictly include a 'masks/' directory according to the template.", "error", filename))
            
        if any("class_preds" in name for name in names):
            errors.append(self._issue("YOLO_STRUCTURE_MISMATCH", "Segmentation package should not contain class_preds.jpg.", "error", filename))
            
        return errors


class YoloPoseValidator(BaseYoloValidator):
    def validate(self, names: set[str], filename: str) -> list[dict]:
        errors = []
        if not self._check_weights(names):
            errors.append(self._issue("YOLO_WEIGHT_MISSING", "Pose package must include weights/best.pt or weights/last.pt.", "error", filename))

        # Pose doesn't have a very unique file in the template (just results.csv),
        # so we ensure it doesn't have things from other task types.
        if any("masks/" in name for name in names):
            errors.append(self._issue("YOLO_STRUCTURE_MISMATCH", "Pose package should not contain masks/ (looks like Segmentation).", "error", filename))
        if any("metrics.json" in name for name in names):
            errors.append(self._issue("YOLO_STRUCTURE_MISMATCH", "Pose package should not contain metrics.json (looks like Classification).", "error", filename))
        if any("class_preds" in name for name in names):
            errors.append(self._issue("YOLO_STRUCTURE_MISMATCH", "Pose package should not contain class_preds.jpg (looks like Classification).", "error", filename))
        # Reject detection-only prediction samples that are not produced by pose
        if any("val_batch" in name and "pred" in name and "pose" not in name.lower() for name in names):
            errors.append(self._issue(
                "YOLO_STRUCTURE_MISMATCH",
                "Pose package should not contain detection prediction samples (val_batch*_pred.jpg). Upload as Detection instead.",
                "error",
                filename,
            ))

        return errors


def get_validator(yolo_type: str) -> BaseYoloValidator:
    if yolo_type == "classification":
        return YoloClassificationValidator()
    elif yolo_type == "segmentation":
        return YoloSegmentationValidator()
    elif yolo_type == "pose":
        return YoloPoseValidator()
    return YoloDetectionValidator()  # Default to detection
