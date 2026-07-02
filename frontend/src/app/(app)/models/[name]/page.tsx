"use client";

import { useState } from "react";
import { ArrowLeft, UploadCloud, Tag, ShieldAlert, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui";
import { StageBadge } from "@/components/shared";
import { VersionTimeline } from "@/components/models/registry/VersionTimeline";
import { UploadVersionModal } from "@/components/models/registry/UploadVersionModal";
import { useModelVersions } from "@/lib/hooks/useModelRegistry";
import { useModels } from "@/lib/hooks/useModels";

type Tab = "versions" | "experiments" | "settings";

export default function ModelRegistryDetailPage() {
  const params = useParams<{ name: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const modelName = safeDecode(params?.name ?? "");
  const [tab, setTab] = useState<Tab>("versions");
  const [uploadOpen, setUploadOpen] = useState(false);
  const versions = useModelVersions(modelName);
  const latest = versions.data?.[0];

  // Find the matching model from the main model list to get its internal id
  const modelsQuery = useModels({ search: modelName, frameworks: [], taskTypes: [], status: "all", sizeCategory: "all", sort: "newest", view: "grid" });
  const matchedModel = modelsQuery.data?.items.find((m) => m.name === modelName) ?? null;

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between border-b border-border pb-6">
        <div className="flex items-start gap-4">
          <button 
            onClick={() => router.push("/models")}
            className="mt-1 rounded-md border border-border bg-white p-2 text-text-tertiary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-text-primary">{modelName}</h1>
              {latest && <StageBadge stage={latest.stage} />}
            </div>
            {latest ? (
              <div className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Latest Version: <strong className="font-medium text-text-primary">{latest.version}</strong>
                </span>
                <span className="text-text-tertiary">•</span>
                <span>Accuracy: {(latest.accuracy * 100).toFixed(1)}%</span>
              </div>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">No versions registered yet.</p>
            )}
          </div>
        </div>
        <Button
          className="shrink-0 bg-violet-600 text-white shadow-sm transition-colors hover:bg-violet-700"
          onClick={() => setUploadOpen(true)}
          disabled={!matchedModel}
          title={!matchedModel ? "Model not found in registry" : undefined}
        >
          <UploadCloud size={16} className="mr-2" /> Upload New Version
        </Button>
      </header>

      <div className="flex gap-1 border-b border-border">
        <TabButton label="Versions" active={tab === "versions"} onClick={() => setTab("versions")} />
        <TabButton label="Experiments" active={tab === "experiments"} onClick={() => setTab("experiments")} />
        <TabButton label="Settings" active={tab === "settings"} onClick={() => setTab("settings")} />
      </div>

      {tab === "versions" ? (
        <VersionTimeline
          versions={versions.data ?? []}
          onViewVersion={(version) => router.push(`/models/${encodeURIComponent(modelName)}/versions/${encodeURIComponent(version.replace(/^v/, ""))}`)}
          onRollback={() => {}}
        />
      ) : null}
      {tab === "experiments" ? (
        <section className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
          <div className="border-b border-border p-5">
            <h3 className="text-lg font-semibold text-text-primary">Linked Experiments</h3>
            <p className="mt-1 text-sm text-text-secondary">Training runs that produced versions of this model</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-bg-surface">
                <tr>
                  <th className="px-5 py-3 font-medium text-text-secondary">Run ID</th>
                  <th className="px-5 py-3 font-medium text-text-secondary">Produced Version</th>
                  <th className="px-5 py-3 font-medium text-text-secondary">Primary Metric (Accuracy)</th>
                  <th className="px-5 py-3 font-medium text-text-secondary">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {versions.data?.map((v) => (
                  <tr key={v.id} className="transition-colors hover:bg-bg-surface">
                    <td className="px-5 py-3 font-mono text-brand-600">
                      <a href={`/experiments?run=${v.runId}`} className="hover:underline">{v.runId || "unknown-run"}</a>
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-md bg-slate-100 px-2.5 py-0.5 font-medium text-slate-700">{v.version}</span>
                    </td>
                    <td className="px-5 py-3 text-text-primary">{(v.accuracy * 100).toFixed(1)}%</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Finished
                      </span>
                    </td>
                  </tr>
                ))}
                {(!versions.data || versions.data.length === 0) && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-text-secondary">
                      No runs linked to this model yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "settings" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-xl border border-border bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-text-primary">General Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary">Model Description</label>
                  <textarea 
                    className="mt-1 w-full rounded-md border border-border bg-bg-surface p-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500" 
                    rows={4} 
                    placeholder="Describe the purpose of this model..." 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary">Tags</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-sm text-slate-700">
                      <Tag size={13} /> computer-vision
                    </span>
                    <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-sm text-slate-700">
                      <Tag size={13} /> object-detection
                    </span>
                    <button className="flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2.5 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-50">
                      + Add Tag
                    </button>
                  </div>
                </div>
                <div className="pt-2">
                  <button className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700">
                    Save Changes
                  </button>
                </div>
              </div>
            </section>
          </div>
          
          <div className="space-y-6">
            <section className="rounded-xl border border-error-200 bg-error-50 p-5">
              <div className="mb-2 flex items-center gap-2 text-error-600">
                <ShieldAlert size={18} />
                <h3 className="font-semibold">Danger Zone</h3>
              </div>
              <p className="mb-4 text-sm text-error-700">
                Deleting this model will remove all its versions and metadata. This action cannot be undone.
              </p>
              <button className="flex w-full items-center justify-center gap-2 rounded-md bg-error-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-error-700">
                <Trash2 size={16} /> Delete Model
              </button>
            </section>
          </div>
        </div>
      ) : null}

      {matchedModel ? (
        <UploadVersionModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          modelId={matchedModel.id}
          modelName={matchedModel.name}
          currentVersion={matchedModel.version}
          primaryMetricName={matchedModel.primary_metric_name}
          primaryMetricValue={matchedModel.primary_metric_value}
          defaultMode={matchedModel.framework === "ultralytics" ? "yolo" : "general"}
          onUploaded={() => {
            setUploadOpen(false);
            void queryClient.invalidateQueries({ queryKey: ["registry-model-versions", modelName] });
            void queryClient.invalidateQueries({ queryKey: ["models"] });
          }}
        />
      ) : null}
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={active ? "rounded-md bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-600" : "rounded-md px-3 py-1.5 text-sm text-text-secondary"}>
      {label}
    </button>
  );
}

function Placeholder({ text }: { text: string }) {
  return <div className="rounded-md border border-border bg-bg-surface p-4 text-sm text-text-secondary">{text}</div>;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
