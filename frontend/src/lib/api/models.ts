import { apiClient } from "@/lib/api/client";
import type { PaginatedResponse } from "@/types/api";
import type { Model, ModelDetail, ModelInspectResponse, ModelListParams, ModelMetrics, ModelVersion, UpdateModelPayload, UploadModelVersionMetadata } from "@/types/model";

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
    const metaCopy = { ...metadata };
    if (metaCopy.storage_provider_id) {
      formData.append("storage_provider_id", String(metaCopy.storage_provider_id));
      delete metaCopy.storage_provider_id;
    }
    formData.append("metadata", JSON.stringify(metaCopy));
  }
  const response = await apiClient.post<Model>("/models/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data;
}

export async function uploadGeneralModel(file: File, metadata?: Record<string, unknown>): Promise<Model> {
  const formData = new FormData();
  formData.append("file", file);
  if (metadata) {
    const metaCopy = { ...metadata };
    if (metaCopy.storage_provider_id) {
      formData.append("storage_provider_id", String(metaCopy.storage_provider_id));
      delete metaCopy.storage_provider_id;
    }
    formData.append("metadata", JSON.stringify(metaCopy));
  }
  const response = await apiClient.post<Model>("/models/general/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data;
}

export async function uploadYoloModel(file: File, payload: Record<string, string>): Promise<Model> {
  const formData = new FormData();
  formData.append("file", file);
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== "") formData.append(key, value);
  });
  const response = await apiClient.post<Model>("/models/yolo/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data;
}

export async function inspectYoloModel(file: File, payload: Record<string, string>): Promise<ModelInspectResponse> {
  const formData = modelUploadFormData(file, payload);
  const response = await apiClient.post<ModelInspectResponse>("/models/yolo/inspect", formData, {
    timeout: 120_000
  });
  return response.data;
}

export async function inspectGeneralModel(file: File, payload: Record<string, string>): Promise<ModelInspectResponse> {
  const formData = modelUploadFormData(file, payload);
  const response = await apiClient.post<ModelInspectResponse>("/models/general/inspect", formData, {
    timeout: 120_000
  });
  return response.data;
}

export async function updateModel(modelId: string, payload: UpdateModelPayload): Promise<Model> {
  const response = await apiClient.patch<Model>(`/models/${modelId}`, payload);
  return response.data;
}

export async function deleteModel(modelId: string): Promise<void> {
  await apiClient.delete(`/models/${modelId}`);
}

export async function uploadModelVersion(modelId: string, file: File, metadata?: UploadModelVersionMetadata): Promise<Model> {
  const formData = new FormData();
  formData.append("file", file);
  if (metadata) {
    const metaCopy = { ...metadata as Record<string, unknown> };
    if (metaCopy.storage_provider_id) {
      formData.append("storage_provider_id", String(metaCopy.storage_provider_id));
      delete metaCopy.storage_provider_id;
    }
    formData.append("metadata", JSON.stringify(metaCopy));
  }
  const response = await apiClient.post<Model>(`/models/${modelId}/versions`, formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data;
}

function modelUploadFormData(file: File, payload: Record<string, string>) {
  const formData = new FormData();
  formData.append("file", file);
  Object.entries(payload).forEach(([key, value]) => {
    if (value.trim()) formData.append(key, value.trim());
  });
  return formData;
}
