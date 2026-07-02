import { useState, useEffect } from "react";
import { FlaskConical, Info, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import type { ExperimentSummary } from "@/lib/hooks/useExperiments";
import { formatRelativeTime } from "@/lib/utils/format";

interface ExperimentSidebarProps {
  experiments: ExperimentSummary[];
  activeExperimentId: string;
  onSelect: (id: string) => void;
}

export function ExperimentSidebar({ experiments, activeExperimentId, onSelect }: ExperimentSidebarProps) {
  const [infoExpId, setInfoExpId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedExpForInfo = experiments.find((e) => e.experiment_id === infoExpId);

  return (
    <>
      <aside className="w-full rounded-xl border border-border bg-white p-4 shadow-sm lg:w-[260px] shrink-0">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Experiments</p>
          <button title="New Experiment" className="rounded p-1 text-text-tertiary transition-colors hover:bg-bg-elevated hover:text-brand-600">
            <Plus size={16} />
          </button>
        </div>
        
        <div className="space-y-1">
          {experiments.map((exp) => {
            const isActive = activeExperimentId === exp.experiment_id;
            return (
              <div
                key={exp.experiment_id}
                className={cn(
                  "group flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition-all duration-200",
                  isActive 
                    ? "bg-violet-50 text-violet-700 shadow-sm ring-1 ring-violet-500/20" 
                    : "text-text-secondary hover:bg-slate-50 hover:text-text-primary"
                )}
                onClick={() => onSelect(exp.experiment_id)}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
                  <div className={cn(
                    "flex shrink-0 items-center justify-center rounded-md p-1.5 transition-colors",
                    isActive ? "bg-violet-100 text-violet-600" : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-slate-700 group-hover:shadow-sm"
                  )}>
                    <FlaskConical size={14} />
                  </div>
                  <span className="truncate font-medium">{exp.name}</span>
                </div>
                <div className="ml-2 flex items-center gap-2 shrink-0">
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    isActive ? "bg-violet-200/50 text-violet-700" : "bg-slate-100 text-slate-500"
                  )}>
                    {exp.run_count}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 p-1 text-text-tertiary opacity-0 transition-all hover:scale-110 hover:text-brand-600 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInfoExpId(exp.experiment_id);
                    }}
                    title="Experiment Details"
                  >
                    <Info size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {mounted && selectedExpForInfo && (
        <Dialog
          open={Boolean(infoExpId)}
          onOpenChange={(open) => !open && setInfoExpId(null)}
          title={
            <div className="flex items-center gap-2 text-lg text-text-primary">
              <FlaskConical className="text-violet-500" size={20} />
              Experiment Information
            </div>
          }
        >
          <div className="space-y-5 py-2">
            <div className="rounded-lg border border-border bg-bg-surface p-4">
              <h4 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Name</h4>
              <p className="mt-1 text-base font-medium text-text-primary">{selectedExpForInfo.name}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-bg-surface p-4">
                <h4 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Experiment ID</h4>
                <p className="mt-1 font-mono text-sm text-text-secondary">{selectedExpForInfo.experiment_id}</p>
              </div>
              <div className="rounded-lg border border-border bg-bg-surface p-4">
                <h4 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Created</h4>
                <p className="mt-1 text-sm text-text-secondary" suppressHydrationWarning>
                  {selectedExpForInfo.created_at ? formatRelativeTime(selectedExpForInfo.created_at) : "N/A"}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-bg-surface p-4">
              <h4 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Description</h4>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {selectedExpForInfo.tags?.description || "No description provided for this experiment."}
              </p>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
