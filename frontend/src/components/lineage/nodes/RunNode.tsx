"use client";

import { Handle, Position } from "@xyflow/react";
import { Zap } from "lucide-react";
import { RunStatusBadge } from "@/components/shared/RunStatusBadge";
import { cn } from "@/lib/utils/cn";
import type { RunNodeData } from "@/lib/lineage/transform";

export function RunNode({ data }: { data: RunNodeData }) {
  return (
    <div
      className={cn(
        "min-w-[170px] rounded-xl border-2 border-node-run/60 bg-white px-3 py-2.5 shadow-sm",
        data.isSelected && "border-node-run shadow-md shadow-violet-100",
        data.impacted && "border-red-400"
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-50">
          <Zap size={12} className="text-violet-600" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-700">Run</span>
        <RunStatusBadge status={data.status} size="sm" />
      </div>
      <p className="truncate text-[12px] font-medium text-slate-900">{data.name}</p>
      {data.primaryMetric ? (
        <p className="mt-0.5 text-[11px] text-slate-500">
          {data.primaryMetric.name}: <span className="font-semibold text-slate-900">{data.primaryMetric.value.toFixed(3)}</span>
        </p>
      ) : null}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
