"use client";

import { Handle, Position } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";
import { StageBadge } from "@/components/shared/StageBadge";
import { cn } from "@/lib/utils/cn";
import type { ModelNodeData } from "@/lib/lineage/transform";

export function ModelNode({ data }: { data: ModelNodeData }) {
  return (
    <div
      className={cn(
        "min-w-[170px] rounded-xl border-2 bg-white px-3 py-2.5 shadow-sm",
        data.stage === "Production" ? "border-emerald-400" : "border-node-model/60",
        data.isSelected && "shadow-md shadow-indigo-100",
        data.impacted && "border-red-400"
      )}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-50 text-sm">🧠</div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">Model</span>
        </div>
        <StageBadge stage={data.stage} size="sm" />
      </div>
      <p className="truncate text-[12px] font-medium text-slate-900">{data.name}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">v{data.version}</p>
      {data.impacted ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-red-600">
          <AlertTriangle size={12} />
          Impacted
        </p>
      ) : null}
      <Handle type="target" position={Position.Left} />
    </div>
  );
}
