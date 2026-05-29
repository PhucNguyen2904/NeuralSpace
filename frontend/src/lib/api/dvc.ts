import { apiClient } from "@/lib/api/client";
import type { PaginatedResponse } from "@/types/api";

export type DvcVersionStatus = "draft" | "validated" | "deprecated";

export interface DvcDatasetVersion {
  id: string;
  dataset_name: string;
  version: string;
  dvc_md5: string;
  path?: string;
  size_bytes?: number;
  status: DvcVersionStatus;
  created_at: string;
  created_by?: string;
  note?: string;
}

export interface DvcDatasetVersionListParams {
  dataset_name?: string;
  status?: DvcVersionStatus;
  page?: number;
  limit?: number;
}

export async function getDatasetVersions(params: DvcDatasetVersionListParams = {}): Promise<PaginatedResponse<DvcDatasetVersion>> {
  const response = await apiClient.get<PaginatedResponse<DvcDatasetVersion>>("/dvc/versions", { params });
  return response.data;
}

export async function getDatasetVersionById(versionId: string): Promise<DvcDatasetVersion> {
  const response = await apiClient.get<DvcDatasetVersion>(`/dvc/versions/${versionId}`);
  return response.data;
}

export async function createDatasetVersion(payload: {
  dataset_name: string;
  version: string;
  dvc_md5: string;
  path?: string;
  note?: string;
}): Promise<DvcDatasetVersion> {
  const response = await apiClient.post<DvcDatasetVersion>("/dvc/versions", payload);
  return response.data;
}

export async function updateDatasetVersionStatus(versionId: string, status: DvcVersionStatus): Promise<DvcDatasetVersion> {
  const response = await apiClient.patch<DvcDatasetVersion>(`/dvc/versions/${versionId}/status`, { status });
  return response.data;
}
