"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, Plus, Search } from "lucide-react";
import { getModels, loadModelToWorkspace } from "../../../lib/api/models";
import type { Model } from "../../../types/model";
import { cn } from "../../../lib/utils/cn";
import { formatBytes, generateModelCode } from "../shared/ImportCodeGenerator";

interface ModelImportPanelProps {
  onInjectCode: (code: string) => void;
  workspaceId: string;
}

export function ModelImportPanel({ onInjectCode, workspaceId }: ModelImportPanelProps): JSX.Element {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [frameworkFilter, setFrameworkFilter] = useState<string | null>(null);

  useEffect(() => {
    void getModels({ page: 1, limit: 100, sort: "newest" })
      .then((data) => setModels(data.items ?? []))
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  }, []);

  const frameworks = useMemo(() => [...new Set(models.map((m) => m.framework))], [models]);

  const filtered = useMemo(
    () =>
      models.filter((m) => {
        const matchSearch = m.name.toLowerCase().includes(search.toLowerCase());
        const matchFw = !frameworkFilter || m.framework === frameworkFilter;
        return matchSearch && matchFw;
      }),
    [models, search, frameworkFilter]
  );

  const handleImport = async (model: Model): Promise<void> => {
    if (added.has(model.id)) return;
    setAdding(model.id);
    try {
      await loadModelToWorkspace(model.id, workspaceId, `/workspace/models/${model.name.toLowerCase().replaceAll(" ", "_")}`);
    } catch {
      // noop
    } finally {
      onInjectCode(generateModelCode(model));
      setAdded((prev) => new Set([...prev, model.id]));
      setAdding(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-2 border-b border-[#E2E8F0] p-3">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#CBD5E0]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tim model..."
            className="w-full rounded-md border border-[#E2E8F0] bg-[#F8FAFC] py-1.5 pl-8 pr-3 text-[12.5px] placeholder:text-[#CBD5E0] focus:border-[#6366F1] focus:outline-none focus:ring-1 focus:ring-[#6366F1]"
          />
        </div>

        {frameworks.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            <FilterPill label="Tat ca" active={!frameworkFilter} onClick={() => setFrameworkFilter(null)} />
            {frameworks.map((fw) => (
              <FilterPill key={fw} label={fw} active={frameworkFilter === fw} onClick={() => setFrameworkFilter(fw === frameworkFilter ? null : fw)} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-3">
            <div className="h-12 rounded bg-[#F1F5F9]" />
            <div className="h-12 rounded bg-[#F1F5F9]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="text-2xl">🧠</div>
            <p className="mt-2 text-sm font-medium text-[#1A202C]">Khong tim thay model</p>
          </div>
        ) : (
          <ul className="py-1">
            {filtered.map((model) => (
              <ModelItem
                key={model.id}
                model={model}
                isAdded={added.has(model.id)}
                isAdding={adding === model.id}
                onImport={() => {
                  void handleImport(model);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-[#E2E8F0] p-2">
        <a
          href="/models"
          target="_blank"
          className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium text-[#6366F1] transition-colors hover:bg-[#EEF2FF]"
        >
          <ExternalLink size={12} />
          Xem tat ca models
        </a>
      </div>
    </div>
  );
}

const FRAMEWORK_META: Record<string, { color: string; short: string }> = {
  pytorch: { color: "bg-orange-50 text-orange-700", short: "PyTorch" },
  tensorflow: { color: "bg-amber-50 text-amber-700", short: "TF" },
  onnx: { color: "bg-sky-50 text-sky-700", short: "ONNX" },
  huggingface: { color: "bg-yellow-50 text-yellow-700", short: "HF" },
  sklearn: { color: "bg-blue-50 text-blue-700", short: "sklearn" }
};

function ModelItem({ model, isAdded, isAdding, onImport }: { model: Model; isAdded: boolean; isAdding: boolean; onImport: () => void }): JSX.Element {
  const fw = FRAMEWORK_META[model.framework] ?? { color: "bg-gray-50 text-gray-600", short: model.framework };
  const metricVal = Number.isFinite(model.primary_metric_value) ? `${(model.primary_metric_value * 100).toFixed(1)}%` : null;

  return (
    <li className="group flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-[#F8FAFC]">
      <span className="mt-0.5 shrink-0 text-[15px]">🧠</span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-medium text-[#1A202C]">{model.name}</p>
        <p className="truncate text-[11px] text-[#94A3B8]">{model.architecture}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", fw.color)}>{fw.short}</span>
          {metricVal ? <span className="text-[10px] font-medium text-emerald-600">{model.primary_metric_name}: {metricVal}</span> : null}
          <span className="text-[10px] text-[#A0AEC0]">{formatBytes(model.size_bytes)}</span>
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

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
        active
          ? "border-[#6366F1] bg-[#6366F1] text-white"
          : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#6366F1] hover:text-[#6366F1]"
      )}
    >
      {label}
    </button>
  );
}
