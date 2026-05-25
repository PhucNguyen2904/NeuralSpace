"use client";

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui";
import type { Model } from "@/types/model";

export function ModelCompareTool({
  selected,
  onClear
}: {
  selected: Model[];
  onClear: () => void;
}) {
  if (selected.length < 2) return null;
  const radar = selected.map((m) => ({
    name: m.name,
    Accuracy: m.primary_metric_value,
    Params: Math.max(1, 100 - m.parameter_count / 1_000_000),
    Size: Math.max(1, 100 - m.size_bytes / 1024 ** 3 * 20)
  }));
  return (
    <div className="fixed inset-x-4 bottom-4 z-40 rounded-lg border border-border bg-bg-surface p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-text-primary">So sánh {selected.map((m) => m.name).join(" vs ")}</p>
        <Button size="sm" variant="ghost" onClick={onClear}>Xóa tất cả</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-text-tertiary"><th>METRIC</th>{selected.map((m) => <th key={m.id}>{m.name}</th>)}</tr></thead>
            <tbody>
              <tr><td>Accuracy</td>{selected.map((m) => <td key={m.id}>{m.primary_metric_value.toFixed(1)}%</td>)}</tr>
              <tr><td>Parameters</td>{selected.map((m) => <td key={m.id}>{(m.parameter_count / 1_000_000).toFixed(1)}M</td>)}</tr>
              <tr><td>Model Size</td>{selected.map((m) => <td key={m.id}>{(m.size_bytes / 1024 ** 2).toFixed(1)}MB</td>)}</tr>
              <tr><td>Framework</td>{selected.map((m) => <td key={m.id}>{m.framework}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart outerRadius={80} data={radar}>
              <PolarGrid />
              <PolarAngleAxis dataKey="name" tick={{ fontSize: 10 }} />
              <Radar dataKey="Accuracy" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.25} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
