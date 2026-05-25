import { apiClient } from "@/lib/api/client";
import type { PaginatedResponse } from "@/types/api";
import type { Dataset, DatasetListParams, DatasetPreview } from "@/types/dataset";

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

export async function mountDatasetToWorkspace(datasetId: string, workspaceId: string): Promise<void> {
  await apiClient.post(`/workspaces/${workspaceId}/datasets`, { dataset_id: datasetId });
}

