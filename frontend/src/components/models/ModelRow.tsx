"use client";

import Link from "next/link";
import { Button } from "@/components/ui";
import type { Model } from "@/types/model";

export function ModelRow({
  model,
  checked,
  onCheck,
  onDetail,
  onLoad
}: {
  model: Model;
  checked: boolean;
  onCheck: (id: string, value: boolean) => void;
  onDetail: (m: Model) => void;
  onLoad: (m: Model) => void;
}) {
  return (
    <button onClick={() => onDetail(model)} className="grid w-full grid-cols-[30px_1.7fr_1.2fr_0.8fr_0.7fr_0.8fr_0.7fr_70px_70px] items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-bg-elevated">
      <input type="checkbox" checked={checked} onChange={(e) => { e.stopPropagation(); onCheck(model.id, e.target.checked); }} />
      <span>
        <span className="block truncate font-medium text-text-primary">{model.name}</span>
        <span className="block truncate text-xs text-text-secondary">{model.description}</span>
      </span>
      <span className="text-xs text-text-secondary">{model.task_type.replaceAll("_", " ")}</span>
      <span className="text-xs text-text-secondary">{model.framework}</span>
      <span className="text-xs text-text-secondary">{(model.size_bytes / 1024 ** 2).toFixed(1)}MB</span>
      <span className="text-xs text-text-secondary">{model.primary_metric_value.toFixed(1)}%</span>
      <span className="text-xs text-text-secondary">{model.status}</span>
      <Button size="sm" className="bg-violet-50 text-violet-700 hover:bg-violet-100" onClick={(e) => { e.stopPropagation(); onLoad(model); }}>Load</Button>
      <Link
        href={`/models/${encodeURIComponent(model.name)}`}
        onClick={(e) => e.stopPropagation()}
        className="text-xs text-violet-700 hover:underline"
      >
        Registry
      </Link>
    </button>
  );
}
