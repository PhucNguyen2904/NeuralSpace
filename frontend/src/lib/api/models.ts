import { subDays, subHours } from "date-fns";
import { apiClient } from "@/lib/api/client";
import type { PaginatedResponse } from "@/types/api";
import type { Model, ModelDetail, ModelFramework, ModelListParams, ModelMetrics, ModelStatus, ModelVersion, TaskType } from "@/types/model";

const MB = 1024 * 1024;
const GB = 1024 * MB;
const now = new Date();

const mk = (
  id: string,
  name: string,
  framework: ModelFramework,
  task: TaskType,
  status: ModelStatus,
  metricName: string,
  metricValue: number,
  sizeBytes: number
): Model => ({
  id,
  name,
  description: `${task.replaceAll("_", " ")} model for production workloads`,
  architecture: name,
  framework,
  task_type: task,
  status,
  size_bytes: sizeBytes,
  parameter_count: Math.round(sizeBytes / 14),
  primary_metric_name: metricName,
  primary_metric_value: metricValue,
  all_metrics: { [metricName]: metricValue, precision: metricValue - 2, recall: metricValue - 1.2 },
  tags: ["vision", "benchmark"],
  created_by: "alice@company.com",
  created_at: subDays(now, 120).toISOString(),
  updated_at: subHours(now, Number(id.replace("m_", "")) * 6).toISOString(),
  version: "v1.0",
  storage_path: `/models/${name.toLowerCase().replaceAll(" ", "-")}`
});

export const mockModels: Model[] = [
  mk("m_1", "ResNet-50", "pytorch", "image_classification", "ready", "Accuracy", 92.4, 245 * MB),
  mk("m_2", "EfficientNet-B0", "pytorch", "image_classification", "trained", "Accuracy", 93.1, 74 * MB),
  mk("m_3", "YOLOv8-nano", "pytorch", "object_detection", "ready", "mAP", 78.3, 6.3 * MB),
  mk("m_4", "Mask2Former-S", "tensorflow", "semantic_segmentation", "training", "mIoU", 71.2, 1.3 * GB),
  mk("m_5", "BERT-base-uncased", "huggingface", "text_classification", "training", "Accuracy", 89.1, 438 * MB),
  mk("m_6", "GPT2-small-vn", "huggingface", "text_generation", "trained", "BLEU", 35.7, 512 * MB),
  mk("m_7", "UNet-Lite", "onnx", "semantic_segmentation", "ready", "mIoU", 68.9, 92 * MB),
  mk("m_8", "XGBoost-Regressor", "sklearn", "regression", "ready", "R2", 91.4, 22 * MB),
  mk("m_9", "MobileNet-v3", "tensorflow", "image_classification", "failed", "Accuracy", 90.8, 21 * MB),
  mk("m_10", "Detr-Tiny", "onnx", "object_detection", "trained", "mAP", 72.5, 780 * MB)
];

function applyFilter(items: Model[], params: ModelListParams): Model[] {
  let r = [...items];
  if (params.search) {
    const q = params.search.toLowerCase();
    r = r.filter((m) => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q));
  }
  if (params.framework?.length) r = r.filter((m) => params.framework?.includes(m.framework));
  if (params.task_type?.length) r = r.filter((m) => params.task_type?.includes(m.task_type));
  if (params.status) r = r.filter((m) => m.status === params.status);
  if (typeof params.min_metric === "number") r = r.filter((m) => m.primary_metric_value >= params.min_metric!);
  if (params.size_category === "small") r = r.filter((m) => m.size_bytes < 100 * MB);
  if (params.size_category === "medium") r = r.filter((m) => m.size_bytes >= 100 * MB && m.size_bytes <= GB);
  if (params.size_category === "large") r = r.filter((m) => m.size_bytes > GB);
  if (params.sort === "newest") r.sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
  if (params.sort === "oldest") r.sort((a, b) => +new Date(a.updated_at) - +new Date(b.updated_at));
  if (params.sort === "name") r.sort((a, b) => a.name.localeCompare(b.name));
  if (params.sort === "accuracy") r.sort((a, b) => b.primary_metric_value - a.primary_metric_value);
  return r;
}

export async function getModels(params: ModelListParams): Promise<PaginatedResponse<Model>> {
  try {
    const response = await apiClient.get<PaginatedResponse<Model>>("/v1/models", { params });
    return response.data;
  } catch {
    const page = params.page ?? 1;
    const limit = params.limit ?? 18;
    const filtered = applyFilter(mockModels, params);
    return { items: filtered.slice((page - 1) * limit, page * limit), total: filtered.length, page, pageSize: limit };
  }
}

export async function getModelById(id: string): Promise<ModelDetail> {
  try {
    const response = await apiClient.get<ModelDetail>(`/v1/models/${id}`);
    return response.data;
  } catch {
    const base = mockModels.find((m) => m.id === id);
    if (!base) throw new Error("Model not found");
    return {
      ...base,
      framework_version: base.framework === "pytorch" ? "2.3.0" : "1.0.0",
      input_shape: "224 x 224 x 3",
      output_shape: base.task_type === "regression" ? "1 value" : "1000 classes",
      files: [
        { name: "model.pt", size: `${Math.round(base.size_bytes / MB)} MB`, type: "Weights" },
        { name: "config.json", size: "2.3 KB", type: "Config" },
        { name: "training_log.csv", size: "156 KB", type: "Logs" }
      ]
    };
  }
}

export async function getModelMetrics(id: string): Promise<ModelMetrics> {
  try {
    const response = await apiClient.get<ModelMetrics>(`/v1/models/${id}/metrics`);
    return response.data;
  } catch {
    return {
      training_history: Array.from({ length: 50 }).map((_, i) => ({
        epoch: i + 1,
        train_loss: Math.max(0.1, 2.4 - i * 0.04),
        val_loss: Math.max(0.12, 2.2 - i * 0.035),
        train_accuracy: Math.min(99, 52 + i * 0.9),
        val_accuracy: Math.min(97, 50 + i * 0.85)
      })),
      confusion_matrix: [
        [95, 2, 1, 0, 2],
        [3, 89, 5, 1, 2],
        [1, 3, 91, 2, 3],
        [0, 1, 2, 96, 1],
        [2, 1, 2, 1, 94]
      ],
      class_names: ["cat", "dog", "car", "bus", "other"],
      final_metrics: { "Top-1 Acc": 92.4, "Top-5 Acc": 98.1, Precision: 94.2 }
    };
  }
}

export async function loadModelToWorkspace(modelId: string, workspaceId: string, mountPath: string): Promise<void> {
  try {
    await apiClient.post(`/v1/workspaces/${workspaceId}/load-model`, { model_id: modelId, mount_path: mountPath });
  } catch {
    return Promise.resolve();
  }
}

export async function getModelVersions(modelId: string): Promise<ModelVersion[]> {
  try {
    const response = await apiClient.get<ModelVersion[]>(`/v1/models/${modelId}/versions`);
    return response.data;
  } catch {
    return [
      { id: "v13", version: "v1.3", note: "Fine-tuned on custom dataset, +2.1% accuracy", created_at: subDays(now, 3).toISOString(), current: true },
      { id: "v12", version: "v1.2", note: "Reduced overfitting with dropout", created_at: subDays(now, 7).toISOString() },
      { id: "v11", version: "v1.1", note: "Initial training complete", created_at: subDays(now, 14).toISOString() }
    ];
  }
}
