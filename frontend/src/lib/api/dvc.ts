import { apiClient } from "@/lib/api/client";
import type { PaginatedResponse } from "@/types/api";

export type DvcVersionStatus = "draft" | "validated" | "deprecated";

export interface DvcDatasetVersion {
  id: string;
  dataset_id: string;
  dataset_name?: string;
  version: string;
  dvc_md5: string;
  dvc_commit?: string;
  path?: string;
  storage_path?: string;
  storage_uri?: string;
  size_bytes?: number;
  item_count?: number;
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

export async function getDatasetVersions(params: DvcDatasetVersionListParams = {}): Promise<PaginatedResponse<DvcDatasetVersion>> {
  const { dataset_name: datasetId, ...query } = params;
  if (!datasetId) {
    return { items: [], total: 0, page: 1, pageSize: params.limit ?? 100 };
  }
  const response = await apiClient.get<PaginatedResponse<DvcDatasetVersion>>(`/datasets/${datasetId}/versions`, { params: query });
  return response.data;
}

export async function getDatasetVersionById(datasetId: string, versionId: string): Promise<DvcDatasetVersion> {
  const response = await apiClient.get<DvcDatasetVersion>(`/datasets/${datasetId}/versions/${versionId}`);
  return response.data;
}

export async function createDatasetVersion(datasetId: string, payload: {
  version: string;
  dvc_md5?: string;
  dvc_commit?: string;
  path?: string;
  local_path?: string;
  commit_message?: string;
  changelog?: string;
  note?: string;
}): Promise<DvcDatasetVersion> {
  const response = await apiClient.post<DvcDatasetVersion>(`/datasets/${datasetId}/versions`, payload);
  return response.data;
}

export async function updateDatasetVersionStatus(datasetId: string, versionId: string, status: DvcVersionStatus): Promise<DvcDatasetVersion> {
  const response = await apiClient.patch<DvcDatasetVersion>(`/datasets/${datasetId}/versions/${versionId}`, { status });
  return response.data;
}

export async function validateDatasetVersion(datasetId: string, versionId: string) {
  const response = await apiClient.post(`/datasets/${datasetId}/versions/${versionId}/validate`);
  return response.data as { is_valid: boolean; checked_at: string; details: Record<string, unknown> };
}

export async function diffDatasetVersions(datasetId: string, versionA: string, versionB: string) {
  const response = await apiClient.get(`/datasets/${datasetId}/diff`, {
    params: { version_a: versionA, version_b: versionB }
  });
  return response.data;
}
