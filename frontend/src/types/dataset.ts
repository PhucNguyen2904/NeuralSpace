export type DatasetType = "image" | "text" | "tabular" | "audio" | "video";
export type LabelStatus = "labeled" | "unlabeled" | "processing";

export interface Dataset {
  id: string;
  name: string;
  description: string;
  type: DatasetType;
  label_status: LabelStatus;
  size_bytes: number;
  item_count: number;
  class_count?: number;
  custom_metadata?: Record<string, string>;
  tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  thumbnail_url?: string;
  storage_path: string;
  version?: string;
}

export interface DatasetUploadIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
  path?: string;
  line?: number;
}

export interface DatasetUploadPreview {
  classes?: string[];
  splits?: Record<string, { images?: number; labels?: number; annotations?: number }>;
  class_distribution?: Record<string, number>;
  validation_status?: string;
  file_name?: string;
  format?: string;
  row_count?: number;
  record_count?: number;
  file_count?: number;
  column_count?: number;
  columns?: Array<{ name: string; type: string; missing?: number; nullable?: boolean }>;
  missing_values?: Record<string, number>;
  extension_counts?: Record<string, number>;
}

export interface DatasetUploadResponse {
  dataset: {
    id: string;
    name: string;
    description: string;
    type: DatasetType | "custom";
    task: string;
    tags: string[];
    storage_path: string;
  };
  version: {
    id: string;
    dataset_id: string;
    version: string;
    status: string;
    storage_path: string;
    metadata_uri?: string;
    validation_report_uri?: string;
    validation_status?: string;
  };
  preview: DatasetUploadPreview;
  validation_report: {
    status: string;
    summary: { error_count: number; warning_count: number };
    errors: DatasetUploadIssue[];
    warnings: DatasetUploadIssue[];
  };
}

export interface ColumnInfo {
  name: string;
  type: "numeric" | "text" | "date";
}

export interface DatasetSample {
  id: string;
  content: string;
  thumbnail_url?: string;
}

export interface DatasetPreview {
  samples: DatasetSample[];
  class_distribution?: Record<string, number>;
  split_info?: { train: number; val: number; test: number };
  column_info?: ColumnInfo[];
}

export interface WorkspaceDatasetMountResponse {
  workspace_id: string;
  dataset_id: string;
  dataset_name: string;
  mount_path?: string;
  mounted_path: string;
  mount_status: "mounted";
  message: string;
}

export interface UpdateDatasetPayload {
  description?: string;
  tags?: string[];
  label_status?: LabelStatus;
  class_count?: number | null;
  custom_metadata?: Record<string, string>;
}

export interface DatasetListParams {
  search?: string;
  type?: DatasetType[];
  status?: LabelStatus;
  size_min?: number;
  size_max?: number;
  tags?: string[];
  created_after?: string;
  sort?: "newest" | "oldest" | "name" | "size";
  page?: number;
  limit?: number;
}

export interface DatasetFilters {
  search: string;
  types: DatasetType[];
  status: "all" | LabelStatus;
  sizeMin: number;
  sizeMax: number;
  createdWithin: "all" | "today" | "7d" | "30d" | "3m";
  tags: string[];
  sort: "newest" | "oldest" | "name" | "size";
  view: "grid" | "list";
}
