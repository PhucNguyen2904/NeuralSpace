import { ParallelCoordinatesChart } from "@/components/experiments/ParallelCoordinatesChart";
import { cn } from "@/lib/utils/cn";
import type { RunDetailData } from "@/lib/hooks/useExperiments";

interface CompareRunsViewProps {
  runs: RunDetailData[];
  onBack: () => void;
}

export function CompareRunsView({ runs, onBack }: CompareRunsViewProps) {
  const metrics = ["accuracy", "loss", "f1_score"];
  const paramsKeys = Array.from(new Set(runs.flatMap((run) => Object.keys(run.paramsMap))));
  if (runs.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Compare Runs</h2>
          <button onClick={onBack} className="text-sm text-brand-600 hover:underline">Back to table</button>
        </div>
        <p className="mt-3 text-sm text-text-secondary">No runs selected for comparison.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Compare Runs</h2>
        <button onClick={onBack} className="text-sm text-brand-600 hover:underline">Back to table</button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-tertiary">
              <th className="px-2 py-2">Metric</th>
              {runs.map((run) => <th key={run.run_id} className="px-2 py-2">{run.name}</th>)}
              <th className="px-2 py-2">Best</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => {
              const values = runs.map((run) => ({ runId: run.run_id, value: run.metricsMap[metric] ?? 0 }));
              const bestRunId = metric === "loss"
                ? values.reduce((min, item) => (item.value < min.value ? item : min), values[0]!).runId
                : values.reduce((max, item) => (item.value > max.value ? item : max), values[0]!).runId;
              const bestName = runs.find((run) => run.run_id === bestRunId)?.name ?? bestRunId;
              return (
                <tr key={metric} className="border-b border-border/70">
                  <td className="px-2 py-2 font-medium">{metric}</td>
                  {runs.map((run) => (
                    <td key={`${metric}-${run.run_id}`} className={cn("px-2 py-2", run.run_id === bestRunId && "font-semibold text-emerald-600")}>
                      {run.metricsMap[metric]?.toFixed(3) ?? "—"}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-emerald-700">{bestName}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ParallelCoordinatesChart runs={runs} />

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-bg-elevated text-left text-xs uppercase tracking-wide text-text-tertiary">
              <th className="px-2 py-2">Param</th>
              {runs.map((run) => <th key={run.run_id} className="px-2 py-2">{run.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {paramsKeys.map((key) => {
              const vals = runs.map((run) => String(run.paramsMap[key] ?? ""));
              const hasDiff = new Set(vals).size > 1;
              return (
                <tr key={key} className="border-t border-border/70">
                  <td className="px-2 py-2 font-medium">{key}</td>
                  {runs.map((run) => (
                    <td key={`${key}-${run.run_id}`} className={cn("px-2 py-2", hasDiff && "bg-amber-50")}>
                      {String(run.paramsMap[key] ?? "—")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
