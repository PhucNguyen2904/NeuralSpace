import { apiClient } from "@/lib/api/client";
import type { CreateWorkspaceInput, Workspace, WorkspaceFileNode, WorkspaceStatus } from "@/types/workspace";

type BackendWorkspace = {
  id: string;
  user_id: string;
  name: string | null;
  status: WorkspaceStatus;
  tier: Workspace["tier"];
  access_url: string | null;
  dataset_ids: string[];
  model_ids: string[];
  environment_config: { python_version?: Workspace["pythonVersion"]; extra_packages?: string[] } | null;
  resource_config: { cpu_limit?: number; ram_limit_gb?: number } | null;
  resource_usage: { cpu_used?: number; ram_used_gb?: number } | null;
  last_kernel_activity: string | null;
  auto_kill_at: string | null;
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
  const cpuLimit = Number(w.resource_config?.cpu_limit ?? 4);
  const ramLimitGb = Number(w.resource_config?.ram_limit_gb ?? 8);
  const cpuUsed = Number(w.resource_usage?.cpu_used ?? 0);
  const ramUsedGb = Number(w.resource_usage?.ram_used_gb ?? 0);

  return {
    id: w.id,
    name: w.name ?? w.id,
    status: w.status,
    tier: w.tier,
    runtimeLabel: "-",
    runtimeMinutes: 0,
    cpuUsed,
    cpuLimit,
    ramUsedGb,
    ramLimitGb,
    notebookCount: 0,
    pythonVersion: w.environment_config?.python_version ?? "3.11",
    packages: w.environment_config?.extra_packages ?? [],
    datasets: w.dataset_ids ?? [],
    models: w.model_ids ?? [],
    accessUrl: w.access_url ?? undefined,
    autoKillAt: w.auto_kill_at ?? undefined,
    lastSavedAt: w.updated_at,
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

export const getWorkspaceStatus = async (id: string): Promise<{ status: WorkspaceStatus; message?: string }> => {
  const { data } = await apiClient.get<{ status: WorkspaceStatus }>(`/workspaces/${id}/status`);
  return data;
};

export const getWorkspaceAccessToken = async (id: string) => {
  const { data } = await apiClient.get<{ ws_token: string; websocket_url: string; expires_in: number }>(`/workspaces/${id}/token`);
  const detail = await getWorkspaceById(id);
  return {
    ...data,
    access_url: detail.accessUrl ?? ""
  };
};

export const heartbeatWorkspace = async (id: string) => {
  await apiClient.post(`/workspaces/${id}/heartbeat`);
  return true;
};

export const getWorkspaceResources = async (id: string) => {
  const detail = await getWorkspaceById(id);
  const cpu = detail.cpuLimit > 0 ? Math.round((detail.cpuUsed / detail.cpuLimit) * 100) : 0;
  const gpu = detail.tier === "gpu-t4" ? 1 : 0;
  return {
    cpu,
    ramUsedGb: detail.ramUsedGb,
    ramTotalGb: detail.ramLimitGb,
    gpu
  };
};

export const getKernelStatus = async (id: string) => {
  const status = await getWorkspaceStatus(id);
  return {
    status: status.status === "RUNNING" ? "idle" : "dead",
    activeKernels: status.status === "RUNNING" ? ["Python 3 (ipykernel)"] : []
  } as const;
};

export const listWorkspaceFiles = async (_id: string): Promise<WorkspaceFileNode[]> => {
  return [];
};

export const createWorkspace = async (input: CreateWorkspaceInput) => {
  const payload = {
    name: input.name,
    tier: input.tier,
    dataset_ids: input.datasets,
    model_ids: input.models,
    environment: {
      python_version: input.pythonVersion,
      extra_packages: input.packages
    }
  };
  const { data } = await apiClient.post<BackendWorkspaceCreateAccepted>("/workspaces", payload);
  const detail = await getWorkspaceById(data.workspace_id);
  return detail;
};

export const stopWorkspace = async (id: string) => {
  await apiClient.post(`/workspaces/${id}/stop`, { save_notebooks: true });
  return true;
};

export const deleteWorkspace = async (id: string) => {
  await apiClient.delete(`/workspaces/${id}`);
  return true;
};
