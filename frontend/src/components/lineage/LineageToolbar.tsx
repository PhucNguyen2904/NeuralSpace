"use client";

import type { LineageNodeType } from "@/lib/lineage/transform";

interface LineageToolbarProps {
  rootType: "dataset" | "model";
  rootId: string;
  depth: number;
  highlightPath: boolean;
  onRootTypeChange: (value: "dataset" | "model") => void;
  onRootIdChange: (value: string) => void;
  onDepthChange: (value: number) => void;
  onToggleHighlightPath: (value: boolean) => void;
  onReset: () => void;
  nodeOptions: Array<{ id: string; name: string; type: LineageNodeType }>;
}

export function LineageToolbar({
  rootType,
  rootId,
  depth,
  highlightPath,
  onRootTypeChange,
  onRootIdChange,
  onDepthChange,
  onToggleHighlightPath,
  onReset,
  nodeOptions
}: LineageToolbarProps) {
  const options = nodeOptions.filter((node) => node.type === rootType);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-bg-surface px-3 py-2">
      <select value={rootType} onChange={(event) => onRootTypeChange(event.target.value as "dataset" | "model")} className="h-9 rounded-md border border-border bg-white px-2 text-sm">
        <option value="dataset">Dataset</option>
        <option value="model">Model</option>
      </select>
      <select value={rootId} onChange={(event) => onRootIdChange(event.target.value)} className="h-9 min-w-[180px] rounded-md border border-border bg-white px-2 text-sm">
        {options.map((node) => (
          <option key={node.id} value={node.id}>
            {node.name}
          </option>
        ))}
      </select>
      <select value={depth} onChange={(event) => onDepthChange(Number(event.target.value))} className="h-9 rounded-md border border-border bg-white px-2 text-sm">
        {[1, 2, 3, 4].map((value) => (
          <option key={value} value={value}>
            Depth: {value}
          </option>
        ))}
      </select>
      <label className="ml-1 flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={highlightPath} onChange={(event) => onToggleHighlightPath(event.target.checked)} />
        Highlight path
      </label>
      <button type="button" onClick={onReset} className="ml-auto h-9 rounded-md border border-border px-3 text-sm hover:bg-bg-elevated">
        Reset
      </button>
    </div>
  );
}
