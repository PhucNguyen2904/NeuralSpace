"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Link2, Pencil, Plus, Trash2, UploadCloud, X } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { MetricsChart } from "@/components/models/MetricsChart";
import { VersionTimeline } from "@/components/models/VersionTimeline";
import { useToast } from "@/lib/hooks/useToast";
import { useDeleteModel, useModelDetail, useUpdateModel, useUploadModelVersion } from "@/lib/hooks/useModels";
import { cn } from "@/lib/utils/cn";
import type { Model } from "@/types/model";

type Tab = "overview" | "metrics" | "files" | "usage" | "versions";
type CustomField = { key: string; value: string };

export function ModelDetailDrawer({
  modelId,
  open,
  onClose
}: {
  modelId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { detail, metrics, versions } = useModelDetail(modelId ?? "");
  const updateModel = useUpdateModel();
  const deleteModel = useDeleteModel();
  const uploadVersion = useUploadModelVersion();
  const model = detail.data;
  const [tab, setTab] = React.useState<Tab>("overview");
  const [versionModalOpen, setVersionModalOpen] = React.useState(false);
  const [metadataModalOpen, setMetadataModalOpen] = React.useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = React.useState(false);
  const [versionFile, setVersionFile] = React.useState<File | null>(null);
  const [metadataForm, setMetadataForm] = React.useState({
    description: "",
    architecture: "",
    framework: "onnx",
    taskType: "image_classification",
    status: "ready",
    parameterCount: "",
    primaryMetricName: "accuracy",
    primaryMetricValue: "",
    datasetId: "",
    frameworkVersion: "",
    inputShape: "",
    outputShape: "",
    tags: "",
    customFields: [] as CustomField[]
  });
  const [versionForm, setVersionForm] = React.useState({
    version: "",
    changelog: "",
    primaryMetricName: model?.primary_metric_name ?? "accuracy",
    primaryMetricValue: model ? String(model.primary_metric_value) : "",
    frameworkVersion: model?.framework_version ?? ""
  });
  const mountPath = "/workspace/models/resnet50";

  React.useEffect(() => {
    if (!model) return;
    setVersionForm((prev) => ({
      ...prev,
      primaryMetricName: model.primary_metric_name,
      primaryMetricValue: String(model.primary_metric_value),
      frameworkVersion: model.framework_version ?? ""
    }));
    setVersionFile(null);
    setMetadataForm({
      description: model.description ?? "",
      architecture: model.architecture ?? "",
      framework: model.framework,
      taskType: model.task_type,
      status: model.status,
      parameterCount: String(model.parameter_count ?? 0),
      primaryMetricName: model.primary_metric_name,
      primaryMetricValue: String(model.primary_metric_value),
      datasetId: model.dataset_id ?? "",
      frameworkVersion: model.framework_version ?? "",
      inputShape: model.input_shape ?? "",
      outputShape: model.output_shape ?? "",
      tags: model.tags.join(", "),
      customFields: Object.entries(model.custom_metadata ?? {}).map(([key, value]) => ({
        key,
        value: String(value)
      }))
    });
  }, [model?.id, model?.primary_metric_name, model?.primary_metric_value, model?.framework_version]);

  if (!open || !model) return null;

  const submitMetadata = async () => {
    const parameterCount = Number(metadataForm.parameterCount);
    const metricValue = Number(metadataForm.primaryMetricValue);
    if (!Number.isInteger(parameterCount) || parameterCount < 0) {
      toast.warning("Parameter count must be a non-negative integer");
      return;
    }
    if (!Number.isFinite(metricValue)) {
      toast.warning("Metric value must be a valid number");
      return;
    }
    try {
      await updateModel.mutateAsync({
        modelId: model.id,
        payload: {
          description: metadataForm.description.trim(),
          architecture: metadataForm.architecture.trim(),
          framework: metadataForm.framework as Model["framework"],
          task_type: metadataForm.taskType as Model["task_type"],
          status: metadataForm.status as Model["status"],
          parameter_count: parameterCount,
          primary_metric_name: metadataForm.primaryMetricName.trim(),
          primary_metric_value: metricValue,
          metrics: { [metadataForm.primaryMetricName.trim() || "metric"]: metricValue },
          dataset_id: metadataForm.datasetId.trim() || undefined,
          framework_version: metadataForm.frameworkVersion.trim(),
          input_shape: metadataForm.inputShape.trim(),
          output_shape: metadataForm.outputShape.trim(),
          custom_metadata: fieldsToMetadata(metadataForm.customFields),
          tags: metadataForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
        }
      });
      toast.success("Model metadata updated");
      setMetadataModalOpen(false);
    } catch {
      toast.error("Failed to update model metadata");
    }
  };

  const submitVersionUpload = async () => {
    if (!versionFile) {
      toast.warning("Select a new model file before uploading");
      return;
    }
    const metricValue = Number(versionForm.primaryMetricValue);
    const hasMetric = versionForm.primaryMetricName.trim() && Number.isFinite(metricValue);
    try {
      await uploadVersion.mutateAsync({
        modelId: model.id,
        file: versionFile,
        metadata: {
          version: versionForm.version.trim() || undefined,
          changelog: versionForm.changelog.trim() || undefined,
          framework_version: versionForm.frameworkVersion.trim() || undefined,
          primary_metric_name: hasMetric ? versionForm.primaryMetricName.trim() : undefined,
          primary_metric_value: hasMetric ? metricValue : undefined,
          metrics: hasMetric ? { [versionForm.primaryMetricName.trim()]: metricValue } : undefined
        }
      });
      toast.success("New model version uploaded");
      setVersionFile(null);
      setVersionForm((prev) => ({ ...prev, version: "", changelog: "" }));
      setVersionModalOpen(false);
      setTab("versions");
    } catch {
      toast.error("Failed to upload version");
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteModel.mutateAsync(model.id);
      toast.success("Model deleted");
      setDeleteModalOpen(false);
      setDeleteConfirmed(false);
      onClose();
    } catch {
      toast.error("Failed to delete model");
    }
  };

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
            <Button size="sm" variant="outline" onClick={() => setMetadataModalOpen(true)}>
              <Pencil size={14} /> Edit
            </Button>
            <Button size="sm" variant="outline" onClick={() => setVersionModalOpen(true)}>
              <UploadCloud size={14} /> New version
            </Button>
            <Button size="sm" variant="ghost" className="text-error-600 hover:text-error-700" onClick={() => setDeleteModalOpen(true)}>
              <Trash2 size={14} />
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}><X size={16} /></Button>
          </div>
        </div>
        <div className="border-b border-border px-5 py-2">
          <div className="flex gap-2 text-sm">
            {(["overview", "metrics", "files", "usage", "versions"] as Tab[]).map((t) => (
              <button key={t} className={tab === t ? "rounded-md bg-violet-50 px-2 py-1 text-violet-700" : "rounded-md px-2 py-1 text-text-secondary"} onClick={() => setTab(t)}>{t.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div className="h-[calc(100%-120px)] overflow-y-auto px-5 py-4">
          {tab === "overview" ? <div className="grid grid-cols-2 gap-3 text-sm"><Info label="Task" value={model.task_type.replaceAll("_", " ")} /><Info label="Framework" value={model.framework_version} /><Info label="Input" value={model.input_shape} /><Info label="Output" value={model.output_shape} /><Info label="Parameters" value={`${(model.parameter_count / 1_000_000).toFixed(1)}M`} /><Info label="Model size" value={`${(model.size_bytes / 1024 ** 2).toFixed(1)} MB`} /><Info label="Dataset" value={model.dataset_id ?? "ImageNet 2017"} /><Info label="Trained by" value={model.created_by} /></div> : null}
          {tab === "metrics" ? <div className="space-y-4"><div className="grid grid-cols-3 gap-2">{Object.entries(metrics.data?.final_metrics ?? {}).slice(0, 3).map(([k, v]) => <div key={k} className="rounded-lg border border-border p-3 text-center"><p className="text-xl font-semibold text-violet-700">{v.toFixed(1)}%</p><p className="text-xs text-text-secondary">{k}</p></div>)}</div><MetricsChart data={metrics.data?.training_history ?? []} /></div> : null}
          {tab === "files" ? <div className="space-y-2">{model.files.map((f) => <div key={f.name} className="flex items-center justify-between rounded-md border border-border p-2 text-sm"><span>{f.name}</span><span className="text-text-secondary">{f.size} · {f.type}</span><Button size="sm" variant="ghost">Download</Button></div>)}</div> : null}
          {tab === "usage" ? <div className="space-y-2"><div className="flex items-center justify-between"><p className="text-sm font-medium">Python</p><Button size="sm" variant="ghost"><Link2 size={14} />Copy</Button></div><pre className="overflow-x-auto rounded-md bg-bg-elevated p-3 font-mono text-xs">{code}</pre></div> : null}
          {tab === "versions" ? <VersionTimeline versions={versions.data ?? []} /> : null}
        </div>
      </motion.aside>
      <Modal
        open={versionModalOpen}
        onClose={() => !uploadVersion.isPending && setVersionModalOpen(false)}
        title="Upload model version"
        size="md"
        showCloseButton
        closeOnBackdrop={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setVersionModalOpen(false)} disabled={uploadVersion.isPending}>Cancel</Button>
            <Button className="bg-violet-600 text-white hover:bg-violet-500" onClick={() => void submitVersionUpload()} disabled={uploadVersion.isPending}>
              {uploadVersion.isPending ? "Uploading..." : "Upload version"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-bg-elevated/40 px-3 py-3 text-sm hover:bg-bg-elevated">
            <span className="min-w-0">
              <span className="block font-medium text-text-primary">{versionFile?.name ?? "Select a new model artifact"}</span>
              <span className="block truncate text-xs text-text-secondary">.onnx, .pt, .pth, .h5, .safetensors</span>
            </span>
            <UploadCloud size={18} className="shrink-0 text-violet-600" />
            <input
              type="file"
              accept=".onnx,.pt,.pth,.h5,.safetensors"
              className="hidden"
              onChange={(event) => setVersionFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <VersionField label="Version">
              <input className={versionInputCls()} value={versionForm.version} onChange={(e) => setVersionForm((p) => ({ ...p, version: e.target.value }))} placeholder={`Sau ${model.version}`} />
            </VersionField>
            <VersionField label="Framework version">
              <input className={versionInputCls()} value={versionForm.frameworkVersion} onChange={(e) => setVersionForm((p) => ({ ...p, frameworkVersion: e.target.value }))} placeholder="PyTorch 2.3, ONNX opset 17..." />
            </VersionField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <VersionField label="Primary metric">
              <input className={versionInputCls()} value={versionForm.primaryMetricName} onChange={(e) => setVersionForm((p) => ({ ...p, primaryMetricName: e.target.value }))} placeholder="accuracy" />
            </VersionField>
            <VersionField label="Metric value">
              <input className={versionInputCls()} type="number" step="0.001" value={versionForm.primaryMetricValue} onChange={(e) => setVersionForm((p) => ({ ...p, primaryMetricValue: e.target.value }))} placeholder="0.92" />
            </VersionField>
          </div>
          <VersionField label="Changelog">
            <textarea className={cn(versionInputCls(), "min-h-20 resize-none")} value={versionForm.changelog} onChange={(e) => setVersionForm((p) => ({ ...p, changelog: e.target.value }))} placeholder="Key changes in this version" />
          </VersionField>
        </div>
      </Modal>
      <Modal
        open={metadataModalOpen}
        onClose={() => !updateModel.isPending && setMetadataModalOpen(false)}
        title="Update model metadata"
        size="lg"
        showCloseButton
        closeOnBackdrop={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMetadataModalOpen(false)} disabled={updateModel.isPending}>Cancel</Button>
            <Button className="bg-violet-600 text-white hover:bg-violet-500" onClick={() => void submitMetadata()} disabled={updateModel.isPending}>
              {updateModel.isPending ? "Saving..." : "Save metadata"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <VersionField label="Description">
            <textarea className={cn(versionInputCls(), "min-h-20 resize-none")} value={metadataForm.description} onChange={(e) => setMetadataForm((p) => ({ ...p, description: e.target.value }))} />
          </VersionField>
          <div className="grid grid-cols-2 gap-3">
            <VersionField label="Architecture">
              <input className={versionInputCls()} value={metadataForm.architecture} onChange={(e) => setMetadataForm((p) => ({ ...p, architecture: e.target.value }))} />
            </VersionField>
            <VersionField label="Framework">
              <select className={versionInputCls()} value={metadataForm.framework} onChange={(e) => setMetadataForm((p) => ({ ...p, framework: e.target.value }))}>
                <option value="onnx">onnx</option>
                <option value="pytorch">pytorch</option>
                <option value="tensorflow">tensorflow</option>
                <option value="huggingface">huggingface</option>
                <option value="sklearn">sklearn</option>
              </select>
            </VersionField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <VersionField label="Task type">
              <select className={versionInputCls()} value={metadataForm.taskType} onChange={(e) => setMetadataForm((p) => ({ ...p, taskType: e.target.value }))}>
                <option value="image_classification">image_classification</option>
                <option value="object_detection">object_detection</option>
                <option value="semantic_segmentation">semantic_segmentation</option>
                <option value="text_classification">text_classification</option>
                <option value="text_generation">text_generation</option>
                <option value="regression">regression</option>
              </select>
            </VersionField>
            <VersionField label="Status">
              <select className={versionInputCls()} value={metadataForm.status} onChange={(e) => setMetadataForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="ready">ready</option>
                <option value="training">training</option>
                <option value="trained">trained</option>
                <option value="failed">failed</option>
              </select>
            </VersionField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <VersionField label="Parameters">
              <input className={versionInputCls()} type="number" min="0" value={metadataForm.parameterCount} onChange={(e) => setMetadataForm((p) => ({ ...p, parameterCount: e.target.value }))} />
            </VersionField>
            <VersionField label="Dataset ID">
              <input className={versionInputCls()} value={metadataForm.datasetId} onChange={(e) => setMetadataForm((p) => ({ ...p, datasetId: e.target.value }))} />
            </VersionField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <VersionField label="Primary metric">
              <input className={versionInputCls()} value={metadataForm.primaryMetricName} onChange={(e) => setMetadataForm((p) => ({ ...p, primaryMetricName: e.target.value }))} />
            </VersionField>
            <VersionField label="Metric value">
              <input className={versionInputCls()} type="number" step="0.001" value={metadataForm.primaryMetricValue} onChange={(e) => setMetadataForm((p) => ({ ...p, primaryMetricValue: e.target.value }))} />
            </VersionField>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <VersionField label="Framework version">
              <input className={versionInputCls()} value={metadataForm.frameworkVersion} onChange={(e) => setMetadataForm((p) => ({ ...p, frameworkVersion: e.target.value }))} />
            </VersionField>
            <VersionField label="Input shape">
              <input className={versionInputCls()} value={metadataForm.inputShape} onChange={(e) => setMetadataForm((p) => ({ ...p, inputShape: e.target.value }))} />
            </VersionField>
            <VersionField label="Output shape">
              <input className={versionInputCls()} value={metadataForm.outputShape} onChange={(e) => setMetadataForm((p) => ({ ...p, outputShape: e.target.value }))} />
            </VersionField>
          </div>
          <VersionField label="Tags">
            <input className={versionInputCls()} value={metadataForm.tags} onChange={(e) => setMetadataForm((p) => ({ ...p, tags: e.target.value }))} placeholder="vision, production, baseline" />
          </VersionField>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[12.5px] font-medium text-text-secondary">Custom fields</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setMetadataForm((prev) => ({ ...prev, customFields: [...prev.customFields, { key: "", value: "" }] }))}
              >
                <Plus size={14} /> Add field
              </Button>
            </div>
            {metadataForm.customFields.map((field, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input
                  className={versionInputCls()}
                  value={field.key}
                  onChange={(event) => setMetadataForm((prev) => updateCustomField(prev, index, "key", event.target.value))}
                  placeholder="field_name"
                />
                <input
                  className={versionInputCls()}
                  value={field.value}
                  onChange={(event) => setMetadataForm((prev) => updateCustomField(prev, index, "value", event.target.value))}
                  placeholder="value"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setMetadataForm((prev) => ({ ...prev, customFields: prev.customFields.filter((_, itemIndex) => itemIndex !== index) }))}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Modal>
      <Modal
        open={deleteModalOpen}
        onClose={() => !deleteModel.isPending && setDeleteModalOpen(false)}
        title={
          <div className="flex items-center gap-2 text-error-600">
            <AlertTriangle size={18} />
            <span>Delete model permanently?</span>
          </div>
        }
        size="sm"
        showCloseButton
        closeOnBackdrop={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)} disabled={deleteModel.isPending}>Cancel</Button>
            <Button variant="danger" onClick={() => void confirmDelete()} disabled={!deleteConfirmed || deleteModel.isPending}>
              {deleteModel.isPending ? "Deleting..." : "Delete permanently"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-md border border-error-200 bg-error-50 p-3 text-sm text-error-800">
            <p className="font-semibold">Warning: This action cannot be undone.</p>
            <p className="mt-1">All data, training history, and versions for model <strong className="font-semibold">{model.name}</strong> will be permanently deleted from the system.</p>
          </div>
          <label className="inline-flex cursor-pointer items-start gap-2.5 text-sm text-text-secondary transition-colors hover:text-text-primary">
            <input 
              type="checkbox" 
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border text-error-600 transition-colors focus:ring-error-500" 
              checked={deleteConfirmed} 
              onChange={(event) => setDeleteConfirmed(event.target.checked)} 
            />
            <span className="leading-tight">I understand this data will be lost and cannot be restored, and I confirm deletion.</span>
          </label>
        </div>
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <p><span className="text-text-tertiary">{label}: </span><span className="font-medium text-text-primary">{value}</span></p>;
}

function VersionField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[12.5px] font-medium text-text-secondary">
      {label}
      {children}
    </label>
  );
}

function versionInputCls() {
  return "w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100";
}

function updateCustomField<T extends { customFields: CustomField[] }>(
  form: T,
  index: number,
  property: keyof CustomField,
  value: string
): T {
  return {
    ...form,
    customFields: form.customFields.map((field, itemIndex) =>
      itemIndex === index ? { ...field, [property]: value } : field
    )
  };
}

function fieldsToMetadata(fields: CustomField[]) {
  return fields.reduce<Record<string, string>>((metadata, field) => {
    const key = field.key.trim();
    const value = field.value.trim();
    if (key && value) metadata[key] = value;
    return metadata;
  }, {});
}
