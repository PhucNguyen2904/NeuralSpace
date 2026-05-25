"use client";

import { Download, X } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui";
import { useNotebookPreview } from "@/lib/hooks/useNotebooks";
import { cn } from "@/lib/utils/cn";

export function NotebookPreviewPanel({
  previewPath,
  onClose,
  onDownload,
  onOpenWorkspace
}: {
  previewPath: string | null;
  onClose: () => void;
  onDownload: (path: string) => void;
  onOpenWorkspace: (path: string) => void;
}) {
  const previewQuery = useNotebookPreview(previewPath);

  const notebookCells = useMemo(() => {
    if (!previewQuery.data?.content || !previewPath?.endsWith(".ipynb")) return [];
    try {
      const parsed = JSON.parse(previewQuery.data.content) as { content?: { cells?: Array<{ cell_type?: string; source?: string[] }> } };
      return parsed.content?.cells?.slice(0, 8) || [];
    } catch {
      return [];
    }
  }, [previewQuery.data?.content, previewPath]);

  return (
    <div className={cn("fixed right-0 top-0 z-50 h-full w-full max-w-[480px] transform border-l border-border bg-bg-surface shadow-xl transition-transform", previewPath ? "translate-x-0" : "translate-x-full")}>
      <div className="flex items-start justify-between border-b border-border p-4">
        <div>
          <p className="font-semibold text-text-primary">{previewPath?.split("/").pop()}</p>
          <p className="text-xs text-text-secondary">{previewPath}</p>
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-bg-elevated" aria-label="Close preview"><X size={16} /></button>
      </div>
      <div className="h-[calc(100%-140px)] overflow-auto p-4">
        {previewQuery.isLoading ? <p className="text-sm text-text-secondary">Đang tải preview...</p> : null}
        {previewPath?.endsWith(".ipynb") ? (
          <div className="space-y-3">
            {notebookCells.map((cell, idx) => (
              <div key={idx} className="rounded-md border border-border bg-bg-sunken p-3">
                <p className="mb-2 text-xs uppercase tracking-wide text-text-tertiary">{cell.cell_type || "cell"}</p>
                <pre className="whitespace-pre-wrap text-xs text-text-primary">{(cell.source || []).join("")}</pre>
              </div>
            ))}
          </div>
        ) : (
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-bg-sunken p-3 text-xs">{previewQuery.data?.content || ""}</pre>
        )}
      </div>
      <div className="flex gap-2 border-t border-border p-4">
        <Button size="sm" variant="secondary" onClick={() => previewPath && onDownload(previewPath)} aria-label="Download notebook"><Download size={14} />Tải xuống</Button>
        <Button size="sm" onClick={() => previewPath && onOpenWorkspace(previewPath)} aria-label="Open notebook in workspace">Mở trong workspace</Button>
      </div>
    </div>
  );
}
