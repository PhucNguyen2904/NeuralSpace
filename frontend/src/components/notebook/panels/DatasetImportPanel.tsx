"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, Plus, Search } from "lucide-react";
import type { Dataset } from "../../../types/dataset";
import { getDatasets, mountDatasetToWorkspace } from "../../../lib/api/datasets";
import { cn } from "../../../lib/utils/cn";
import { formatBytes, generateDatasetCode } from "../shared/ImportCodeGenerator";

interface DatasetImportPanelProps {
  onInjectCode: (code: string) => void;
  workspaceId: string;
}

export function DatasetImportPanel({ onInjectCode, workspaceId }: DatasetImportPanelProps): JSX.Element {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    void getDatasets({ page: 1, limit: 100, sort: "newest" })
      .then((data) => setDatasets(data.items ?? []))
      .catch(() => setDatasets([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      datasets.filter(
        (d) =>
          d.name.toLowerCase().includes(search.toLowerCase()) ||
          (d.description ?? "").toLowerCase().includes(search.toLowerCase())
      ),
    [datasets, search]
  );

  const handleImport = async (dataset: Dataset): Promise<void> => {
    if (added.has(dataset.id)) return;
    setAdding(dataset.id);

    try {
      await mountDatasetToWorkspace(dataset.id, workspaceId);
    } catch {
      // noop: keep dev flow
    } finally {
      onInjectCode(generateDatasetCode(dataset));
      setAdded((prev) => new Set([...prev, dataset.id]));
      setAdding(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-[#E2E8F0] p-3">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#CBD5E0]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tim dataset..."
            className="w-full rounded-md border border-[#E2E8F0] bg-[#F8FAFC] py-1.5 pl-8 pr-3 text-[12.5px] placeholder:text-[#CBD5E0] focus:border-[#6366F1] focus:outline-none focus:ring-1 focus:ring-[#6366F1]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <DatasetListSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="🗄️"
            title={search ? "Khong tim thay dataset" : "Chua co dataset nao"}
            sub={search ? "Thu tu khoa khac" : "Upload dataset tren Upstream module"}
            actionLabel="Di den Upstream ->"
            onAction={() => window.open("/datasets", "_blank")}
          />
        ) : (
          <ul className="py-1">
            {filtered.map((dataset) => (
              <DatasetItem
                key={dataset.id}
                dataset={dataset}
                isAdded={added.has(dataset.id)}
                isAdding={adding === dataset.id}
                onImport={() => {
                  void handleImport(dataset);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-[#E2E8F0] p-2">
        <a
          href="/datasets"
          target="_blank"
          className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium text-[#6366F1] transition-colors hover:bg-[#EEF2FF]"
        >
          <ExternalLink size={12} />
          Xem tat ca datasets
        </a>
      </div>
    </div>
  );
}

const TYPE_META: Record<string, { icon: string; color: string }> = {
  image: { icon: "🖼", color: "bg-pink-50 text-pink-600" },
  tabular: { icon: "📊", color: "bg-emerald-50 text-emerald-700" },
  text: { icon: "📝", color: "bg-sky-50 text-sky-700" },
  audio: { icon: "🔊", color: "bg-violet-50 text-violet-700" },
  video: { icon: "🎬", color: "bg-orange-50 text-orange-700" }
};

function DatasetItem({ dataset, isAdded, isAdding, onImport }: { dataset: Dataset; isAdded: boolean; isAdding: boolean; onImport: () => void }): JSX.Element {
  const meta = TYPE_META[dataset.type] ?? { icon: "📄", color: "bg-gray-50 text-gray-600" };

  return (
    <li className="group flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-[#F8FAFC]">
      <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px]", meta.color.split(" ")[0])}>{meta.icon}</span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-medium leading-snug text-[#1A202C]">{dataset.name}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", meta.color)}>{dataset.type}</span>
          <span className="text-[11px] text-[#A0AEC0]">{formatBytes(dataset.size_bytes)}</span>
          {dataset.label_status === "labeled" ? <span className="text-[10px] text-emerald-600">✓ Labeled</span> : null}
        </div>
      </div>

      <button
        onClick={onImport}
        disabled={isAdded || isAdding}
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all duration-150",
          isAdded
            ? "cursor-default bg-emerald-50 text-emerald-600"
            : isAdding
              ? "bg-[#EEF2FF] text-[#6366F1]"
              : "bg-[#F1F5F9] text-[#94A3B8] opacity-0 group-hover:opacity-100 hover:bg-[#EEF2FF] hover:text-[#6366F1]"
        )}
      >
        {isAdding ? <Loader2 size={12} className="animate-spin" /> : isAdded ? <Check size={12} /> : <Plus size={12} />}
      </button>
    </li>
  );
}

function DatasetListSkeleton(): JSX.Element {
  return (
    <div className="space-y-2 p-3">
      <div className="h-12 rounded bg-[#F1F5F9]" />
      <div className="h-12 rounded bg-[#F1F5F9]" />
      <div className="h-12 rounded bg-[#F1F5F9]" />
    </div>
  );
}

function EmptyState({ icon, title, sub, actionLabel, onAction }: { icon: string; title: string; sub: string; actionLabel: string; onAction: () => void }): JSX.Element {
  return (
    <div className="px-4 py-8 text-center">
      <div className="text-2xl">{icon}</div>
      <p className="mt-2 text-sm font-medium text-[#1A202C]">{title}</p>
      <p className="mt-1 text-xs text-[#94A3B8]">{sub}</p>
      <button onClick={onAction} className="mt-3 text-xs font-medium text-[#6366F1] hover:underline">
        {actionLabel}
      </button>
    </div>
  );
}
