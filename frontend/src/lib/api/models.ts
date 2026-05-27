import { apiClient } from "@/lib/api/client";
import type { PaginatedResponse } from "@/types/api";
import type { Model, ModelDetail, ModelListParams, ModelMetrics, ModelVersion } from "@/types/model";

export async function getModels(params: ModelListParams): Promise<PaginatedResponse<Model>> {
  const response = await apiClient.get<PaginatedResponse<Model>>("/models", { params });
  return response.data;
}

export async function getModelById(id: string): Promise<ModelDetail> {
  const response = await apiClient.get<ModelDetail>(`/models/${id}`);
  return response.data;
}

export async function getModelMetrics(id: string): Promise<ModelMetrics> {
  const response = await apiClient.get<ModelMetrics>(`/models/${id}/metrics`);
  return response.data;
}

export async function loadModelToWorkspace(modelId: string, workspaceId: string, mountPath: string): Promise<void> {
  await apiClient.post(`/workspaces/${workspaceId}/models`, { model_id: modelId, mount_path: mountPath });
}

export async function getModelVersions(modelId: string): Promise<ModelVersion[]> {
  const response = await apiClient.get<ModelVersion[]>(`/models/${modelId}/versions`);
  return response.data;
}

export async function uploadModel(file: File, metadata?: Record<string, unknown>): Promise<Model> {
  const formData = new FormData();
  formData.append("file", file);
  if (metadata) {
    formData.append("metadata", JSON.stringify(metadata));
  }
  const response = await apiClient.post<Model>("/models/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data;
}
