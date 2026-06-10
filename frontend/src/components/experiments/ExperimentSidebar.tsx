import { useState, useEffect } from "react";
import { FlaskConical, Info } from "lucide-react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import type { ExperimentSummary } from "@/lib/hooks/useExperiments";

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
      <aside className="w-full rounded-lg border border-border bg-bg-surface p-3 lg:w-[240px]">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Experiments</p>
        <div className="space-y-1">
          {experiments.map((exp) => (
            <div
              key={exp.experiment_id}
              className={cn(
                "group flex w-full items-center justify-between rounded-md px-2.5 py-1 text-sm hover:bg-bg-elevated",
                activeExperimentId === exp.experiment_id && "bg-brand-50 text-brand-600"
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                onClick={() => onSelect(exp.experiment_id)}
              >
                <FlaskConical size={14} className="shrink-0" />
                <span className="truncate">{exp.name}</span>
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">({exp.run_count})</span>
                <button
                  type="button"
                  className="text-text-tertiary opacity-0 transition-opacity hover:text-text-primary group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setInfoExpId(exp.experiment_id);
                  }}
                  title="View Info"
                >
                  <Info size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="mt-3 w-full">
          + New Experiment
        </Button>
      </aside>

      {mounted && selectedExpForInfo && (
        <Dialog
          open={Boolean(infoExpId)}
          onOpenChange={(open) => !open && setInfoExpId(null)}
          title="Experiment Information"
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-text-secondary">Name</p>
              <p className="text-sm">{selectedExpForInfo.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-text-secondary">Created At</p>
              <p className="text-sm" suppressHydrationWarning>
                {selectedExpForInfo.created_at ? new Date(selectedExpForInfo.created_at).toLocaleString() : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-text-secondary">Description</p>
              <p className="text-sm">{selectedExpForInfo.tags?.description || "No description available."}</p>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
