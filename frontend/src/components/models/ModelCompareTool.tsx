"use client";

import { Legend, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui";
import type { Model } from "@/types/model";

const chartColors = ["#8B5CF6", "#10B981", "#F59E0B", "#3B82F6"];

export function ModelCompareTool({
  selected,
  onClear
}: {
  selected: Model[];
  onClear: () => void;
}) {
  if (selected.length < 2) return null;
  const chartModels = selected.slice(0, 4);
  const radar = [
    {
      metric: "Accuracy",
      ...Object.fromEntries(chartModels.map((model) => [model.id, normalizePercent(model.primary_metric_value)]))
    },
    {
      metric: "Params",
      ...Object.fromEntries(chartModels.map((model) => [model.id, clampScore(100 - model.parameter_count / 1_000_000)]))
    },
    {
      metric: "Size",
      ...Object.fromEntries(chartModels.map((model) => [model.id, clampScore(100 - (model.size_bytes / 1024 ** 3) * 20)]))
    }
  ];

  return (
    <div className="fixed inset-x-4 bottom-4 z-40 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-bg-surface p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium text-text-primary" title={selected.map((m) => m.name).join(" vs ")}>
          Compare {selected.map((m) => m.name).join(" vs ")}
        </p>
        <Button size="sm" variant="ghost" onClick={onClear}>Clear all</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="overflow-x-auto">
          <table className="min-w-[520px] w-full text-xs">
            <thead><tr className="text-left text-text-tertiary"><th className="py-1 pr-3">METRIC</th>{selected.map((m) => <th key={m.id} className="max-w-28 truncate px-2 py-1" title={m.name}>{m.name}</th>)}</tr></thead>
            <tbody>
              <tr><td className="py-1 pr-3">Accuracy</td>{selected.map((m) => <td key={m.id} className="px-2 py-1">{normalizePercent(m.primary_metric_value).toFixed(1)}%</td>)}</tr>
              <tr><td className="py-1 pr-3">Parameters</td>{selected.map((m) => <td key={m.id} className="px-2 py-1">{(m.parameter_count / 1_000_000).toFixed(1)}M</td>)}</tr>
              <tr><td className="py-1 pr-3">Model Size</td>{selected.map((m) => <td key={m.id} className="px-2 py-1">{(m.size_bytes / 1024 ** 2).toFixed(1)} MB</td>)}</tr>
              <tr><td className="py-1 pr-3">Framework</td>{selected.map((m) => <td key={m.id} className="px-2 py-1">{m.framework}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <div className="h-64 min-w-0 overflow-hidden rounded-md bg-bg-elevated/40 p-2">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart outerRadius="70%" data={radar}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} />
              <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "Score"]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {chartModels.map((model, index) => (
                <Radar
                  key={model.id}
                  name={model.name}
                  dataKey={model.id}
                  stroke={chartColors[index % chartColors.length]}
                  fill={chartColors[index % chartColors.length]}
                  fillOpacity={0.12}
                />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function normalizePercent(value: number) {
  return value <= 1 ? value * 100 : value;
}

function clampScore(value: number) {
  return Math.max(1, Math.min(100, value));
}
