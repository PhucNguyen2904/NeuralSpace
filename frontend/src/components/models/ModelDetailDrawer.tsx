"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui";
import { MetricsChart } from "@/components/models/MetricsChart";
import { VersionTimeline } from "@/components/models/VersionTimeline";
import { useModelDetail } from "@/lib/hooks/useModels";
import type { Model } from "@/types/model";

type Tab = "overview" | "metrics" | "files" | "usage" | "versions";

export function ModelDetailDrawer({
  modelId,
  open,
  onClose,
  onLoad
}: {
  modelId: string | null;
  open: boolean;
  onClose: () => void;
  onLoad: (model: Model, workspaceId: string, mountPath: string) => void;
}) {
  const { detail, metrics, versions } = useModelDetail(modelId ?? "");
  const model = detail.data;
  const [tab, setTab] = React.useState<Tab>("overview");
  const [workspaceId, setWorkspaceId] = React.useState("ws_resnet");
  const [mountPath, setMountPath] = React.useState("/workspace/models/resnet50");
  if (!open || !model) return null;

  const code = `import torch\nmodel_path = "${mountPath}/model.pt"\nmodel = torch.load(model_path)\nmodel.eval()`;

  return (
    <div className="fixed inset-0 z-50">
      <motion.button initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} className="absolute inset-0 bg-black backdrop-blur-sm" onClick={onClose} />
      <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} transition={{ duration: 0.25 }} className="absolute right-0 top-0 h-full w-full max-w-[560px] overflow-hidden border-l border-border bg-bg-surface">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-xl font-bold">{model.name}</h2>
            <div className="mt-1 flex gap-2 text-xs">
              <span className="rounded-full bg-violet-50 px-2 py-1 text-violet-700">{model.architecture}</span>
              <span className="rounded-full bg-bg-elevated px-2 py-1 text-text-secondary">{model.framework}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost">Open in Upstream <ExternalLink size={14} /></Button>
            <Button size="sm" className="bg-violet-50 text-violet-700 hover:bg-violet-100" onClick={() => onLoad(model, workspaceId, mountPath)}>Load vào Workspace</Button>
          </div>
        </div>
        <div className="border-b border-border px-5 py-2">
          <div className="flex gap-2 text-sm">
            {(["overview", "metrics", "files", "usage", "versions"] as Tab[]).map((t) => (
              <button key={t} className={tab === t ? "rounded-md bg-violet-50 px-2 py-1 text-violet-700" : "rounded-md px-2 py-1 text-text-secondary"} onClick={() => setTab(t)}>{t.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div className="h-[calc(100%-170px)] overflow-y-auto px-5 py-4">
          {tab === "overview" ? <div className="grid grid-cols-2 gap-3 text-sm"><Info label="Task" value={model.task_type.replaceAll("_", " ")} /><Info label="Framework" value={model.framework_version} /><Info label="Input" value={model.input_shape} /><Info label="Output" value={model.output_shape} /><Info label="Parameters" value={`${(model.parameter_count / 1_000_000).toFixed(1)}M`} /><Info label="Model size" value={`${(model.size_bytes / 1024 ** 2).toFixed(1)} MB`} /><Info label="Dataset" value={model.dataset_id ?? "ImageNet 2017"} /><Info label="Trained by" value={model.created_by} /></div> : null}
          {tab === "metrics" ? <div className="space-y-4"><div className="grid grid-cols-3 gap-2">{Object.entries(metrics.data?.final_metrics ?? {}).slice(0, 3).map(([k, v]) => <div key={k} className="rounded-lg border border-border p-3 text-center"><p className="text-xl font-semibold text-violet-700">{v.toFixed(1)}%</p><p className="text-xs text-text-secondary">{k}</p></div>)}</div><MetricsChart data={metrics.data?.training_history ?? []} /></div> : null}
          {tab === "files" ? <div className="space-y-2">{model.files.map((f) => <div key={f.name} className="flex items-center justify-between rounded-md border border-border p-2 text-sm"><span>{f.name}</span><span className="text-text-secondary">{f.size} · {f.type}</span><Button size="sm" variant="ghost">Download</Button></div>)}</div> : null}
          {tab === "usage" ? <div className="space-y-2"><div className="flex items-center justify-between"><p className="text-sm font-medium">Python</p><Button size="sm" variant="ghost"><Link2 size={14} />Copy</Button></div><pre className="overflow-x-auto rounded-md bg-bg-elevated p-3 font-mono text-xs">{code}</pre></div> : null}
          {tab === "versions" ? <VersionTimeline versions={versions.data ?? []} /> : null}
        </div>
        <div className="border-t border-border px-5 py-3">
          <p className="mb-2 text-xs text-text-secondary">Load vào workspace</p>
          <div className="flex items-center gap-2">
            <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="h-9 rounded-md border border-border px-2 text-sm"><option value="ws_resnet">ResNet Training</option><option value="ws_eda">EDA Session</option></select>
            <input value={mountPath} onChange={(e) => setMountPath(e.target.value)} className="h-9 flex-1 rounded-md border border-border px-2 text-sm" />
            <Button className="bg-violet-500 text-white hover:bg-violet-600" onClick={() => onLoad(model, workspaceId, mountPath)}>Load Model</Button>
          </div>
        </div>
      </motion.aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <p><span className="text-text-tertiary">{label}: </span><span className="font-medium text-text-primary">{value}</span></p>;
}
