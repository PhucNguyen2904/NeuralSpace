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
    def validate(self, names: set[str], filename: str) -> list[dict]:
        errors = []
        if not self._check_weights(names):
            errors.append(self._issue("YOLO_WEIGHT_MISSING", "Detection package must include weights/best.pt or weights/last.pt.", "error", filename))
        return errors


class YoloClassificationValidator(BaseYoloValidator):
    def validate(self, names: set[str], filename: str) -> list[dict]:
        errors = []
        if not self._check_weights(names):
            errors.append(self._issue("YOLO_WEIGHT_MISSING", "Classification package must include weights/best.pt or weights/last.pt.", "error", filename))
        
        has_metrics = any(name.endswith("reports/metrics.json") for name in names) or "reports/metrics.json" in names
        has_results = any(name.endswith("reports/results.csv") for name in names) or "reports/results.csv" in names or any(name.endswith("results.csv") for name in names) or "results.csv" in names

        if not (has_metrics or has_results):
            errors.append(self._issue("YOLO_METRICS_MISSING", "Classification package must include reports/metrics.json or results.csv.", "error", filename))
        
        return errors


class YoloSegmentationValidator(BaseYoloValidator):
    def validate(self, names: set[str], filename: str) -> list[dict]:
        errors = []
        if not self._check_weights(names):
            errors.append(self._issue("YOLO_WEIGHT_MISSING", "Segmentation package must include weights/best.pt or weights/last.pt.", "error", filename))
        return errors


class YoloPoseValidator(BaseYoloValidator):
    def validate(self, names: set[str], filename: str) -> list[dict]:
        errors = []
        if not self._check_weights(names):
            errors.append(self._issue("YOLO_WEIGHT_MISSING", "Pose package must include weights/best.pt or weights/last.pt.", "error", filename))
        return errors


def get_validator(yolo_type: str) -> BaseYoloValidator:
    if yolo_type == "classification":
        return YoloClassificationValidator()
    elif yolo_type == "segmentation":
        return YoloSegmentationValidator()
    elif yolo_type == "pose":
        return YoloPoseValidator()
    return YoloDetectionValidator()  # Default to detection
