import { subDays, subHours } from "date-fns";
import { apiClient } from "@/lib/api/client";
import type { PaginatedResponse } from "@/types/api";
import type { Dataset, DatasetListParams, DatasetPreview } from "@/types/dataset";

const now = new Date();
const MB = 1024 * 1024;
const GB = 1024 * MB;

export const mockDatasets: Dataset[] = [
  { id: "ds_1", name: "COCO 2017 Detection", description: "Object detection · 80 classes", type: "image", label_status: "labeled", size_bytes: 18.7 * GB, item_count: 118287, class_count: 80, tags: ["computer-vision", "benchmark"], created_by: "alice@company.com", created_at: subDays(now, 480).toISOString(), updated_at: subDays(now, 3).toISOString(), storage_path: "/datasets/coco-2017" },
  { id: "ds_2", name: "Cityscapes Segmentation", description: "Urban scene segmentation dataset", type: "image", label_status: "labeled", size_bytes: 11.2 * GB, item_count: 25000, class_count: 30, tags: ["computer-vision", "segmentation"], created_by: "linh@company.com", created_at: subDays(now, 240).toISOString(), updated_at: subDays(now, 7).toISOString(), storage_path: "/datasets/cityscapes" },
  { id: "ds_3", name: "Retail Shelf OCR", description: "Receipt and shelf text extraction", type: "image", label_status: "processing", size_bytes: 5.4 * GB, item_count: 42000, tags: ["ocr", "custom"], created_by: "minh@company.com", created_at: subDays(now, 41).toISOString(), updated_at: subDays(now, 2).toISOString(), storage_path: "/datasets/retail-ocr" },
  { id: "ds_4", name: "ViNews Sentiment", description: "Vietnamese sentiment corpus", type: "text", label_status: "labeled", size_bytes: 780 * MB, item_count: 450000, class_count: 3, tags: ["nlp", "benchmark"], created_by: "data@company.com", created_at: subDays(now, 120).toISOString(), updated_at: subDays(now, 9).toISOString(), storage_path: "/datasets/vinews-sentiment" },
  { id: "ds_5", name: "Customer Support Chat", description: "Intent and entity extraction", type: "text", label_status: "unlabeled", size_bytes: 1.3 * GB, item_count: 980000, tags: ["nlp", "custom"], created_by: "ops@company.com", created_at: subDays(now, 15).toISOString(), updated_at: subDays(now, 1).toISOString(), storage_path: "/datasets/support-chat" },
  { id: "ds_6", name: "Wiki QA Pairs", description: "Question answering benchmark", type: "text", label_status: "labeled", size_bytes: 620 * MB, item_count: 300000, tags: ["nlp", "benchmark"], created_by: "alice@company.com", created_at: subDays(now, 300).toISOString(), updated_at: subDays(now, 10).toISOString(), storage_path: "/datasets/wiki-qa" },
  { id: "ds_7", name: "Iris Dataset", description: "Classic classification dataset", type: "tabular", label_status: "labeled", size_bytes: 4.5 * MB, item_count: 150, class_count: 3, tags: ["tabular", "benchmark"], created_by: "bot@company.com", created_at: subDays(now, 900).toISOString(), updated_at: subDays(now, 40).toISOString(), storage_path: "/datasets/iris" },
  { id: "ds_8", name: "Fraud Transaction 2025", description: "Structured fraud features", type: "tabular", label_status: "processing", size_bytes: 2.4 * GB, item_count: 3400000, tags: ["tabular", "finance", "custom"], created_by: "risk@company.com", created_at: subDays(now, 21).toISOString(), updated_at: subDays(now, 1).toISOString(), storage_path: "/datasets/fraud-2025" },
  { id: "ds_9", name: "E-Commerce Product Feed", description: "Catalog snapshots and attributes", type: "tabular", label_status: "unlabeled", size_bytes: 970 * MB, item_count: 2100000, tags: ["tabular", "custom"], created_by: "catalog@company.com", created_at: subDays(now, 5).toISOString(), updated_at: subHours(now, 18).toISOString(), storage_path: "/datasets/catalog-feed" },
  { id: "ds_10", name: "Call Center Audio VI", description: "Speech recognition training data", type: "audio", label_status: "labeled", size_bytes: 6.7 * GB, item_count: 72000, tags: ["audio", "asr"], created_by: "speech@company.com", created_at: subDays(now, 80).toISOString(), updated_at: subDays(now, 6).toISOString(), storage_path: "/datasets/call-audio" },
  { id: "ds_11", name: "TrafficCam Clips", description: "Vehicle tracking video clips", type: "video", label_status: "processing", size_bytes: 44 * GB, item_count: 8300, tags: ["video", "computer-vision"], created_by: "vision@company.com", created_at: subDays(now, 12).toISOString(), updated_at: subDays(now, 2).toISOString(), storage_path: "/datasets/trafficcam" },
  { id: "ds_12", name: "Medical Scan Mini", description: "Anonymized CT slices for triage", type: "image", label_status: "unlabeled", size_bytes: 3.2 * GB, item_count: 26000, tags: ["medical", "computer-vision"], created_by: "research@company.com", created_at: subDays(now, 33).toISOString(), updated_at: subDays(now, 4).toISOString(), storage_path: "/datasets/medical-mini" }
];

function applyLocalFilter(items: Dataset[], params: DatasetListParams) {
  let filtered = [...items];
  if (params.search) {
    const q = params.search.toLowerCase();
    filtered = filtered.filter((d) => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q));
  }
  if (params.type?.length) filtered = filtered.filter((d) => params.type?.includes(d.type));
  if (params.status) filtered = filtered.filter((d) => d.label_status === params.status);
  if (typeof params.size_min === "number") {
    const min = params.size_min;
    filtered = filtered.filter((d) => d.size_bytes >= min);
  }
  if (typeof params.size_max === "number") {
    const max = params.size_max;
    filtered = filtered.filter((d) => d.size_bytes <= max);
  }
  if (params.tags?.length) filtered = filtered.filter((d) => params.tags?.every((t) => d.tags.includes(t)));
  if (params.created_after) filtered = filtered.filter((d) => new Date(d.created_at) >= new Date(params.created_after as string));
  if (params.sort === "newest") filtered.sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
  if (params.sort === "oldest") filtered.sort((a, b) => +new Date(a.updated_at) - +new Date(b.updated_at));
  if (params.sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));
  if (params.sort === "size") filtered.sort((a, b) => b.size_bytes - a.size_bytes);
  return filtered;
}

export async function getDatasets(params: DatasetListParams): Promise<PaginatedResponse<Dataset>> {
  try {
    const response = await apiClient.get<PaginatedResponse<Dataset>>("/v1/datasets", { params });
    return response.data;
  } catch {
    const page = params.page ?? 1;
    const limit = params.limit ?? 24;
    const filtered = applyLocalFilter(mockDatasets, params);
    return { items: filtered.slice((page - 1) * limit, page * limit), total: filtered.length, page, pageSize: limit };
  }
}

export async function getDatasetById(id: string): Promise<Dataset> {
  try {
    const response = await apiClient.get<Dataset>(`/v1/datasets/${id}`);
    return response.data;
  } catch {
    const dataset = mockDatasets.find((d) => d.id === id);
    if (!dataset) throw new Error("Dataset not found");
    return dataset;
  }
}

export async function getDatasetPreview(id: string): Promise<DatasetPreview> {
  try {
    const response = await apiClient.get<DatasetPreview>(`/v1/datasets/${id}/preview`);
    return response.data;
  } catch {
    const dataset = mockDatasets.find((d) => d.id === id);
    if (!dataset) return { samples: [] };
    if (dataset.type === "tabular") {
      return {
        samples: Array.from({ length: 10 }).map((_, idx) => ({ id: `row_${idx}`, content: `row ${idx + 1}` })),
        column_info: [{ name: "age", type: "numeric" }, { name: "city", type: "text" }, { name: "created_at", type: "date" }]
      };
    }
    return {
      samples: Array.from({ length: 12 }).map((_, idx) => ({ id: `sample_${idx}`, content: `Sample ${idx + 1}`, thumbnail_url: `https://picsum.photos/seed/${id}-${idx}/320/220` })),
      class_distribution: { person: 31221, car: 28900, road: 17122, bike: 4500, bus: 2190, dog: 1800, cat: 1320, sign: 1110, bench: 970, backpack: 822, lamp: 601 },
      split_info: { train: 70, val: 20, test: 10 }
    };
  }
}

export async function mountDatasetToWorkspace(datasetId: string, workspaceId: string): Promise<void> {
  try {
    await apiClient.post(`/v1/workspaces/${workspaceId}/mount-dataset`, { dataset_id: datasetId });
  } catch {
    return Promise.resolve();
  }
}
