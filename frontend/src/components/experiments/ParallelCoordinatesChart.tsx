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
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-tertiary">Metrics Radar</h3>
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: "#64748b", fontSize: 12 }} />
            <PolarRadiusAxis angle={30} domain={[0, (dataMax: number) => Math.max(1, dataMax)]} tick={{ fill: "#94a3b8", fontSize: 10 }} />
            {runs.map((run, index) => (
              <Radar
                key={run.run_id}
                name={run.name ?? run.run_id}
                dataKey={run.run_id}
                stroke={colors[index % colors.length]}
                strokeWidth={2}
                fill={colors[index % colors.length]}
                fillOpacity={0.15}
              />
            ))}
            <Legend wrapperStyle={{ paddingTop: "20px" }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
