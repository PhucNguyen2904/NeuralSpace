export type WorkspaceStatus = "READY" | "PROVISIONING" | "RUNNING" | "STOPPING" | "STOPPED" | "ERROR";

export interface WorkspaceOwner {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface Workspace {
  id: string;
  name: string;
  status: WorkspaceStatus;
  tier: "external-colab";
  pythonVersion?: "3.10" | "3.11" | "3.12";
  packages?: string[];
  datasets?: string[];
  models?: string[];
  lastActiveAt: string;
  createdAt: string;
  owner: WorkspaceOwner;
}

export interface CreateWorkspaceInput {
  name: string;
  pythonVersion: "3.10" | "3.11" | "3.12";
  packages: string[];
  datasets: string[];
  models: string[];
}

// ─── Colab session & run types ────────────────────────────────────────────────

export type ColabSessionStatus = "ISSUED" | "CONNECTED" | "DISCONNECTED" | "EXPIRED" | "REVOKED";
export type ColabRunStatus = "CREATED" | "RUNNING" | "FINISHED" | "FAILED" | "STALE" | "CANCEL_REQUESTED";

export interface ColabLaunchResult {
  launch_url: string;
  session_id: string;
  claim_code: string;
  expires_in: number;
}

export interface ColabMetric {
  key: string;
  value: number;
  step: number;
  timestamp: string;
}

export interface ColabArtifact {
  name: string;
  size_bytes: number;
  status: "PENDING" | "CONFIRMED";
  uploaded_at: string;
}

export interface ColabRunData {
  session_status: ColabSessionStatus;
  session_last_seen: string | null;
  run_id: string | null;
  run_status: ColabRunStatus | null;
  run_started_at: string | null;
  run_last_reported: string | null;
  metrics: ColabMetric[];
  logs: { level: string; message: string; timestamp: string }[];
  artifacts: ColabArtifact[];
  model_version: string | null;
}
