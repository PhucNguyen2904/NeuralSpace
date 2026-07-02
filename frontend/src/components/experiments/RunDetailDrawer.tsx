"use client";

import { type ReactNode, useState } from "react";
import { ExternalLink, X, Activity, Database, FileBox, LayoutList, GitBranch, GitCommit } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MetricsChart } from "@/components/experiments/MetricsChart";
import { MetricDelta, RunStatusBadge, VersionTag } from "@/components/shared";
import { formatRelativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
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
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.button 
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={onClose} 
            aria-label="Close drawer overlay"
          />
          <motion.aside 
            initial={{ x: "100%", opacity: 0.5 }} 
            animate={{ x: 0, opacity: 1 }} 
            exit={{ x: "100%", opacity: 0.5 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="relative flex h-full w-full max-w-[640px] flex-col border-l border-border bg-bg-surface shadow-2xl"
          >
            {/* Header */}
            <div className="flex shrink-0 items-start justify-between border-b border-border bg-white p-6">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-text-primary">{run.name}</h2>
                  <RunStatusBadge status={run.status} size="md" />
                </div>
                
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    Started: <strong className="font-medium text-text-primary">{formatRelativeTime(run.start_time)}</strong>
                  </span>
                  <span className="flex items-center gap-1.5">
                    Duration: <strong className="font-medium text-text-primary">{run.durationLabel}</strong>
                  </span>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-text-secondary">
                  <span className="flex items-center gap-1.5">
                    <GitBranch size={14} className="text-text-tertiary" /> {run.branch}
                  </span>
                  <span className="flex items-center gap-1.5 font-mono text-xs">
                    <GitCommit size={14} className="text-text-tertiary" /> {run.commit}
                  </span>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="rounded-full p-2 text-text-tertiary transition-colors hover:bg-slate-100 hover:text-text-primary"
              >
                <X size={20} />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex shrink-0 gap-1 border-b border-border bg-white px-6">
              <TabButton label="Overview" icon={<Activity size={14} />} active={tab === "overview"} onClick={() => setTab("overview")} />
              <TabButton label="Metrics" icon={<Activity size={14} />} active={tab === "metrics"} onClick={() => setTab("metrics")} />
              <TabButton label="Params" icon={<LayoutList size={14} />} active={tab === "params"} onClick={() => setTab("params")} />
              <TabButton label="Artifacts" icon={<FileBox size={14} />} active={tab === "artifacts"} onClick={() => setTab("artifacts")} />
              <TabButton label="Dataset" icon={<Database size={14} />} active={tab === "dataset"} onClick={() => setTab("dataset")} />
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="h-full"
                >
                  {tab === "overview" && (
                    <div className="space-y-6">
                      <section className="rounded-xl border border-border bg-white p-5 shadow-sm">
                        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-tertiary">Primary Metrics</h3>
                        <div className="grid grid-cols-3 gap-4">
                          <MetricCard 
                            label="Accuracy" 
                            value={metrics.accuracy?.toFixed(4) ?? "—"} 
                            delta={<MetricDelta value={metrics.accuracy ?? 0} baseline={0.903} format="percent" />} 
                          />
                          <MetricCard 
                            label="Loss" 
                            value={metrics.loss?.toFixed(4) ?? "—"} 
                            delta={<MetricDelta value={metrics.loss ?? 0} baseline={0.15} format="absolute" higherIsBetter={false} />} 
                          />
                          <MetricCard 
                            label="F1 Score" 
                            value={metrics.f1_score?.toFixed(4) ?? "—"} 
                            delta={<MetricDelta value={metrics.f1_score ?? 0} baseline={0.875} format="percent" />} 
                          />
                        </div>
                      </section>
                      
                      <section className="rounded-xl border border-border bg-white p-5 shadow-sm">
                        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-tertiary">Secondary Metrics</h3>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                          {Object.entries(metrics).filter(([k]) => !['accuracy', 'loss', 'f1_score'].includes(k)).map(([k, v]) => (
                            <div key={k}>
                              <p className="text-xs font-medium text-text-tertiary">{k}</p>
                              <p className="mt-1 font-semibold text-text-primary">{v.toFixed(4)}</p>
                            </div>
                          ))}
                          {Object.keys(metrics).filter(([k]) => !['accuracy', 'loss', 'f1_score'].includes(k)).length === 0 && (
                            <p className="col-span-4 text-sm text-text-secondary">No secondary metrics logged.</p>
                          )}
                        </div>
                      </section>
                    </div>
                  )}

                  {tab === "metrics" && (
                    <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
                      <MetricsChart run={run} />
                    </div>
                  )}

                  {tab === "params" && (
                    <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
                      <div className="mb-4 flex items-center justify-between">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary">Hyperparameters</h3>
                        <button className="text-xs font-medium text-brand-600 hover:underline">Copy as Python Dict</button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {Object.entries(run.paramsMap).map(([k, v]) => (
                          <div key={k} className="rounded-lg border border-border bg-bg-surface p-3 transition-colors hover:border-brand-300">
                            <p className="truncate text-xs font-medium text-text-tertiary" title={k}>{k}</p>
                            <p className="mt-1 truncate font-mono text-sm text-text-primary" title={String(v)}>{String(v)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {tab === "artifacts" && (
                    <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
                      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-tertiary">Run Artifacts</h3>
                      <div className="space-y-2">
                        {run.artifacts.map((artifact) => (
                          <div key={artifact.path} className="group flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-slate-50">
                            <div className="flex items-center gap-3">
                              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-lg">
                                {artifact.type === "folder" ? "📁" : artifact.type === "image" ? "🖼" : "📄"}
                              </span>
                              <div>
                                <p className="text-sm font-medium text-text-primary">{artifact.path}</p>
                                {artifact.size && <p className="text-xs text-text-tertiary">{artifact.size}</p>}
                              </div>
                            </div>
                            <button className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-brand-600 shadow-sm ring-1 ring-border transition-colors hover:bg-brand-50 group-hover:ring-brand-200">
                              {artifact.type === "image" ? "Preview" : "Download"}
                            </button>
                          </div>
                        ))}
                        {run.artifacts.length === 0 && (
                          <p className="text-center text-sm text-text-secondary py-8">No artifacts logged for this run.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {tab === "dataset" && (
                    <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
                      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-tertiary">Training Data Source</h3>
                      <div className="rounded-lg border border-border p-4 bg-slate-50">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-base font-semibold text-text-primary flex items-center gap-2">
                              <Database className="text-brand-500" size={18} /> {run.dataset.name}
                            </p>
                            <p className="mt-1 text-sm text-text-secondary">Total Size: {run.dataset.size}</p>
                          </div>
                          <a href={`/datasets/${run.dataset.id}`} className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-brand-600 shadow-sm ring-1 ring-border transition-colors hover:bg-brand-50">
                            View Dataset <ExternalLink size={14} />
                          </a>
                        </div>
                        <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
                          <VersionTag version={run.dataset.version} dvcMd5={run.dataset.dvcHash} status={run.dataset.status} />
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

function MetricCard({ label, value, delta }: { label: string; value: string; delta: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-surface p-4">
      <p className="text-xs font-medium text-text-tertiary">{label}</p>
      <p className="mt-1 text-2xl font-bold text-text-primary">{value}</p>
      <div className="mt-2">{delta}</div>
    </div>
  );
}

function TabButton({ label, icon, active, onClick }: { label: string; icon: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors focus:outline-none",
        active
          ? "border-violet-600 text-violet-700"
          : "border-transparent text-text-secondary hover:border-slate-300 hover:text-text-primary"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
