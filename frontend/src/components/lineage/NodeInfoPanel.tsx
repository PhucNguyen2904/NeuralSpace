"use client";

import type { Node } from "@xyflow/react";
import { formatVersionLabel } from "@/lib/lineage/transform";
import type { DatasetNodeData, LineageNodeData, ModelNodeData, RunNodeData } from "@/lib/lineage/transform";

export function NodeInfoPanel({ node }: { node: Node<LineageNodeData> | null }) {
  if (!node) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-bg-surface p-3 text-sm text-slate-500">
        Select a node to view details.
      </div>
    );
  }

  if (node.type === "dataset") {
    const data = node.data as DatasetNodeData;
    return (
      <div className="space-y-2 rounded-xl border border-border bg-white p-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">Dataset</p>
        <p className="font-medium text-slate-900">{data.name}</p>
        <p className="text-slate-600">
          {data.version} • {data.status}
        </p>
        <p className="font-mono text-xs text-slate-500">{data.dvcMd5}</p>
      </div>
    );
  }

  if (node.type === "run") {
    const data = node.data as RunNodeData;
    return (
      <div className="space-y-2 rounded-xl border border-border bg-white p-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Run</p>
        <p className="font-medium text-slate-900">{data.name}</p>
        <p className="text-slate-600">{data.status}</p>
        {data.primaryMetric ? <p className="text-slate-600">{data.primaryMetric.name}: {data.primaryMetric.value.toFixed(4)}</p> : null}
      </div>
    );
  }

  const data = node.data as ModelNodeData;
  return (
    <div className="space-y-2 rounded-xl border border-border bg-white p-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Model</p>
      <p className="font-medium text-slate-900">{data.name}</p>
      <p className="text-slate-600">
        {formatVersionLabel(data.version)} • {data.stage}
      </p>
      {typeof data.accuracy === "number" ? <p className="text-slate-600">Accuracy: {data.accuracy.toFixed(3)}</p> : null}
    </div>
  );
}
