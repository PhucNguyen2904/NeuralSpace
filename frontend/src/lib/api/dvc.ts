import { apiClient } from "@/lib/api/client";
import type { PaginatedResponse } from "@/types/api";

export type DvcVersionStatus = "draft" | "validated" | "deprecated";

export interface DvcProfile {
  id: string;
  name: string;
  scope: "global" | "team" | "user" | "workspace";
  scope_id?: string | null;
  repo_mode: "managed_git" | "existing_path";
  git_repo_url?: string | null;
  git_branch: string;
  repo_path: string;
  remote_name: string;
  remote_url?: string | null;
  endpoint_url?: string | null;
  is_default: boolean;
  status: "ready" | "inactive" | "error";
  status_message?: string | null;
  is_environment_default?: boolean;
}

export interface DvcProfileCreatePayload {
  name: string;
  scope: "global" | "team" | "user" | "workspace";
  scope_id?: string;
  repo_mode?: "managed_git" | "existing_path";
  git_repo_url?: string;
  git_branch?: string;
  repo_path?: string;
  remote_name?: string;
  remote_url?: string;
  endpoint_url?: string;
  is_default?: boolean;
}

export interface DvcDatasetVersion {
  id: string;
  dataset_id: string;
  dataset_name?: string;
  version: string;
  dvc_md5: string;
  dvc_commit?: string;
  dvc_profile_id?: string | null;
  path?: string;
  storage_path?: string;
  storage_uri?: string;
  size_bytes?: number;
  item_count?: number;
  split_info?: Record<string, unknown>;
  schema_snapshot?: Record<string, unknown>;
  metadata_uri?: string;
  validation_report_uri?: string;
  validation_status?: string;
  validation_summary?: Record<string, unknown>;
  metadata_snapshot?: Record<string, unknown>;
  format?: string;
  task_type?: string;
  is_latest?: boolean;
  status: DvcVersionStatus;
  created_at: string;
  created_by?: string;
  changelog?: string;
  note?: string;
  linked_models?: Array<{ id: string; name: string; version?: string; stage?: string; status?: string }>;
}

export interface DvcDatasetVersionListParams {
  dataset_name?: string;
  status?: DvcVersionStatus;
  page?: number;
  limit?: number;
}

export async function getDatasetVersions(
  params: DvcDatasetVersionListParams = {}
): Promise<PaginatedResponse<DvcDatasetVersion>> {
  const { dataset_name: datasetId, ...query } = params;
  if (!datasetId) {
    return { items: [], total: 0, page: 1, pageSize: params.limit ?? 100 };
  }
  const response = await apiClient.get<PaginatedResponse<DvcDatasetVersion>>(
    `/datasets/${datasetId}/versions`,
    { params: query }
  );
  return response.data;
}

export async function getDatasetVersionById(
  datasetId: string,
  versionId: string
): Promise<DvcDatasetVersion> {
  const response = await apiClient.get<DvcDatasetVersion>(
    `/datasets/${datasetId}/versions/${versionId}`
  );
  return response.data;
}

export async function createDatasetVersion(
  datasetId: string,
  payload: {
    version: string;
    dvc_md5?: string;
    dvc_commit?: string;
    path?: string;
    local_path?: string;
    commit_message?: string;
    changelog?: string;
    note?: string;
  }
): Promise<DvcDatasetVersion> {
  const response = await apiClient.post<DvcDatasetVersion>(
    `/datasets/${datasetId}/versions`,
    payload
  );
  return response.data;
}

// ─── New: Upload-and-Track ────────────────────────────────────────────────────

export interface TrackVersionPayload {
  file: File;
  version?: string;
  commitMessage: string;
  changelog?: string;
  itemCount?: number;
  status?: DvcVersionStatus;
  dvcProfileId?: string;
  splitInfo?: Record<string, number>;
  schemaSnapshot?: Record<string, unknown>;
  onUploadProgress?: (percent: number) => void;
}

/**
 * Upload a new dataset file and create a new DatasetVersion via DVC.
 * Calls  POST /api/v1/datasets/{id}/versions/track  (multipart/form-data).
 */
export async function trackDatasetVersion(
  datasetId: string,
  payload: TrackVersionPayload
): Promise<DvcDatasetVersion> {
  const form = new FormData();
  form.append("file", payload.file);
  if (payload.version?.trim()) {
    form.append("version", payload.version.trim());
  }
  form.append("commit_message", payload.commitMessage);
  form.append("changelog", payload.changelog ?? "");
  form.append("item_count", String(payload.itemCount ?? 0));
  form.append("status", payload.status ?? "draft");
  if (payload.dvcProfileId) {
    form.append("dvc_profile_id", payload.dvcProfileId);
  }
  if (payload.splitInfo) {
    form.append("split_info", JSON.stringify(payload.splitInfo));
  }
  if (payload.schemaSnapshot) {
    form.append("schema_snapshot", JSON.stringify(payload.schemaSnapshot));
  }

  const response = await apiClient.post<DvcDatasetVersion>(
    `/datasets/${datasetId}/versions/track`,
    form,
    {
      timeout: 300_000, // 5 min – DVC push can be slow
      onUploadProgress: (evt) => {
        if (payload.onUploadProgress && evt.total) {
          payload.onUploadProgress(Math.round((evt.loaded * 100) / evt.total));
        }
      },
    }
  );
  return response.data;
}

export async function getDvcProfiles(): Promise<DvcProfile[]> {
  const response = await apiClient.get<{ items: DvcProfile[] }>("/dvc/profiles");
  return response.data.items;
}

export async function createDvcProfile(payload: DvcProfileCreatePayload): Promise<DvcProfile> {
  const response = await apiClient.post<DvcProfile>("/dvc/profiles", payload);
  return response.data;
}

export async function updateDvcProfile(
  profileId: string,
  payload: { name?: string; status?: "ready" | "inactive"; is_default?: boolean }
): Promise<DvcProfile> {
  const response = await apiClient.patch<DvcProfile>(`/dvc/profiles/${profileId}`, payload);
  return response.data;
}

export async function deleteDvcProfile(profileId: string, deleteFiles: boolean = false): Promise<void> {
  await apiClient.delete(`/dvc/profiles/${profileId}`, {
    params: { delete_files: deleteFiles }
  });
}

// ─── Existing helpers ─────────────────────────────────────────────────────────

export async function updateDatasetVersionStatus(
  datasetId: string,
  versionId: string,
  status: DvcVersionStatus
): Promise<DvcDatasetVersion> {
  const response = await apiClient.patch<DvcDatasetVersion>(
    `/datasets/${datasetId}/versions/${versionId}`,
    { status }
  );
  return response.data;
}

export async function validateDatasetVersion(datasetId: string, versionId: string) {
  const response = await apiClient.post(
    `/datasets/${datasetId}/versions/${versionId}/validate`
  );
  return response.data as {
    is_valid: boolean;
    checked_at: string;
    details: Record<string, unknown>;
  };
}

export async function diffDatasetVersions(
  datasetId: string,
  versionA: string,
  versionB: string
) {
  const response = await apiClient.get(`/datasets/${datasetId}/diff`, {
    params: { version_a: versionA, version_b: versionB },
  });
  return response.data;
}
