export type Stage = "None" | "Staging" | "Production" | "Archived";
export type RunStatus = "RUNNING" | "FINISHED" | "FAILED" | "KILLED" | "SCHEDULED";

export interface MlflowMetric {
  key: string;
  value: number;
  step?: number;
  timestamp?: number;
}

export interface MlflowParam {
  key: string;
  value: string;
}

export interface ModelVersion {
  id: string;
  name: string;
  version: string;
  stage: Stage;
  source?: string;
  run_id?: string;
  description?: string;
  tags?: Record<string, string>;
  metrics?: Record<string, number>;
  created_at: string;
  updated_at?: string;
}

export interface Run {
  run_id: string;
  experiment_id: string;
  name?: string;
  status: RunStatus;
  stage?: Stage;
  start_time: string;
  end_time?: string;
  duration_ms?: number;
  artifact_uri?: string;
  user_id?: string;
  tags?: Record<string, string>;
  params?: MlflowParam[];
  metrics?: MlflowMetric[];
}

export interface Experiment {
  experiment_id: string;
  name: string;
  lifecycle_stage: "active" | "deleted";
  artifact_location?: string;
  created_at?: string;
  updated_at?: string;
  tags?: Record<string, string>;
  latest_run?: Run;
  run_count?: number;
}
