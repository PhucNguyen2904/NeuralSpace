export type ModelFramework = "pytorch" | "tensorflow" | "onnx" | "huggingface" | "sklearn";
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
