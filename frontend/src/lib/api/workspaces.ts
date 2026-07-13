import { apiClient } from "@/lib/api/client";
import type { ColabLaunchResult, ColabRunData, CreateWorkspaceInput, Workspace, WorkspaceStatus } from "@/types/workspace";

type BackendWorkspace = {
  id: string;
  user_id: string;
  name: string | null;
  status: WorkspaceStatus;
  dataset_ids: string[];
  model_ids: string[];
  last_kernel_activity: string | null;
  created_at: string;
  updated_at: string;
};

type BackendWorkspaceList = {
  items: BackendWorkspace[];
};

type BackendWorkspaceCreateAccepted = {
  workspace_id: string;
  status: WorkspaceStatus;
};

const mapWorkspace = (w: BackendWorkspace): Workspace => {
  return {
    id: w.id,
    name: w.name ?? w.id,
    status: w.status,
    datasets: w.dataset_ids ?? [],
    models: w.model_ids ?? [],
    lastActiveAt: w.last_kernel_activity ?? w.updated_at,
    createdAt: w.created_at,
    owner: {
      id: w.user_id,
      name: w.user_id,
      email: `${w.user_id}@local`
    }
  };
};

export const listWorkspaces = async () => {
  const { data } = await apiClient.get<BackendWorkspaceList>("/workspaces");
  return (data.items ?? []).map(mapWorkspace);
};

export const getWorkspaceById = async (id: string) => {
  const { data } = await apiClient.get<BackendWorkspace>(`/workspaces/${id}`);
  return mapWorkspace(data);
};

export const createWorkspace = async (input: CreateWorkspaceInput) => {
  const payload = {
    name: input.name,
    dataset_ids: input.datasets,
    model_ids: input.models,
  };
  const { data } = await apiClient.post<BackendWorkspaceCreateAccepted>("/workspaces", payload);
  const detail = await getWorkspaceById(data.workspace_id);
  return detail;
};

export const updateWorkspaceAssets = async (
  id: string,
  input: Pick<CreateWorkspaceInput, "datasets" | "models">
) => {
  const { data } = await apiClient.patch<BackendWorkspace>(`/workspaces/${id}/assets`, {
    dataset_ids: input.datasets,
    model_ids: input.models
  });
  return mapWorkspace(data);
};

export const deleteWorkspace = async (id: string) => {
  await apiClient.delete(`/workspaces/${id}`);
  return true;
};

/** Create a short-lived, one-time Colab claim after explicit user action. */
export const launchWorkspaceInColab = async (id: string): Promise<ColabLaunchResult> => {
  const { data } = await apiClient.post<ColabLaunchResult>(`/colab/workspaces/${id}/claims`);
  return data;
};

/**
 * Poll current session status and run data for a workspace.
 * Returns null when no active session exists yet (404 → empty state).
 */
export const getWorkspaceRunData = async (id: string): Promise<ColabRunData | null> => {
  try {
    const { data } = await apiClient.get<ColabRunData>(`/colab/workspaces/${id}/session`);
    return data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) return null;
    throw err;
  }
};
