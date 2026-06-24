"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, FileArchive, Package, UploadCloud } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { inspectGeneralModel, inspectYoloModel, uploadGeneralModel, uploadYoloModel } from "@/lib/api/models";
import { useStorageProviders } from "@/lib/hooks/useStorageProviders";
import { cn } from "@/lib/utils/cn";
import { useYoloUploadStore } from "@/lib/stores/yoloUploadStore";
import { motion } from "framer-motion";
import type { Model, ModelInspectIssue, ModelInspectResponse } from "@/types/model";

type UploadMode = "yolo" | "general";

const INITIAL_FORM = {
  name: "",
  version: "v1.0",
  description: "",
  architecture: "",
  task: "object_detection",
  framework: "onnx",
  tags: "",
  dataset_version_id: "",
  run_id: "",
  experiment_id: ""
};

export function ModelUploadModal({
  open,
  onClose,
  onUploaded
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: (model: Model) => void;
}) {
  const [mode, setMode] = React.useState<UploadMode>("yolo");
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [inspecting, setInspecting] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [inspectResult, setInspectResult] = React.useState<ModelInspectResponse | null>(null);
  const [uploaded, setUploaded] = React.useState<Model | null>(null);
  const [issues, setIssues] = React.useState<{ errors: ModelInspectIssue[]; warnings: ModelInspectIssue[] }>({ errors: [], warnings: [] });
  const [form, setForm] = React.useState({ ...INITIAL_FORM });
  const [importedMetadata, setImportedMetadata] = React.useState<Record<string, unknown> | null>(null);
  const [versionTouched, setVersionTouched] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const metadataInputRef = React.useRef<HTMLInputElement | null>(null);
  
  const [storageProviderId, setStorageProviderId] = React.useState("");
  const { data: storageProviders = [], isLoading: isLoadingStorageProviders } = useStorageProviders();
  const selectedProviderId = storageProviderId;

  const { yoloType, setYoloType } = useYoloUploadStore();

  const resetState = React.useCallback(() => {
    setMode("yolo");
    setFile(null);
    setDragging(false);
    setInspecting(false);
    setSubmitting(false);
    setInspectResult(null);
    setUploaded(null);
    setIssues({ errors: [], warnings: [] });
    setForm({ ...INITIAL_FORM });
    setImportedMetadata(null);
    setVersionTouched(false);
    setStorageProviderId("");
    if (inputRef.current) inputRef.current.value = "";
    if (metadataInputRef.current) metadataInputRef.current.value = "";
  }, []);

  React.useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  const accept = mode === "yolo"
    ? ".zip,application/zip"
    : ".onnx,.pt,.pth,.h5,.safetensors,.zip,application/zip";

  const payloadForRequest = () => ({
    name: form.name,
    version: versionTouched ? form.version : "",
    description: form.description,
    architecture: form.architecture,
    task: form.task,
    framework: form.framework,
    tags: form.tags,
    dataset_version_id: form.dataset_version_id,
    run_id: form.run_id,
    experiment_id: form.experiment_id,
    yolo_type: yoloType,
    storage_provider_id: selectedProviderId
  });

  const selectFile = (selected: File | null) => {
    if (!selected) return;
    const lower = selected.name.toLowerCase();
    const valid = mode === "yolo"
      ? lower.endsWith(".zip")
      : lower.endsWith(".onnx") || lower.endsWith(".pt") || lower.endsWith(".pth") || lower.endsWith(".h5") || lower.endsWith(".safetensors") || lower.endsWith(".zip");
    if (!valid) {
      setIssues({
        errors: [{
          code: "CLIENT_INVALID_FILE_TYPE",
          message: mode === "yolo" ? "YOLO model upload requires a ZIP package." : "Supported files: .onnx, .pt, .pth, .h5, .safetensors, .zip.",
          severity: "error"
        }],
        warnings: []
      });
      return;
    }

    setFile(selected);
    setInspectResult(null);
    setUploaded(null);
    setIssues({ errors: [], warnings: [] });
    setForm((current) => ({
      ...current,
      name: current.name.trim() || filenameStem(selected.name),
      description: current.description.trim() || defaultDescription(selected.name, mode),
      architecture: current.architecture.trim() || (mode === "yolo" ? "yolo11n" : "")
    }));
  };

  const inspect = async () => {
    if (!file) return;
    setInspecting(true);
    setInspectResult(null);
    setUploaded(null);
    setIssues({ errors: [], warnings: [] });
    try {
      const payload = payloadForRequest();
      const response = mode === "yolo"
        ? await inspectYoloModel(file, payload)
        : await inspectGeneralModel(file, payload);
      setInspectResult(response);
      setIssues({ errors: response.validation_report.errors, warnings: response.validation_report.warnings });
      setForm((current) => ({
        ...current,
        name: response.form.name || current.name,
        version: versionTouched ? current.version : (response.form.version || current.version),
        description: response.form.description || current.description,
        architecture: response.form.architecture || current.architecture,
        framework: response.form.framework || current.framework,
        task: response.form.task || current.task,
        tags: response.form.tags.join(", ") || current.tags
      }));
      setVersionTouched(false);
    } catch (error) {
      setIssues(parseUploadError(error));
    } finally {
      setInspecting(false);
    }
  };

  const submit = async () => {
    if (!file || !inspectResult) return;
    setSubmitting(true);
    setIssues({ errors: [], warnings: [] });
    try {
      const tags = form.tags.split(",").map((item) => item.trim()).filter(Boolean);
      const importedMetrics = numericMetricsFromMetadata(importedMetadata);
      const primaryMetricName = importedMetadata
        ? stringValue(importedMetadata.primary_metric_name) || Object.keys(importedMetrics)[0] || "metric"
        : inspectResult.metadata.primary_metric_name || "metric";
      const model = mode === "yolo"
        ? await uploadYoloModel(file, {
          name: form.name,
          version: form.version,
          description: form.description,
          architecture: form.architecture,
          task: form.task,
          tags: form.tags,
          dataset_version_id: form.dataset_version_id,
          run_id: form.run_id,
          experiment_id: form.experiment_id,
          yolo_type: yoloType,
          storage_provider_id: selectedProviderId
        })
        : await uploadGeneralModel(file, {
          ...(importedMetadata ?? {}),
          name: form.name,
          version: form.version,
          description: form.description,
          architecture: form.architecture,
          framework: form.framework,
          task_type: form.task,
          tags,
          primary_metric_name: primaryMetricName,
          primary_metric_value: importedMetrics[primaryMetricName] ?? numericValue(importedMetadata?.primary_metric_value) ?? inspectResult.metadata.primary_metric_value ?? 0,
          all_metrics: Object.keys(importedMetrics).length ? importedMetrics : (inspectResult.metadata.all_metrics ?? undefined),
          storage_provider_id: selectedProviderId
        });
      setUploaded(model);
      const validation = model.custom_metadata?.validation_report;
      if (validation && typeof validation === "object") {
        const payload = validation as { errors?: ModelInspectIssue[]; warnings?: ModelInspectIssue[] };
        setIssues({ errors: payload.errors ?? [], warnings: payload.warnings ?? [] });
      }
      onUploaded(model);
    } catch (error) {
      setIssues(parseUploadError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const importMetadata = async (selected: File | null) => {
    if (!selected) return;
    try {
      const parsed = JSON.parse(await selected.text()) as Record<string, unknown>;
      setImportedMetadata(parsed);
      const modelInfo = objectValue(parsed.model_info);
      const datasetLineage = objectValue(parsed.dataset_lineage);
      const versioning = objectValue(parsed.versioning);
      setForm((current) => ({
        ...current,
        name: stringValue(modelInfo.name) || stringValue(parsed.name) || current.name,
        version: stringValue(modelInfo.version) || stringValue(parsed.version) || current.version,
        description: stringValue(modelInfo.description) || stringValue(parsed.description) || current.description,
        architecture: stringValue(modelInfo.architecture) || stringValue(parsed.architecture) || current.architecture,
        framework: stringValue(modelInfo.framework) || stringValue(parsed.framework) || current.framework,
        task: stringValue(modelInfo.task) || stringValue(parsed.task_type) || current.task,
        dataset_version_id: stringValue(datasetLineage.dataset_version_id) || stringValue(parsed.dataset_version_id) || current.dataset_version_id,
        run_id: stringValue(versioning.run_id) || stringValue(parsed.run_id) || current.run_id,
        experiment_id: stringValue(versioning.experiment_id) || stringValue(parsed.experiment_id) || current.experiment_id,
        tags: Array.isArray(modelInfo.tags) ? modelInfo.tags.map(String).join(", ") : Array.isArray(parsed.tags) ? parsed.tags.map(String).join(", ") : current.tags
      }));
      setIssues({ errors: [], warnings: [{ code: "METADATA_IMPORTED", message: `Imported ${selected.name}`, severity: "warning" }] });
    } catch {
      setIssues({ errors: [{ code: "CLIENT_INVALID_METADATA", message: "Metadata JSON is invalid.", severity: "error" }], warnings: [] });
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title="Upload Model"
      size="lg"
      showCloseButton
      closeOnBackdrop={false}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-xs text-text-tertiary">{file ? `${file.name} · ${formatBytes(file.size)}` : "No file selected"}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>Close</Button>
            {uploaded ? (
              <Button className="bg-violet-600 text-white hover:bg-violet-500" onClick={resetState} disabled={submitting}>
                Upload another
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => void inspect()} disabled={!file || inspecting || submitting} loading={inspecting}>
                  Read
                </Button>
                <Button className="bg-violet-600 text-white hover:bg-violet-500" onClick={() => void submit()} disabled={!file || !inspectResult || submitting || inspecting} loading={submitting}>
                  Upload
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-bg-elevated p-1">
          <TabButton active={mode === "yolo"} onClick={() => switchMode("yolo", setMode, setFile, setInspectResult, setUploaded, setIssues, setImportedMetadata)} icon={<FileArchive size={15} />} label="YOLO Model" />
          <TabButton active={mode === "general"} onClick={() => switchMode("general", setMode, setFile, setInspectResult, setUploaded, setIssues, setImportedMetadata)} icon={<Package size={15} />} label="General Model" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Storage Provider (Data Layer)">
            <div className="relative">
              <UploadCloud size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <select
                className={`${inputCls()} w-full pl-9`}
                value={storageProviderId}
                onChange={(e) => setStorageProviderId(e.target.value)}
                disabled={isLoadingStorageProviders}
              >
                <option value="">Server Default (Internal MinIO)</option>
                {storageProviders.filter(p => p.id !== "server-default-minio").map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type})
                  </option>
                ))}
              </select>
            </div>
          </Field>
        </div>

        {mode === "yolo" ? (
          <div className="space-y-3">
            <div className="flex w-fit rounded-md bg-bg-elevated p-1 shadow-sm">
              {(["detection", "classification", "segmentation", "pose"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    if (file && yoloType !== type) {
                      setIssues({ errors: [], warnings: [{ code: "TYPE_CHANGED", message: "Changing YOLO type may invalidate current file structure", severity: "warning" }] });
                    }
                    setYoloType(type);
                  }}
                  className={cn("relative rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors", yoloType === type ? "text-violet-700" : "text-text-secondary hover:text-text-primary")}
                >
                  {yoloType === type && (
                    <motion.div layoutId="yoloTypeTab" className="absolute inset-0 rounded bg-white shadow-sm" style={{ zIndex: 0 }} transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />
                  )}
                  <span className="relative z-10">{type}</span>
                </button>
              ))}
            </div>
            <YoloPackageHelp type={yoloType} />
          </div>
        ) : <GeneralModelHelp />}

        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            selectFile(event.dataTransfer.files?.[0] ?? null);
          }}
          className={cn("flex min-h-36 w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center transition-colors", dragging ? "border-violet-500 bg-violet-50" : "border-border bg-white hover:bg-bg-elevated")}
        >
          <UploadCloud className="mb-2 text-violet-600" size={26} />
          <p className="text-sm font-medium text-text-primary">{file ? file.name : "Drop file here or click to browse"}</p>
          <p className="mt-1 text-xs text-text-secondary">{mode === "yolo" ? "ZIP with weights/best.pt or weights/last.pt and model.metadata.json when available" : "Single artifact or ZIP package with optional metadata JSON"}</p>
        </button>

        <input ref={metadataInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => void importMetadata(event.target.files?.[0] ?? null)} />

        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-elevated" onClick={() => metadataInputRef.current?.click()}>
            Import metadata JSON
          </button>
        </div>

        <ModelFields form={form} setForm={setForm} setVersionTouched={setVersionTouched} mode={mode} />


        <IssueList title="Errors" issues={issues.errors} tone="error" />
        <IssueList title="Warnings" issues={issues.warnings} tone="warning" />
        {inspectResult && !uploaded ? <InspectPreview result={inspectResult} /> : null}
        {uploaded ? <UploadPreview model={uploaded} /> : null}
      </div>
    </Modal>
  );
}

function switchMode(
  mode: UploadMode,
  setMode: React.Dispatch<React.SetStateAction<UploadMode>>,
  setFile: React.Dispatch<React.SetStateAction<File | null>>,
  setInspectResult: React.Dispatch<React.SetStateAction<ModelInspectResponse | null>>,
  setUploaded: React.Dispatch<React.SetStateAction<Model | null>>,
  setIssues: React.Dispatch<React.SetStateAction<{ errors: ModelInspectIssue[]; warnings: ModelInspectIssue[] }>>,
  setImportedMetadata: React.Dispatch<React.SetStateAction<Record<string, unknown> | null>>
) {
  setMode(mode);
  setFile(null);
  setInspectResult(null);
  setUploaded(null);
  setIssues({ errors: [], warnings: [] });
  setImportedMetadata(null);
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium", active ? "bg-white text-violet-700 shadow-sm" : "text-text-secondary hover:text-text-primary")}>
      {icon}
      {label}
    </button>
  );
}

function YoloPackageHelp({ type }: { type: string }) {
  const getTemplate = () => {
    switch (type) {
      case "classification":
        return `model/
├── weights/best.pt
├── exports/best.onnx
├── reports/metrics.json
├── samples/class_preds.jpg
├── args.yaml
└── model.metadata.json`;
      case "segmentation":
        return `model/
├── weights/best.pt
├── masks/
├── reports/results.csv
└── model.metadata.json`;
      case "pose":
        return `model/
├── weights/best.pt
├── reports/results.csv
└── model.metadata.json`;
      case "detection":
      default:
        return `model/
├── weights/best.pt
├── exports/best.onnx
├── reports/results.csv
├── samples/val_batch0_pred.jpg
├── args.yaml
└── model.metadata.json`;
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-violet-100 bg-violet-50 p-3 text-sm text-violet-950">
      <p className="font-medium capitalize">YOLO {type} package should include weights/best.pt or weights/last.pt.</p>
      <pre className="mt-2 overflow-x-auto rounded-md bg-white p-2 text-xs text-slate-700">{getTemplate()}</pre>
    </motion.div>
  );
}

function GeneralModelHelp() {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3 text-sm text-text-secondary">
      Upload a single trained model artifact. Use YOLO Model for Ultralytics run packages with reports, samples, and lineage metadata.
    </div>
  );
}

function ModelFields({
  form,
  setForm,
  setVersionTouched,
  mode
}: {
  form: typeof INITIAL_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof INITIAL_FORM>>;
  setVersionTouched: React.Dispatch<React.SetStateAction<boolean>>;
  mode: UploadMode;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field label="Model name">
        <input className={inputCls()} value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Inferred from file if empty" />
      </Field>
      <Field label="Version">
        <input
          className={inputCls()}
          value={form.version}
          onChange={(event) => {
            setVersionTouched(true);
            setForm((prev) => ({ ...prev, version: event.target.value }));
          }}
          placeholder="Resolved after Read"
        />
      </Field>
      <Field label="Architecture">
        <input className={inputCls()} value={form.architecture} onChange={(event) => setForm((prev) => ({ ...prev, architecture: event.target.value }))} placeholder={mode === "yolo" ? "yolo11n, yolov8s..." : "ResNet-50, BERT-base..."} />
      </Field>
      <Field label="Task">
        <select className={inputCls()} value={form.task} onChange={(event) => setForm((prev) => ({ ...prev, task: event.target.value }))}>
          <option value="object_detection">Object Detection</option>
          <option value="semantic_segmentation">Segmentation</option>
          <option value="image_classification">Image Classification</option>
          <option value="text_classification">Text Classification</option>
          <option value="text_generation">Text Generation</option>
          <option value="regression">Regression</option>
        </select>
      </Field>
      {mode === "general" ? (
        <Field label="Framework">
          <select className={inputCls()} value={form.framework} onChange={(event) => setForm((prev) => ({ ...prev, framework: event.target.value }))}>
            <option value="onnx">ONNX</option>
            <option value="pytorch">PyTorch</option>
            <option value="tensorflow">TensorFlow</option>
            <option value="huggingface">HuggingFace</option>
            <option value="sklearn">Scikit-learn</option>
            <option value="ultralytics">Ultralytics</option>
          </select>
        </Field>
      ) : null}
      <Field label="Tags">
        <input className={inputCls()} value={form.tags} onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="yolo, traffic, production" />
      </Field>
      <Field label="Description">
        <input className={inputCls()} value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Briefly describe this model" />
      </Field>
    </div>
  );
}

function InspectPreview({ result }: { result: ModelInspectResponse }) {
  const meta = result.metadata;
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-violet-800">
        <CheckCircle2 size={16} />
        Read {result.form.name || meta.name} · {meta.format}
      </div>
      <div className="space-y-2 text-sm">
        <p><span className="text-text-tertiary">Framework:</span> {meta.framework}</p>
        <p><span className="text-text-tertiary">Task:</span> {meta.task_type.replaceAll("_", " ")}</p>
        {meta.architecture ? <p><span className="text-text-tertiary">Architecture:</span> {meta.architecture}</p> : null}
        {meta.size_bytes ? <p><span className="text-text-tertiary">Size:</span> {formatBytes(meta.size_bytes)}</p> : null}
        {meta.primary_metric_name && meta.primary_metric_value !== undefined ? (
          <p><span className="text-text-tertiary">{meta.primary_metric_name}:</span> {meta.primary_metric_value.toFixed(4)}</p>
        ) : null}
        {meta.all_metrics && Object.keys(meta.all_metrics).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {Object.entries(meta.all_metrics).slice(0, 6).map(([key, value]) => (
              <span key={key} className="rounded-md bg-white px-2 py-0.5 text-xs text-text-secondary">
                {key}: {typeof value === "number" ? value.toFixed(4) : value}
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex gap-3 text-xs text-text-tertiary">
          {meta.has_weights !== undefined ? <span>Weights: {meta.has_weights ? "✓" : "✗"}</span> : null}
          {meta.has_onnx !== undefined ? <span>ONNX export: {meta.has_onnx ? "✓" : "✗"}</span> : null}
        </div>
      </div>
    </div>
  );
}

function UploadPreview({ model }: { model: Model }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800">
        <CheckCircle2 size={16} />
        Uploaded {model.name} · {model.version}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary md:grid-cols-4">
        <span>Framework: {model.framework}</span>
        <span>Task: {model.task_type.replaceAll("_", " ")}</span>
        <span>Metric: {model.primary_metric_name} {model.primary_metric_value}</span>
        <span>Status: {model.status}</span>
      </div>
    </div>
  );
}

function IssueList({ title, issues, tone }: { title: string; issues: ModelInspectIssue[]; tone: "error" | "warning" }) {
  if (issues.length === 0) return null;
  return (
    <div className={cn("rounded-lg border p-3 text-sm", tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900")}>
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <AlertTriangle size={15} />
        {title}
      </div>
      <div className="space-y-1">
        {issues.slice(0, 10).map((issue, index) => (
          <p key={`${issue.code}-${index}`} className="text-xs">
            <span className="font-semibold">{issue.code}</span>: {issue.message}
            {issue.path ? <span> · {issue.path}</span> : null}
          </p>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[12.5px] font-medium text-text-secondary">
      {label}
      {children}
    </label>
  );
}

function inputCls() {
  return "h-9 rounded-md border border-border bg-white px-3 text-sm text-text-primary focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100";
}

function parseUploadError(error: unknown): { errors: ModelInspectIssue[]; warnings: ModelInspectIssue[] } {
  const maybe = error as { response?: { data?: { detail?: unknown; message?: unknown; error_code?: unknown } } };
  const detail = maybe.response?.data?.detail;
  if (detail && typeof detail === "object") {
    const payload = detail as { errors?: ModelInspectIssue[]; warnings?: ModelInspectIssue[]; message?: string };
    return {
      errors: payload.errors?.length ? payload.errors : [{ code: "UPLOAD_FAILED", message: payload.message || "Upload failed", severity: "error" }],
      warnings: payload.warnings ?? []
    };
  }
  const message = typeof detail === "string"
    ? detail
    : typeof maybe.response?.data?.message === "string"
      ? maybe.response.data.message
      : "Upload failed";
  return { errors: [{ code: String(maybe.response?.data?.error_code ?? "UPLOAD_FAILED"), message, severity: "error" }], warnings: [] };
}

function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function filenameStem(filename: string) {
  const clean = filename.replace(/\\/g, "/").split("/").pop() || "model";
  return clean.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "model";
}

function defaultDescription(filename: string, mode: UploadMode) {
  const name = filenameStem(filename);
  return mode === "yolo" ? `YOLO model imported from ${name}` : `Model imported from ${name}`;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function numericMetricsFromMetadata(metadata: Record<string, unknown> | null) {
  const result: Record<string, number> = {};
  if (!metadata) return result;
  const candidates = [objectValue(metadata.all_metrics), objectValue(metadata.metrics)];
  for (const source of candidates) {
    for (const [key, value] of Object.entries(source)) {
      const parsed = numericValue(value);
      if (parsed !== undefined) result[key] = parsed;
    }
  }
  return result;
}
