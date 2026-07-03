export type ModelFramework = "pytorch" | "tensorflow" | "onnx" | "huggingface" | "sklearn" | "ultralytics";
export type TaskType =
  | "image_classification"
  | "object_detection"
  | "semantic_segmentation"
  | "text_classification"
  | "text_generation"
  | "regression";
export type ModelStatus = "ready" | "training" | "trained" | "failed";

export interface Model {
  id: string;
  name: string;
  description: string;
  architecture: string;
  framework: ModelFramework;
  task_type: TaskType;
  status: ModelStatus;
  size_bytes: number;
  parameter_count: number;
  primary_metric_name: string;
  primary_metric_value: number;
  all_metrics: Record<string, number>;
  tags: string[];
  custom_metadata?: Record<string, string>;
  dataset_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  training_duration_seconds?: number;
  version: string;
  storage_path: string;
}

export interface ModelMetrics {
  training_history: {
    epoch: number;
    train_loss: number;
    val_loss: number;
    train_accuracy?: number;
    val_accuracy?: number;
  }[];
  confusion_matrix?: number[][];
  class_names?: string[];
  final_metrics: Record<string, number>;
}

export interface ModelVersion {
  id: string;
  version: string;
  note: string;
  created_at: string;
  created_by?: string;
  current?: boolean;
}

export interface ModelDetail extends Model {
  framework_version: string;
  input_shape: string;
  output_shape: string;
  files: { name: string; size: string; type: string }[];
}

export interface ModelListParams {
  search?: string;
  framework?: ModelFramework[];
  task_type?: TaskType[];
  status?: ModelStatus;
  min_metric?: number;
  size_category?: "small" | "medium" | "large";
  sort?: "newest" | "oldest" | "name" | "accuracy";
  page?: number;
  limit?: number;
}

export interface UpdateModelPayload {
  description?: string;
  architecture?: string;
  framework?: ModelFramework;
  task_type?: TaskType;
  tags?: string[];
  status?: ModelStatus;
  parameter_count?: number;
  primary_metric_name?: string;
  primary_metric_value?: number;
  metrics?: Record<string, number>;
  all_metrics?: Record<string, number>;
  framework_version?: string;
  input_shape?: string;
  output_shape?: string;
  dataset_id?: string;
  training_duration_seconds?: number;
  custom_metadata?: Record<string, string>;
}

export interface UploadModelVersionMetadata {
  version?: string;
  changelog?: string;
  framework_version?: string;
  input_shape?: string;
  output_shape?: string;
  primary_metric_name?: string;
  primary_metric_value?: number;
  metrics?: Record<string, number>;
  branch?: string;
  git_commit?: string;
  commit?: string;
}

export interface ModelInspectIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
  path?: string;
}

export interface ModelInspectResponse {
  form: {
    name: string;
    version: string;
    description: string;
    architecture: string;
    framework: string;
    task: string;
    tags: string[];
  };
  metadata: {
    name: string;
    format: string;
    framework: string;
    task_type: string;
    size_bytes: number;
    architecture?: string;
    has_weights?: boolean;
    has_onnx?: boolean;
    primary_metric_name?: string;
    primary_metric_value?: number;
    all_metrics?: Record<string, number>;
  };
  validation_report: {
    status: string;
    summary: { error_count: number; warning_count: number };
    errors: ModelInspectIssue[];
    warnings: ModelInspectIssue[];
  };
}

export interface ModelFilters {
  search: string;
  frameworks: ModelFramework[];
  taskTypes: TaskType[];
  status: "all" | ModelStatus;
  minMetric?: number;
  sizeCategory: "all" | "small" | "medium" | "large";
  sort: "newest" | "oldest" | "name" | "accuracy";
  view: "grid" | "list";
}
