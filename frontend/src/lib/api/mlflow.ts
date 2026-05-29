import { apiClient } from "@/lib/api/client";
import type { PaginatedResponse } from "@/types/api";
import type { Experiment, ModelVersion, Run, RunStatus, Stage } from "@/types/mlflow";

export interface ExperimentListParams {
  search?: string;
  lifecycle_stage?: "active" | "deleted";
  page?: number;
  limit?: number;
}

export interface RunListParams {
  experiment_id?: string;
  status?: RunStatus;
  page?: number;
  limit?: number;
}

export interface ModelVersionListParams {
  model_name?: string;
  stage?: Stage;
  page?: number;
  limit?: number;
}

export async function getExperiments(params: ExperimentListParams = {}): Promise<PaginatedResponse<Experiment>> {
  const response = await apiClient.get<PaginatedResponse<Experiment>>("/mlflow/experiments", { params });
  return response.data;
}

export async function getExperimentById(experimentId: string): Promise<Experiment> {
  const response = await apiClient.get<Experiment>(`/mlflow/experiments/${experimentId}`);
  return response.data;
}

export async function getRuns(params: RunListParams = {}): Promise<PaginatedResponse<Run>> {
  const response = await apiClient.get<PaginatedResponse<Run>>("/mlflow/runs", { params });
  return response.data;
}

export async function getRunById(runId: string): Promise<Run> {
  const response = await apiClient.get<Run>(`/mlflow/runs/${runId}`);
  return response.data;
}

export async function getModelVersions(params: ModelVersionListParams = {}): Promise<PaginatedResponse<ModelVersion>> {
  const response = await apiClient.get<PaginatedResponse<ModelVersion>>("/mlflow/model-versions", { params });
  return response.data;
}

export async function transitionModelVersionStage(modelName: string, version: string, stage: Stage): Promise<ModelVersion> {
  const response = await apiClient.patch<ModelVersion>("/mlflow/model-versions/stage", {
    model_name: modelName,
    version,
    stage
  });
  return response.data;
}
