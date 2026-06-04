import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { ExperimentSummary } from "@/lib/hooks/useExperiments";

interface ExperimentSidebarProps {
  experiments: ExperimentSummary[];
  activeExperimentId: string;
  onSelect: (id: string) => void;
}

export function ExperimentSidebar({ experiments, activeExperimentId, onSelect }: ExperimentSidebarProps) {
  return (
    <aside className="w-full rounded-lg border border-border bg-bg-surface p-3 lg:w-[240px]">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Experiments</p>
      <div className="space-y-1">
        {experiments.map((exp) => (
          <button
            key={exp.experiment_id}
            type="button"
            onClick={() => onSelect(exp.experiment_id)}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm hover:bg-bg-elevated",
              activeExperimentId === exp.experiment_id && "bg-brand-50 text-brand-600"
            )}
          >
            <span className="inline-flex items-center gap-2">
              <FlaskConical size={14} />
              {exp.name}
            </span>
            <span className="text-xs text-text-secondary">({exp.run_count})</span>
          </button>
        ))}
      </div>
      <Button size="sm" variant="outline" className="mt-3 w-full">
        + New Experiment
      </Button>
    </aside>
  );
}
