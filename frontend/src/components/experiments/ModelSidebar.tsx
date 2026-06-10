"use client";

import { useState, useEffect } from "react";
import { Box, Info } from "lucide-react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import type { Model } from "@/types/model";

interface ModelSidebarProps {
  models: Model[];
  activeModelId: string;
  onSelect: (id: string) => void;
}

export function ModelSidebar({ models, activeModelId, onSelect }: ModelSidebarProps) {
  const [infoModelId, setInfoModelId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedModelForInfo = models.find((m) => m.id === infoModelId);

  return (
    <>
      <aside className="w-full rounded-lg border border-border bg-bg-surface p-3 lg:w-[240px]">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Models</p>
        <div className="space-y-1">
          {models.length === 0 ? (
            <p className="text-xs italic text-text-tertiary px-2">No models found.</p>
          ) : null}
          {models.map((model) => (
            <div
              key={model.id}
              className={cn(
                "group flex w-full items-center justify-between rounded-md px-2.5 py-1 text-sm hover:bg-bg-elevated",
                activeModelId === model.id && "bg-brand-50 text-brand-600"
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
                onClick={() => onSelect(model.id)}
              >
                <Box size={14} className="shrink-0" />
                <span className="truncate">{model.name}</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-text-tertiary opacity-0 transition-opacity hover:text-text-primary group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setInfoModelId(model.id);
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
          + New Model
        </Button>
      </aside>

      {mounted && selectedModelForInfo && (
        <Dialog
          open={Boolean(infoModelId)}
          onOpenChange={(open) => !open && setInfoModelId(null)}
          title="Model Information"
        >
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-text-secondary">Name</p>
              <p className="text-sm">{selectedModelForInfo.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-text-secondary">Created At</p>
              <p className="text-sm" suppressHydrationWarning>
                {selectedModelForInfo.created_at ? new Date(selectedModelForInfo.created_at).toLocaleString() : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-text-secondary">Framework</p>
              <p className="text-sm">{selectedModelForInfo.framework}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-text-secondary">Task Type</p>
              <p className="text-sm">{selectedModelForInfo.task_type}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-text-secondary">Description</p>
              <p className="text-sm">{selectedModelForInfo.description || "No description available."}</p>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
