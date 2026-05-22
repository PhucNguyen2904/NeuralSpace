import { apiClient } from "@/lib/api/client";
import type { CreateWorkspaceInput, Workspace, WorkspaceFileNode, WorkspaceStatus } from "@/types/workspace";

let mockWorkspaces: Workspace[] = [
  {
    id: "ws_1",
    name: "ResNet Training",
    status: "RUNNING",
    tier: "gpu-t4",
    runtimeLabel: "1h 23m",
    runtimeMinutes: 83,
    cpuUsed: 6,
    cpuLimit: 8,
    ramUsedGb: 11,
    ramLimitGb: 16,
    notebookCount: 4,
    pythonVersion: "3.11",
    packages: ["torch", "torchvision"],
    datasets: ["ImageNet 2024"],
    models: ["ResNet-50 pretrained"],
    accessUrl: "https://jupyter.org/try-jupyter/lab/",
    autoKillAt: new Date(Date.now() + 12 * 60_000).toISOString(),
    lastSavedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    lastActiveAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    owner: { id: "u_1", name: "Alex Nguyen", email: "alex@neuralspace.dev" }
  },
  {
    id: "ws_2",
    name: "EDA Session",
    status: "STOPPED",
    tier: "cpu-standard",
    runtimeLabel: "-",
    runtimeMinutes: 0,
    cpuUsed: 0,
    cpuLimit: 4,
    ramUsedGb: 0,
    ramLimitGb: 8,
    notebookCount: 6,
    pythonVersion: "3.10",
    packages: ["pandas"],
    datasets: [],
    models: [],
    accessUrl: "https://jupyter.org/try-jupyter/lab/",
    autoKillAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    lastSavedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    lastActiveAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    owner: { id: "u_1", name: "Alex Nguyen", email: "alex@neuralspace.dev" }
  }
];

const provisionStartMap = new Map<string, number>();
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const tierResources: Record<Workspace["tier"], { cpu: number; ram: number; runtimeLabel: string }> = {
  "cpu-standard": { cpu: 2, ram: 4, runtimeLabel: "0m" },
  "cpu-large": { cpu: 4, ram: 8, runtimeLabel: "0m" },
  "gpu-t4": { cpu: 4, ram: 16, runtimeLabel: "0m" }
};

const fileTree: WorkspaceFileNode[] = [
  {
    id: "notebooks",
    name: "notebooks",
    type: "folder",
    children: [
      { id: "nb_1", name: "01_data_exploration.ipynb", type: "notebook" },
      { id: "nb_2", name: "02_model_training.ipynb", type: "notebook" }
    ]
  },
  {
    id: "datasets",
    name: "datasets",
    type: "folder",
    readonly: true,
    children: [
      { id: "csv_1", name: "train.csv", type: "csv", readonly: true },
      { id: "csv_2", name: "test.csv", type: "csv", readonly: true }
    ]
  },
  {
    id: "models",
    name: "models",
    type: "folder",
    readonly: true,
    children: [{ id: "m_1", name: "resnet50.pth", type: "model", readonly: true }]
  }
];

export const listWorkspaces = async () => {
  try {
    const { data } = await apiClient.get<Workspace[]>("/workspaces");
    return data;
  } catch {
    await wait(400);
    return [...mockWorkspaces];
  }
};

export const getWorkspaceById = async (id: string) => {
  try {
    const { data } = await apiClient.get<Workspace>(`/workspaces/${id}`);
    return data;
  } catch {
    await wait(250);
    return mockWorkspaces.find((workspace) => workspace.id === id) ?? null;
  }
};

export const getWorkspaceStatus = async (id: string): Promise<{ status: WorkspaceStatus; message?: string }> => {
  try {
    const { data } = await apiClient.get<{ status: WorkspaceStatus; message?: string }>(`/workspaces/${id}/status`);
    return data;
  } catch {
    await wait(250);
    const workspace = mockWorkspaces.find((item) => item.id === id);
    if (!workspace) {
      return { status: "ERROR", message: "Workspace không tồn tại" };
    }

    if (workspace.status !== "PROVISIONING") {
      return { status: workspace.status };
    }

    const started = provisionStartMap.get(id) ?? Date.now();
    const elapsed = Date.now() - started;

    if (elapsed >= 22_000) {
      workspace.status = "RUNNING";
      workspace.runtimeLabel = "1m";
      workspace.runtimeMinutes = 1;
      workspace.cpuUsed = Math.max(1, Math.floor(workspace.cpuLimit * 0.4));
      workspace.ramUsedGb = Math.max(1, Math.floor(workspace.ramLimitGb * 0.4));
      workspace.lastSavedAt = new Date(Date.now() - 2 * 60_000).toISOString();
      workspace.autoKillAt = new Date(Date.now() + 30 * 60_000).toISOString();
      provisionStartMap.delete(id);
      return { status: "RUNNING" };
    }

    return { status: "PROVISIONING" };
  }
};

export const getWorkspaceAccessToken = async (id: string) => {
  try {
    const { data } = await apiClient.get<{ ws_token: string; websocket_url: string; access_url: string; expires_in: number }>(`/workspaces/${id}/token`);
    return data;
  } catch {
    await wait(200);
    return {
      ws_token: `mock-token-${id}-${Date.now()}`,
      websocket_url: "wss://example-jupyter-ws.local",
      access_url: "https://jupyter.org/try-jupyter/lab/",
      expires_in: 900
    };
  }
};

export const heartbeatWorkspace = async (id: string) => {
  try {
    await apiClient.post(`/workspaces/${id}/heartbeat`);
  } catch {
    await wait(150);
  }

  mockWorkspaces = mockWorkspaces.map((workspace) =>
    workspace.id === id ? { ...workspace, autoKillAt: new Date(Date.now() + 30 * 60_000).toISOString(), lastActiveAt: new Date().toISOString() } : workspace
  );
  return true;
};

export const getWorkspaceResources = async (id: string) => {
  try {
    const { data } = await apiClient.get<{ cpu: number; ramUsedGb: number; ramTotalGb: number; gpu: number }>(`/workspaces/${id}/resources`);
    return data;
  } catch {
    await wait(120);
    const workspace = mockWorkspaces.find((item) => item.id === id);
    const cpu = workspace ? Math.min(95, Math.round((workspace.cpuUsed / workspace.cpuLimit) * 100 + Math.random() * 10)) : 12;
    const ramUsedGb = workspace ? Math.max(0.8, Number((workspace.ramUsedGb * 0.1 + Math.random() * 1.2).toFixed(1))) : 1.2;
    const ramTotalGb = workspace?.ramLimitGb ?? 4;
    const gpu = workspace?.tier === "gpu-t4" ? Math.min(95, Math.round(30 + Math.random() * 30)) : 0;
    return { cpu, ramUsedGb, ramTotalGb, gpu };
  }
};

export const getKernelStatus = async (id: string) => {
  try {
    const { data } = await apiClient.get<{ status: "idle" | "busy" | "dead"; activeKernels: string[] }>(`/workspaces/${id}/kernels`);
    return data;
  } catch {
    await wait(120);
    const states: Array<"idle" | "busy" | "dead"> = ["idle", "busy", "idle", "idle"];
    const pick = states[Math.floor(Math.random() * states.length)] ?? "idle";
    return { status: pick, activeKernels: ["Python 3 (ipykernel)"] };
  }
};

export const listWorkspaceFiles = async (_id: string) => {
  await wait(120);
  return fileTree;
};

export const createWorkspace = async (input: CreateWorkspaceInput) => {
  try {
    const { data } = await apiClient.post<Workspace>("/workspaces", input);
    return data;
  } catch {
    await wait(500);
    const id = `ws_${Date.now()}`;
    const resources = tierResources[input.tier];
    const workspace: Workspace = {
      id,
      name: input.name,
      status: "PROVISIONING",
      tier: input.tier,
      runtimeLabel: resources.runtimeLabel,
      runtimeMinutes: 0,
      cpuUsed: 0,
      cpuLimit: resources.cpu,
      ramUsedGb: 0,
      ramLimitGb: resources.ram,
      notebookCount: 0,
      pythonVersion: input.pythonVersion,
      packages: input.packages,
      datasets: input.datasets,
      models: input.models,
      accessUrl: "https://jupyter.org/try-jupyter/lab/",
      autoKillAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      lastSavedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      owner: { id: "u_1", name: "Alex Nguyen", email: "alex@neuralspace.dev" }
    };

    mockWorkspaces.unshift(workspace);
    provisionStartMap.set(id, Date.now());
    return workspace;
  }
};

export const stopWorkspace = async (id: string) => {
  try {
    await apiClient.post(`/workspaces/${id}/stop`);
  } catch {
    await wait(250);
  }

  mockWorkspaces = mockWorkspaces.map((workspace) =>
    workspace.id === id ? { ...workspace, status: "STOPPED", runtimeLabel: "-", runtimeMinutes: 0 } : workspace
  );

  return true;
};

export const deleteWorkspace = async (id: string) => {
  try {
    await apiClient.delete(`/workspaces/${id}`);
  } catch {
    await wait(250);
  }

  mockWorkspaces = mockWorkspaces.filter((workspace) => workspace.id !== id);
  provisionStartMap.delete(id);
  return true;
};
