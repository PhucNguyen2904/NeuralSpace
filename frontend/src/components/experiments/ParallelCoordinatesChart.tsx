import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend } from "recharts";
import type { RunDetailData } from "@/lib/hooks/useExperiments";

interface ParallelCoordinatesChartProps {
  runs: RunDetailData[];
}

export function ParallelCoordinatesChart({ runs }: ParallelCoordinatesChartProps) {
  const metrics = ["accuracy", "loss", "f1_score"];
  const data = metrics.map((metric) => {
    const row: Record<string, number | string> = { metric };
    runs.forEach((run) => {
      row[run.run_id] = run.metricsMap[metric] ?? 0;
    });
    return row;
  });

  const colors = ["#6366F1", "#10B981", "#F59E0B", "#EF4444"];

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-sm font-medium">Parallel Coordinates (Radar fallback)</p>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <RadarChart data={data}>
            <PolarGrid />
            <PolarAngleAxis dataKey="metric" />
            <PolarRadiusAxis />
            {runs.map((run, index) => (
              <Radar
                key={run.run_id}
                name={run.name ?? run.run_id}
                dataKey={run.run_id}
                stroke={colors[index % colors.length]}
                fill={colors[index % colors.length]}
                fillOpacity={0.12}
              />
            ))}
            <Legend />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
