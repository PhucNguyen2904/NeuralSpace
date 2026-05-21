export type WorkspaceStatus = "PROVISIONING" | "RUNNING" | "STOPPING" | "STOPPED" | "ERROR";
export type WorkspaceTier = "cpu-standard" | "cpu-large" | "gpu-t4";
export interface ResourceUsage { cpu_percent: number; memory_mb: number; memory_limit_mb: number; }
export interface Workspace { workspace_id: string; name: string | null; status: WorkspaceStatus; tier: WorkspaceTier; access_url: string | null; created_at: string; started_at: string | null; stopped_at: string | null; idle_since: string | null; auto_kill_at: string | null; dataset_ids: string[]; model_ids: string[]; resource_usage: ResourceUsage | null; }
export interface WorkspaceCreateRequest { name?: string; tier: WorkspaceTier; dataset_ids: string[]; model_ids: string[]; environment: { python_version: "3.10" | "3.11" | "3.12"; extra_packages: string[]; }; }
export interface WorkspaceActionResponse { workspace_id: string; status: WorkspaceStatus; message?: string; }
