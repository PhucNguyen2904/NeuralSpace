"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDatasetVersion,
  diffDatasetVersions,
  getDatasetVersionById,
  getDatasetVersions,
  trackDatasetVersion,
  validateDatasetVersion,
  type DvcVersionStatus,
  type TrackVersionPayload,
} from "@/lib/api/dvc";
import type { Stage } from "@/types/mlflow";


export interface IntegrityCheckResult {
  key: string;
  label: string;
  passed: boolean;
  message?: string;
}

export interface LinkedModelSummary {
  id: string;
  name: string;
  stage: Stage;
}

export interface VersionDiffSummary {
  versionAId: string;
  versionBId: string;
  added: number;
  modified: number;
  removed: number;
  netChange: number;
  netPercent: number;
  samples: Array<{ id: string; changeType: "ADDED" | "MODIFIED" | "REMOVED"; note: string }>;
}

export interface DatasetVersion {
  id: string;
  dataset_id: string;
  version: string;
  dvc_md5: string;
  status: "draft" | "validated" | "deprecated";
  is_latest: boolean;
  size_bytes: number;
  item_count: number;
  split_ratio: string;
  created_by: string;
  created_at: string;
  changelog: string;
  git_commit: string;
  storage_uri: string;
  tracked_at: string;
  linked_models: LinkedModelSummary[];
  integrity: {
    lastChecked: string;
    checks: IntegrityCheckResult[];
  };
}

function mapVersion(raw: {
  id: string;
  dataset_id?: string;
  version: string;
  dvc_md5?: string;
  dvc_commit?: string;
  git_commit?: string;
  status: "draft" | "validated" | "deprecated";
  is_latest?: boolean;
  size_bytes?: number;
  item_count?: number;
  storage_path?: string;
  storage_uri?: string;
  created_by?: string;
  created_at: string;
  changelog?: string;
  note?: string;
  tracked_at?: string;
  linked_models?: Array<{ id: string; name: string; stage?: string }>;
}): DatasetVersion {
  return {
    id: raw.id,
    dataset_id: raw.dataset_id ?? "",
    version: raw.version,
    dvc_md5: raw.dvc_md5 ?? "",
    status: raw.status,
    is_latest: Boolean(raw.is_latest),
    size_bytes: raw.size_bytes ?? 0,
    item_count: raw.item_count ?? 0,
    split_ratio: "N/A",
    created_by: raw.created_by ?? "system",
    created_at: raw.created_at,
    changelog: raw.changelog ?? raw.note ?? "",
    git_commit: raw.git_commit ?? raw.dvc_commit ?? "",
    storage_uri: raw.storage_uri ?? raw.storage_path ?? "",
    tracked_at: raw.tracked_at ?? raw.created_at,
    linked_models: (raw.linked_models ?? []).map((model) => ({
      id: model.id,
      name: model.name,
      stage: (model.stage ?? "None") as Stage
    })),
    integrity: {
      lastChecked: "Not checked",
      checks: [
        { key: "md5", label: "DVC md5 metadata exists", passed: Boolean(raw.dvc_md5) },
        { key: "git", label: "Git commit metadata exists", passed: Boolean(raw.dvc_commit ?? raw.git_commit) },
        { key: "storage", label: "Storage path metadata exists", passed: Boolean(raw.storage_path ?? raw.storage_uri) }
      ]
    }
  };
}

export function useVersionList(datasetId: string) {
  return useQuery({
    queryKey: ["dataset-versions", datasetId],
    enabled: Boolean(datasetId),
    queryFn: async () => {
      try {
        const response = await getDatasetVersions({ dataset_name: datasetId, limit: 100 });
        return response.items.map((item) => mapVersion(item));
      } catch {
        return [];
      }
    }
  });
}

export function useVersionDetail(datasetId: string, versionId: string) {
  return useQuery({
    queryKey: ["dataset-version-detail", datasetId, versionId],
    enabled: Boolean(datasetId && versionId),
    queryFn: async () => {
      const response = await getDatasetVersionById(datasetId, versionId);
      return mapVersion(response);
    }
  });
}

export interface UseVersionDiffReturn {
  diff: VersionDiffSummary | null;
  isLoading: boolean;
  compare: (againstVersionId: string) => void;
  recheckIntegrity: () => Promise<void>;
  isRecheckingIntegrity: boolean;
}

export function useVersionDiff(datasetId: string, versionAId: string, _versionBId?: string): UseVersionDiffReturn {
  const [diff, setDiff] = useState<VersionDiffSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecheckingIntegrity, setIsRecheckingIntegrity] = useState(false);

  const compare = (againstVersionId: string) => {
    if (!datasetId || !versionAId || !againstVersionId) return;
    setIsLoading(true);
    diffDatasetVersions(datasetId, versionAId, againstVersionId)
      .then((response) => {
        setDiff({
          versionAId: response.versionAId ?? versionAId,
          versionBId: response.versionBId ?? againstVersionId,
          added: Number(response.added ?? 0),
          modified: Number(response.modified ?? 0),
          removed: Number(response.removed ?? 0),
          netChange: Number(response.netChange ?? 0),
          netPercent: Number(response.netPercent ?? 0),
          samples: response.samples ?? []
        });
      })
      .finally(() => setIsLoading(false));
  };

  const recheck = async () => {
    if (!datasetId || !versionAId) return;
    setIsRecheckingIntegrity(true);
    try {
      await validateDatasetVersion(datasetId, versionAId);
    } finally {
      setIsRecheckingIntegrity(false);
    }
  };

  return { diff, isLoading, compare, recheckIntegrity: recheck, isRecheckingIntegrity };
}

export type TrackProgressStep = {
  key: "dvc_add" | "push_minio" | "save_metadata";
  label: string;
  status: "pending" | "running" | "done";
};

export interface UseTrackVersionReturn {
  trackVersion: (payload: { datasetId: string; changelog: string; path: string }) => Promise<void>;
  isTracking: boolean;
  progressSteps: TrackProgressStep[];
  reset: () => void;
}

export function useTrackVersion(): UseTrackVersionReturn {
  const queryClient = useQueryClient();
  const [progressSteps, setProgressSteps] = useState<TrackProgressStep[]>([]);

  const mutation = useMutation({
    mutationFn: async (payload: { datasetId: string; changelog: string; path: string }) => {
      await createDatasetVersion(payload.datasetId, {
        version: "",
        local_path: payload.path,
        path: payload.path,
        commit_message: payload.changelog || `Track dataset version for ${payload.datasetId}`,
        changelog: payload.changelog
      });
    },
    onSuccess: async (_, variables) => {
      const steps: TrackProgressStep[] = [
        { key: "dvc_add", label: "Saving DVC metadata...", status: "running" },
        { key: "push_minio", label: "Syncing storage reference...", status: "pending" },
        { key: "save_metadata", label: "Metadata saved", status: "pending" }
      ];
      setProgressSteps(steps);

      await new Promise<void>((resolve) => {
        window.setTimeout(() => {
          setProgressSteps((prev) => prev.map((step) => (step.key === "dvc_add" ? { ...step, status: "done", label: "DVC metadata is ready" } : step)));
        }, 800);
        window.setTimeout(() => {
          setProgressSteps((prev) =>
            prev.map((step) => {
              if (step.key === "push_minio") return { ...step, status: "running" };
              return step;
            })
          );
        }, 1000);
        window.setTimeout(() => {
          setProgressSteps((prev) => prev.map((step) => (step.key === "push_minio" ? { ...step, status: "done", label: "Storage reference synced" } : step)));
        }, 1800);
        window.setTimeout(() => {
          setProgressSteps((prev) =>
            prev.map((step) => {
              if (step.key === "save_metadata") return { ...step, status: "done" };
              return step;
            })
          );
          resolve();
        }, 2400);
      });

      await queryClient.invalidateQueries({ queryKey: ["dataset-versions", variables.datasetId] });
    }
  });

  return useMemo(
    () => ({
      trackVersion: async (payload: { datasetId: string; changelog: string; path: string }) => mutation.mutateAsync(payload),
      isTracking: mutation.isPending,
      progressSteps,
      reset: () => setProgressSteps([])
    }),
    [mutation, progressSteps]
  );
}

// ─── Upload New Version (file multipart → /versions/track) ───────────────────

export type UploadStep =
  | { key: "upload"; label: string; status: "pending" | "running" | "done" | "error"; percent?: number }
  | { key: "dvc"; label: string; status: "pending" | "running" | "done" | "error" }
  | { key: "save"; label: string; status: "pending" | "running" | "done" | "error" };

export interface UseUploadVersionReturn {
  upload: (opts: {
    datasetId: string;
    file: File;
    version?: string;
    commitMessage: string;
    changelog?: string;
    itemCount?: number;
    status?: DvcVersionStatus;
  }) => Promise<void>;
  isUploading: boolean;
  steps: UploadStep[];
  error: string | null;
  reset: () => void;
}

const INITIAL_STEPS: UploadStep[] = [
  { key: "upload", label: "Uploading file...", status: "pending" },
  { key: "dvc", label: "DVC tracking (add → commit → push)...", status: "pending" },
  { key: "save", label: "Saving version metadata...", status: "pending" },
];

export function useUploadVersion(): UseUploadVersionReturn {
  const queryClient = useQueryClient();
  const [steps, setSteps] = useState<UploadStep[]>(INITIAL_STEPS);
  const [error, setError] = useState<string | null>(null);

  const setStep = (key: UploadStep["key"], patch: Partial<UploadStep>) =>
    setSteps((prev) => prev.map((s) => (s.key === key ? ({ ...s, ...patch } as UploadStep) : s)));

  const mutation = useMutation({
    mutationFn: async (opts: {
      datasetId: string;
      file: File;
      version?: string;
      commitMessage: string;
      changelog?: string;
      itemCount?: number;
      status?: DvcVersionStatus;
    }) => {
      // ── Phase 1: upload ───────────────────────────────────────────────
      setStep("upload", { status: "running", label: "Uploading file..." });

      const result = await trackDatasetVersion(opts.datasetId, {
        file: opts.file,
        version: opts.version,
        commitMessage: opts.commitMessage,
        changelog: opts.changelog,
        itemCount: opts.itemCount ?? 0,
        status: opts.status ?? "draft",
        onUploadProgress: (pct) => {
          if (pct < 100) {
            setStep("upload", { percent: pct, label: `Uploading file... ${pct}%` });
          } else {
            // File arrived at server – backend now runs DVC
            setStep("upload", { status: "done", label: "File uploaded" });
            setStep("dvc", { status: "running", label: "DVC tracking (add → commit → push)..." });
          }
        },
      });

      // ── Phase 2: DVC done (server responded) ──────────────────────────
      setStep("dvc", { status: "done", label: `DVC commit: ${result.dvc_commit?.slice(0, 7) ?? "ok"}` });
      setStep("save", { status: "running", label: "Saving version metadata..." });

      return { result, datasetId: opts.datasetId };
    },

    onSuccess: async ({ result, datasetId }) => {
      setStep("save", { status: "done", label: `Version ${result.version} saved (is_latest: true)` });
      await queryClient.invalidateQueries({ queryKey: ["dataset-versions", datasetId] });
    },

    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? (err instanceof Error ? err.message : "Upload failed");
      setError(msg);
      // Mark running step as errored
      setSteps((prev) =>
        prev.map((s) => (s.status === "running" ? ({ ...s, status: "error" } as UploadStep) : s))
      );
    },
  });

  return useMemo(
    () => ({
      upload: async (opts) => {
        setError(null);
        setSteps(INITIAL_STEPS);
        await mutation.mutateAsync(opts);
      },
      isUploading: mutation.isPending,
      steps,
      error,
      reset: () => {
        setSteps(INITIAL_STEPS);
        setError(null);
        mutation.reset();
      },
    }),
    [mutation, steps, error]
  );
}
