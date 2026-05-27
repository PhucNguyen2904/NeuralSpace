import { apiClient } from "@/lib/api/client";
import type { PaginatedResponse } from "@/types/api";
import type { Dataset, DatasetListParams, DatasetPreview, WorkspaceDatasetMountResponse } from "@/types/dataset";

export async function getDatasets(params: DatasetListParams): Promise<PaginatedResponse<Dataset>> {
  const response = await apiClient.get<PaginatedResponse<Dataset>>("/datasets", { params });
  return response.data;
}

export async function getDatasetById(id: string): Promise<Dataset> {
  const response = await apiClient.get<Dataset>(`/datasets/${id}`);
  return response.data;
}

export async function getDatasetPreview(id: string): Promise<DatasetPreview> {
  const response = await apiClient.get<DatasetPreview>(`/datasets/${id}/preview`);
  return response.data;
}

export async function mountDatasetToWorkspace(datasetId: string, workspaceId: string): Promise<WorkspaceDatasetMountResponse> {
  const response = await apiClient.post<WorkspaceDatasetMountResponse>(`/workspaces/${workspaceId}/datasets`, { dataset_id: datasetId });
  return response.data;
}

export async function uploadDataset(file: File, metadata?: Record<string, unknown>): Promise<Dataset> {
  const formData = new FormData();
  formData.append("file", file);
  if (metadata) {
    formData.append("metadata", JSON.stringify(metadata));
  }
  const response = await apiClient.post<Dataset>("/datasets/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data;
}
