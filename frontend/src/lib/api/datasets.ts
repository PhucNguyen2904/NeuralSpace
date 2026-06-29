import { apiClient } from "@/lib/api/client";
import type { PaginatedResponse } from "@/types/api";
import type { Dataset, DatasetInspectResponse, DatasetListParams, DatasetPreview, DatasetUploadResponse, UpdateDatasetPayload, WorkspaceDatasetMountResponse } from "@/types/dataset";

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

export async function getDatasetDownloadUrl(id: string): Promise<{ url: string }> {
  const response = await apiClient.get<{ url: string }>(`/datasets/${id}/download-url`);
  return response.data;
}

export async function uploadDataset(file: File, metadata?: Record<string, unknown>): Promise<Dataset> {
  const formData = new FormData();
  formData.append("file", file);
  if (metadata) {
    formData.append("metadata", JSON.stringify(metadata));
  }
  const response = await apiClient.post<Dataset>("/datasets/upload", formData, {
    timeout: 120_000
  });
  return response.data;
}

export async function uploadYoloDataset(file: File, payload: Record<string, string>): Promise<DatasetUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  Object.entries(payload).forEach(([key, value]) => {
    if (value.trim()) formData.append(key, value.trim());
  });
  const response = await apiClient.post<DatasetUploadResponse>("/datasets/uploads/yolo", formData, {
    timeout: 180_000
  });
  return response.data;
}

export async function uploadGeneralDataset(file: File, payload: Record<string, string>): Promise<DatasetUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  Object.entries(payload).forEach(([key, value]) => {
    if (value.trim()) formData.append(key, value.trim());
  });
  const response = await apiClient.post<DatasetUploadResponse>("/datasets/uploads/general", formData, {
    timeout: 180_000
  });
  return response.data;
}

export async function inspectYoloDataset(file: File, payload: Record<string, string>): Promise<DatasetInspectResponse> {
  const formData = datasetUploadFormData(file, payload);
  const response = await apiClient.post<DatasetInspectResponse>("/datasets/uploads/yolo/inspect", formData, {
    timeout: 120_000
  });
  return response.data;
}

export async function inspectGeneralDataset(file: File, payload: Record<string, string>): Promise<DatasetInspectResponse> {
  const formData = datasetUploadFormData(file, payload);
  const response = await apiClient.post<DatasetInspectResponse>("/datasets/uploads/general/inspect", formData, {
    timeout: 120_000
  });
  return response.data;
}

export async function updateDataset(datasetId: string, payload: UpdateDatasetPayload): Promise<Dataset> {
  const response = await apiClient.patch<Dataset>(`/datasets/${datasetId}`, payload);
  return response.data;
}

export async function deleteDataset(datasetId: string): Promise<void> {
  await apiClient.delete(`/datasets/${datasetId}`);
}

function datasetUploadFormData(file: File, payload: Record<string, string>) {
  const formData = new FormData();
  formData.append("file", file);
  Object.entries(payload).forEach(([key, value]) => {
    if (value.trim()) formData.append(key, value.trim());
  });
  return formData;
}
