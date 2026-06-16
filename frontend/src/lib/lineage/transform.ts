import type { Edge, Node } from "@xyflow/react";
import type { RunStatus, Stage } from "@/types/mlflow";

export type LineageNodeType = "dataset" | "run" | "model";

export interface DatasetNodeData extends Record<string, unknown> {
  id: string;
  datasetId?: string;
  versionId?: string;
  name: string;
  version: string;
  dvcMd5?: string;
  status: "draft" | "validated" | "deprecated";
  createdAt?: string;
  size?: string;
  items?: number;
  isSelected?: boolean;
  impacted?: boolean;
}

export interface RunNodeData extends Record<string, unknown> {
  id: string;
  name: string;
  status: RunStatus;
  startedAt?: string;
  user?: string;
  primaryMetric?: { name: string; value: number };
  isSelected?: boolean;
  impacted?: boolean;
}

export interface ModelNodeData extends Record<string, unknown> {
  id: string;
  modelId?: string;
  modelVersionId?: string;
  name: string;
  version: string;
  stage: Stage;
  accuracy?: number;
  owner?: string;
  isSelected?: boolean;
  impacted?: boolean;
}

export type LineageNodeData = DatasetNodeData | RunNodeData | ModelNodeData;

export interface LineageApiResponse {
  nodes: Array<{
    id: string;
    type: LineageNodeType;
    dataset_id?: string;
    version_id?: string;
    model_id?: string;
    model_version_id?: string;
    name: string;
    version?: string;
    stage?: Stage;
    status?: RunStatus | "draft" | "validated" | "deprecated";
    dvcMd5?: string;
    metrics?: Record<string, number>;
    created_at?: string;
    started_at?: string;
    user?: string;
    size?: string;
    items?: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    relation: "used_for_training" | "produced";
  }>;
}

export interface LineageGraphData {
  nodes: Node<LineageNodeData>[];
  edges: Edge[];
}

export function formatVersionLabel(version: string | number | undefined): string {
  if (version === undefined || version === null || version === "") return "v1";
  const value = String(version);
  return value.toLowerCase().startsWith("v") ? value : `v${value}`;
}

function toDatasetData(item: LineageApiResponse["nodes"][number]): DatasetNodeData {
  return {
    id: item.id,
    datasetId: item.dataset_id,
    versionId: item.version_id,
    name: item.name,
    version: item.version ?? "v1.0",
    dvcMd5: item.dvcMd5,
    status: (item.status as DatasetNodeData["status"]) ?? "validated",
    createdAt: item.created_at,
    size: item.size,
    items: item.items
  };
}

function toRunData(item: LineageApiResponse["nodes"][number]): RunNodeData {
  const metrics = item.metrics ?? {};
  const primaryName = Object.keys(metrics)[0];
  return {
    id: item.id,
    name: item.name,
    status: (item.status as RunStatus) ?? "FINISHED",
    startedAt: item.started_at,
    user: item.user,
    primaryMetric: primaryName ? { name: primaryName, value: metrics[primaryName] } : undefined
  };
}

function toModelData(item: LineageApiResponse["nodes"][number]): ModelNodeData {
  return {
    id: item.id,
    modelId: item.model_id,
    modelVersionId: item.model_version_id,
    name: item.name,
    version: item.version ?? "1",
    stage: item.stage ?? "None",
    accuracy: item.metrics?.accuracy,
    owner: item.user
  };
}

export function transformLineageResponse(response: LineageApiResponse): LineageGraphData {
  const nodes: Node<LineageNodeData>[] = response.nodes.map((item) => {
    if (item.type === "dataset") return { id: item.id, type: "dataset", position: { x: 0, y: 0 }, data: toDatasetData(item) };
    if (item.type === "run") return { id: item.id, type: "run", position: { x: 0, y: 0 }, data: toRunData(item) };
    return { id: item.id, type: "model", position: { x: 0, y: 0 }, data: toModelData(item) };
  });

  const edges: Edge[] = response.edges.map((edge) => {
    const datasetToRun = edge.relation === "used_for_training";
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      animated: false,
      label: datasetToRun ? "used for training" : "produced",
      style: datasetToRun ? { stroke: "#06B6D4", strokeDasharray: "5 4", strokeWidth: 1.8 } : { stroke: "#6366F1", strokeWidth: 2 },
      labelStyle: { fontSize: 10, fill: "#475569" }
    };
  });

  return { nodes, edges };
}

export function createMockLineageData(): LineageGraphData {
  return transformLineageResponse({
    nodes: [
      { id: "dataset_coco_v13", type: "dataset", name: "COCO 2017 Detection", version: "v1.3", dvcMd5: "abc1234def456", status: "validated", size: "18.7 GB", items: 118287, created_at: new Date().toISOString() },
      { id: "dataset_coco_v12", type: "dataset", name: "COCO 2017 Detection", version: "v1.2", dvcMd5: "def5678aaa111", status: "validated", size: "18.2 GB", items: 113000, created_at: new Date().toISOString() },
      { id: "run_resnet_0115", type: "run", name: "run_2024_01_15", status: "FINISHED", metrics: { accuracy: 0.924 }, started_at: new Date().toISOString(), user: "alice" },
      { id: "run_yolo_0210", type: "run", name: "run_2024_02_10", status: "FINISHED", metrics: { mAP: 0.783 }, started_at: new Date().toISOString(), user: "bob" },
      { id: "model_resnet_v13", type: "model", name: "resnet50-custom", version: "1.3", stage: "Production", metrics: { accuracy: 0.924 }, user: "alice" },
      { id: "model_yolo_v21", type: "model", name: "yolov8-nano", version: "2.1", stage: "Staging", metrics: { mAP: 0.783 }, user: "bob" }
    ],
    edges: [
      { id: "e1", source: "dataset_coco_v13", target: "run_resnet_0115", relation: "used_for_training" },
      { id: "e2", source: "dataset_coco_v12", target: "run_yolo_0210", relation: "used_for_training" },
      { id: "e3", source: "run_resnet_0115", target: "model_resnet_v13", relation: "produced" },
      { id: "e4", source: "run_yolo_0210", target: "model_yolo_v21", relation: "produced" }
    ]
  });
}
