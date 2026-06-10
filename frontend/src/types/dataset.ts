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
  tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  thumbnail_url?: string;
  storage_path: string;
  version?: string;
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
