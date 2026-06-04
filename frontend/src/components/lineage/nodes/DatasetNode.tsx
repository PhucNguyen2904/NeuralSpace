"use client";

import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils/cn";
import type { DatasetNodeData } from "@/lib/lineage/transform";

export function DatasetNode({ data }: { data: DatasetNodeData }) {
  return (
    <div
      className={cn(
        "min-w-[170px] rounded-xl border-2 border-node-dataset/60 bg-white px-3 py-2.5 shadow-sm",
        data.isSelected && "border-node-dataset shadow-md shadow-cyan-100",
        data.impacted && "border-red-400"
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-50 text-sm">📊</div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700">Dataset</span>
      </div>
      <p className="truncate text-[13px] font-medium text-slate-900">{data.name}</p>
      <p className="mt-0.5 font-mono text-[11px] text-slate-500">
        {data.version} • {data.dvcMd5?.slice(0, 7) ?? "no-hash"}
      </p>
      <div className="mt-1.5">
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            data.status === "validated" ? "bg-emerald-50 text-emerald-700" : data.status === "deprecated" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
          )}
        >
          {data.status}
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
