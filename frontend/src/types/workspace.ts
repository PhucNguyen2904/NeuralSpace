export type WorkspaceStatus = "PROVISIONING" | "RUNNING" | "STOPPING" | "STOPPED" | "ERROR";

export interface WorkspaceOwner {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface WorkspaceFileNode {
  id: string;
  name: string;
  type: "folder" | "notebook" | "csv" | "model" | "python" | "file";
  readonly?: boolean;
  children?: WorkspaceFileNode[];
}

export interface Workspace {
  id: string;
  name: string;
  status: WorkspaceStatus;
  tier: "cpu-standard" | "cpu-large" | "gpu-t4";
  runtimeLabel: string;
  runtimeMinutes: number;
  cpuUsed: number;
  cpuLimit: number;
  ramUsedGb: number;
  ramLimitGb: number;
  notebookCount: number;
  pythonVersion?: "3.10" | "3.11" | "3.12";
  packages?: string[];
  datasets?: string[];
  models?: string[];
  accessUrl?: string;
  autoKillAt?: string;
  lastSavedAt?: string;
  lastActiveAt: string;
  createdAt: string;
  owner: WorkspaceOwner;
}

export interface CreateWorkspaceInput {
  name: string;
  pythonVersion: "3.10" | "3.11" | "3.12";
  packages: string[];
  tier: Workspace["tier"];
  datasets: string[];
  models: string[];
}
