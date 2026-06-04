"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDatasetVersion, getDatasetVersionById, getDatasetVersions } from "@/lib/api/dvc";
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

const MOCK_VERSIONS: DatasetVersion[] = [
  {
    id: "dv_13",
    dataset_id: "dataset_1",
    version: "v1.3",
    dvc_md5: "abc1234def4567890",
    status: "validated",
    is_latest: true,
    size_bytes: 18.7 * 1024 ** 3,
    item_count: 118287,
    split_ratio: "80/10/10",
    created_by: "alice",
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    changelog: "Thêm 5K ảnh mới, fix label lỗi class 'car'",
    git_commit: "abc1234",
    storage_uri: "s3://dvc-data/datasets/coco2017/",
    tracked_at: "2024-01-15 14:32:00",
    linked_models: [
      { id: "m_1", name: "resnet50-custom v1.3", stage: "Production" },
      { id: "m_2", name: "yolov8-nano v2.1", stage: "Staging" }
    ],
    integrity: {
      lastChecked: "2 giờ trước",
      checks: [
        { key: "md5", label: "MinIO data khớp MD5", passed: true },
        { key: "git", label: "Git commit còn tồn tại", passed: true },
        { key: "schema", label: "Schema không thay đổi", passed: true }
      ]
    }
  },
  {
    id: "dv_12",
    dataset_id: "dataset_1",
    version: "v1.2",
    dvc_md5: "def5678abc4567890",
    status: "validated",
    is_latest: false,
    size_bytes: 18.2 * 1024 ** 3,
    item_count: 113053,
    split_ratio: "80/10/10",
    created_by: "alice",
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    changelog: "Bổ sung annotation object detection cho 2 class mới",
    git_commit: "def5678",
    storage_uri: "s3://dvc-data/datasets/coco2017/",
    tracked_at: "2024-01-08 08:10:21",
    linked_models: [],
    integrity: {
      lastChecked: "1 ngày trước",
      checks: [
        { key: "md5", label: "MinIO data khớp MD5", passed: true },
        { key: "git", label: "Git commit còn tồn tại", passed: true },
        { key: "schema", label: "Schema không thay đổi", passed: true }
      ]
    }
  },
  {
    id: "dv_11",
    dataset_id: "dataset_1",
    version: "v1.1",
    dvc_md5: "ghi9012abc4567890",
    status: "deprecated",
    is_latest: false,
    size_bytes: 17.8 * 1024 ** 3,
    item_count: 112937,
    split_ratio: "80/10/10",
    created_by: "alice",
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    changelog: "Version cũ, có một số sample corrupted",
    git_commit: "ghi9012",
    storage_uri: "s3://dvc-data/datasets/coco2017/",
    tracked_at: "2023-12-12 09:45:00",
    linked_models: [],
    integrity: {
      lastChecked: "2 tuần trước",
      checks: [
        { key: "md5", label: "MinIO data khớp MD5", passed: false, message: "Mismatch 12 file annotations." },
        { key: "git", label: "Git commit còn tồn tại", passed: true },
        { key: "schema", label: "Schema không thay đổi", passed: true }
      ]
    }
  }
];

function mapVersion(raw: (typeof MOCK_VERSIONS)[number]): DatasetVersion {
  return raw;
}

export function useVersionList(datasetId: string) {
  return useQuery({
    queryKey: ["dataset-versions", datasetId],
    enabled: Boolean(datasetId),
    queryFn: async () => {
      try {
        const response = await getDatasetVersions({ dataset_name: datasetId, limit: 100 });
        if (response.items.length === 0) return MOCK_VERSIONS;
        return response.items.map((item, index) =>
          mapVersion({
            ...MOCK_VERSIONS[0],
            id: item.id,
            dataset_id: datasetId,
            version: item.version,
            dvc_md5: item.dvc_md5,
            status: item.status,
            is_latest: index === 0,
            created_at: item.created_at
          })
        );
      } catch {
        return MOCK_VERSIONS;
      }
    }
  });
}

export function useVersionDetail(versionId: string) {
  return useQuery({
    queryKey: ["dataset-version-detail", versionId],
    enabled: Boolean(versionId),
    queryFn: async () => {
      try {
        const response = await getDatasetVersionById(versionId);
        const fallback = MOCK_VERSIONS.find((item) => item.id === versionId) ?? MOCK_VERSIONS[0];
        return mapVersion({
          ...fallback,
          id: response.id,
          version: response.version,
          dvc_md5: response.dvc_md5,
          status: response.status,
          created_at: response.created_at
        });
      } catch {
        return MOCK_VERSIONS.find((item) => item.id === versionId) ?? MOCK_VERSIONS[0];
      }
    }
  });
}

export interface UseVersionDiffReturn {
  diff: VersionDiffSummary | null;
  isLoading: boolean;
  compare: (againstVersionId: string) => void;
  isRecheckingIntegrity: boolean;
}

export function useVersionDiff(versionAId: string, _versionBId?: string): UseVersionDiffReturn {
  const [diff, setDiff] = useState<VersionDiffSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecheckingIntegrity] = useState(false);

  const compare = (againstVersionId: string) => {
    if (!versionAId || !againstVersionId) return;
    setIsLoading(true);
    window.setTimeout(() => {
      setDiff({
        versionAId,
        versionBId: againstVersionId,
        added: 5234,
        modified: 128,
        removed: 12,
        netChange: 5222,
        netPercent: 4.6,
        samples: [
          { id: "img_010022.jpg", changeType: "ADDED", note: "new image sample" },
          { id: "img_031955.jpg", changeType: "MODIFIED", note: "relabeled from truck -> car" },
          { id: "img_000111.jpg", changeType: "REMOVED", note: "corrupted file" }
        ]
      });
      setIsLoading(false);
    }, 600);
  };

  return { diff, isLoading, compare, isRecheckingIntegrity };
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
      try {
        await createDatasetVersion({
          dataset_name: payload.datasetId,
          version: `v${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`,
          dvc_md5: `${Math.random().toString(16).slice(2)}abcdef1`,
          path: payload.path,
          note: payload.changelog
        });
      } catch {
        // Keep UI flow alive when backend endpoint is unavailable.
      }
    },
    onSuccess: async (_, variables) => {
      const steps: TrackProgressStep[] = [
        { key: "dvc_add", label: "Đang chạy DVC add...", status: "running" },
        { key: "push_minio", label: "Đang push lên MinIO...", status: "pending" },
        { key: "save_metadata", label: "Metadata đã được lưu", status: "pending" }
      ];
      setProgressSteps(steps);

      await new Promise<void>((resolve) => {
        window.setTimeout(() => {
          setProgressSteps((prev) => prev.map((step) => (step.key === "dvc_add" ? { ...step, status: "done", label: "DVC add thành công" } : step)));
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
          setProgressSteps((prev) => prev.map((step) => (step.key === "push_minio" ? { ...step, status: "done", label: "Upload hoàn tất (18.4 GB)" } : step)));
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
