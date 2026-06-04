"use client";

import { type ReactNode, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { motion } from "framer-motion";
import { MetricsChart } from "@/components/experiments/MetricsChart";
import { MetricDelta, RunStatusBadge, VersionTag } from "@/components/shared";
import { Button } from "@/components/ui";
import { formatRelativeTime } from "@/lib/utils/format";
import type { RunDetailData } from "@/lib/hooks/useExperiments";

type Tab = "overview" | "metrics" | "params" | "artifacts" | "dataset";

interface RunDetailDrawerProps {
  run: RunDetailData | null;
  open: boolean;
  onClose: () => void;
}

export function RunDetailDrawer({ run, open, onClose }: RunDetailDrawerProps) {
  const [tab, setTab] = useState<Tab>("overview");
  if (!open || !run) return null;

  const metrics = run.metricsMap;

  return (
    <div className="fixed inset-0 z-50">
      <motion.button className="absolute inset-0 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} />
      <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} className="absolute right-0 top-0 h-full w-full max-w-[560px] border-l border-border bg-bg-surface">
        <div className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">{run.name}</h2>
            <div className="mt-1"><RunStatusBadge status={run.status} size="sm" /></div>
            <p className="mt-1 text-xs text-text-secondary">
              Started: {formatRelativeTime(run.start_time)} · Duration: {run.durationLabel}
            </p>
            <p className="text-xs text-text-secondary">
              By: {run.user_id} | Branch: {run.branch} | Commit: {run.commit}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}><X size={14} /></Button>
        </div>

        <div className="border-b border-border px-4 py-2">
          <div className="flex flex-wrap gap-2 text-sm">
            {(["overview", "metrics", "params", "artifacts", "dataset"] as Tab[]).map((item) => (
              <button key={item} className={tab === item ? "rounded-md bg-brand-50 px-2 py-1 text-brand-600" : "rounded-md px-2 py-1 text-text-secondary"} onClick={() => setTab(item)}>
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[calc(100%-120px)] overflow-y-auto p-4">
          {tab === "overview" ? (
            <div className="grid grid-cols-3 gap-2">
              <MetricCard label="Accuracy" value={metrics.accuracy?.toFixed(3) ?? "—"} delta={<MetricDelta value={metrics.accuracy ?? 0} baseline={0.903} format="percent" />} />
              <MetricCard label="Loss" value={metrics.loss?.toFixed(3) ?? "—"} delta={<MetricDelta value={metrics.loss ?? 0} baseline={0.15} format="absolute" higherIsBetter={false} />} />
              <MetricCard label="F1" value={metrics.f1_score?.toFixed(3) ?? "—"} delta={<MetricDelta value={metrics.f1_score ?? 0} baseline={0.875} format="percent" />} />
            </div>
          ) : null}

          {tab === "metrics" ? <MetricsChart run={run} /> : null}

          {tab === "params" ? (
            <div>
              <Button size="sm" variant="outline" className="mb-2">Copy as Python dict</Button>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(run.paramsMap).map(([k, v]) => (
                  <div key={k} className="rounded-md border border-border p-2">
                    <p className="text-xs text-text-tertiary">{k}</p>
                    <p className="font-medium">{String(v)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {tab === "artifacts" ? (
            <div className="space-y-1 text-sm">
              {run.artifacts.map((artifact) => (
                <div key={artifact.path} className="flex items-center justify-between rounded-md border border-border p-2">
                  <span>{artifact.type === "folder" ? "📁" : artifact.type === "image" ? "🖼" : "📄"} {artifact.path}</span>
                  <Button size="sm" variant="ghost">{artifact.type === "image" ? "Preview" : "Download"}</Button>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "dataset" ? (
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">📊 {run.dataset.name}</p>
              <div className="mt-2"><VersionTag version={run.dataset.version} dvcMd5={run.dataset.dvcHash} status={run.dataset.status} /></div>
              <p className="mt-1 text-sm text-text-secondary">Size: {run.dataset.size}</p>
              <a href={`/datasets/${run.dataset.id}`} className="mt-2 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
                View Dataset <ExternalLink size={14} />
              </a>
            </div>
          ) : null}
        </div>
      </motion.aside>
    </div>
  );
}

function MetricCard({ label, value, delta }: { label: string; value: string; delta: ReactNode }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-xs text-text-secondary">{label}</p>
      <div className="mt-1">{delta}</div>
    </div>
  );
}
