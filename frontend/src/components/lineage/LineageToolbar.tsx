"use client";

import { useMemo, useState } from "react";
import type { LineageNodeType } from "@/lib/lineage/transform";

interface NodeOption {
  id: string;
  name: string;
  version: string;
  type: LineageNodeType;
}

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
  onFilterChange: (modelName: string, version: string) => void;
  nodeOptions: NodeOption[];
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
  onFilterChange,
  nodeOptions
}: LineageToolbarProps) {
  const [selectedModelName, setSelectedModelName] = useState<string>("");
  const [selectedVersion, setSelectedVersion] = useState<string>("");

  // Filter to the current rootType only
  const typeOptions = nodeOptions.filter((node) => node.type === rootType);

  // Unique model names (no duplicates)
  const uniqueModelNames = useMemo(() => {
    const seen = new Set<string>();
    typeOptions.forEach((o) => seen.add(o.name));
    return Array.from(seen).sort();
  }, [typeOptions]);

  // Versions available for the selected model name
  const availableVersions = useMemo(() => {
    if (!selectedModelName) return [];
    const versions = typeOptions
      .filter((o) => o.name === selectedModelName && o.version)
      .map((o) => o.version)
      .sort();
    return versions;
  }, [typeOptions, selectedModelName]);

  const hasVersions = availableVersions.length > 0;
  const versionDisabled = !selectedModelName;

  // When model name changes → reset version and resolve new rootId
  const handleModelNameChange = (name: string) => {
    setSelectedModelName(name);
    setSelectedVersion("");
    onFilterChange(name, "");
    if (!name) {
      onRootIdChange("");
      return;
    }
    // If only 1 exact node matches (no versioning), select it directly
    const matches = typeOptions.filter((o) => o.name === name);
    if (matches.length === 1 && !matches[0].version) {
      onRootIdChange(matches[0].id);
    } else {
      // Multiple versions exist → clear rootId (client-side filtering handles display)
      onRootIdChange("");
    }
  };

  // When version changes → resolve rootId from name+version pair
  const handleVersionChange = (version: string) => {
    setSelectedVersion(version);
    onFilterChange(selectedModelName, version);
    if (!version) {
      // "All versions" — client-side filtering handles display
      onRootIdChange("");
      return;
    }
    const match = typeOptions.find((o) => o.name === selectedModelName && o.version === version);
    onRootIdChange(match?.id ?? "");
  };

  // Sync internal reset when parent calls onReset
  const handleReset = () => {
    setSelectedModelName("");
    setSelectedVersion("");
    onFilterChange("", "");
    onReset();
  };

  const entityLabel = rootType === "dataset" ? "datasets" : "models";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-bg-surface px-3 py-2">
      {/* Entity type */}
      <select
        value={rootType}
        onChange={(e) => {
          onRootTypeChange(e.target.value as "dataset" | "model");
          setSelectedModelName("");
          setSelectedVersion("");
          onFilterChange("", "");
        }}
        className="h-9 rounded-md border border-border bg-white px-2 text-sm"
      >
        <option value="dataset">Dataset</option>
        <option value="model">Model</option>
      </select>

      {/* Model / Dataset Name dropdown */}
      <select
        value={selectedModelName}
        onChange={(e) => handleModelNameChange(e.target.value)}
        className="h-9 min-w-[180px] rounded-md border border-border bg-white px-2 text-sm"
      >
        <option value="">All {entityLabel}</option>
        {uniqueModelNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      {/* Version dropdown — disabled when no model is chosen */}
      <div
        title={versionDisabled ? "Chọn một model để lọc theo version" : undefined}
        className="relative"
      >
        <select
          value={selectedVersion}
          onChange={(e) => handleVersionChange(e.target.value)}
          disabled={versionDisabled}
          className={[
            "h-9 min-w-[130px] rounded-md border border-border bg-white px-2 text-sm transition-opacity",
            versionDisabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
          ].join(" ")}
        >
          <option value="">All versions</option>
          {hasVersions
            ? availableVersions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))
            : null}
        </select>
      </div>

      {/* Depth */}
      <select
        value={depth}
        onChange={(e) => onDepthChange(Number(e.target.value))}
        className="h-9 rounded-md border border-border bg-white px-2 text-sm"
      >
        {[1, 2, 3, 4].map((value) => (
          <option key={value} value={value}>
            Depth: {value}
          </option>
        ))}
      </select>

      {/* Highlight path */}
      <label className="ml-1 flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={highlightPath} onChange={(e) => onToggleHighlightPath(e.target.checked)} />
        Highlight path
      </label>

      {/* Reset */}
      <button type="button" onClick={handleReset} className="ml-auto h-9 rounded-md border border-border px-3 text-sm hover:bg-bg-elevated">
        Reset
      </button>
    </div>
  );
}
