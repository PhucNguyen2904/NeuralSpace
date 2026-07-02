"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, FileArchive, FileJson, Package, UploadCloud } from "lucide-react";
import { motion } from "framer-motion";
import { Button, Modal } from "@/components/ui";
import { inspectGeneralModel, inspectYoloModel } from "@/lib/api/models";
import { useUploadModelVersion } from "@/lib/hooks/useModels";
import { useToast } from "@/lib/hooks/useToast";
import { useStorageConnections } from "@/lib/hooks/useStorageProviders";
import { useYoloUploadStore } from "@/lib/stores/yoloUploadStore";
import { cn } from "@/lib/utils/cn";
import type { ModelInspectIssue, ModelInspectResponse, UploadModelVersionMetadata } from "@/types/model";

type UploadMode = "yolo" | "general";

interface UploadVersionModalProps {
  open: boolean;
  onClose: () => void;
  modelId: string;
  modelName: string;
  currentVersion: string;
  primaryMetricName: string;
  primaryMetricValue: number;
  /** Pre-select mode based on the model's framework */
  defaultMode?: UploadMode;
  onUploaded: () => void;
}

export function UploadVersionModal({
  open,
  onClose,
  modelId,
  modelName,
  currentVersion,
  primaryMetricName,
  primaryMetricValue,
  defaultMode = "yolo",
  onUploaded
}: UploadVersionModalProps) {
  const { toast } = useToast();
  const uploadVersion = useUploadModelVersion();
  const { data: storageConnections = [] } = useStorageConnections();
  const { yoloType, setYoloType } = useYoloUploadStore();
  const metadataInputRef = React.useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = React.useState<UploadMode>(defaultMode);
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [inspecting, setInspecting] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [inspectResult, setInspectResult] = React.useState<ModelInspectResponse | null>(null);
  const [issues, setIssues] = React.useState<{ errors: ModelInspectIssue[]; warnings: ModelInspectIssue[] }>({ errors: [], warnings: [] });
  const [importedMetadata, setImportedMetadata] = React.useState<Partial<UploadModelVersionMetadata> | null>(null);
  const [metadataFileName, setMetadataFileName] = React.useState("");
  const [storageProviderId, setStorageProviderId] = React.useState("");
  const [form, setForm] = React.useState({
    version: "",
    changelog: "",
    primaryMetricName,
    primaryMetricValue: String(primaryMetricValue),
    frameworkVersion: "",
    branch: "",
    commit: ""
  });

  const reset = React.useCallback(() => {
    setMode(defaultMode);
    setFile(null);
    setDragging(false);
    setInspecting(false);
    setSubmitting(false);
    setInspectResult(null);
    setIssues({ errors: [], warnings: [] });
    setImportedMetadata(null);
    setMetadataFileName("");
    setStorageProviderId("");
    setForm({ version: "", changelog: "", primaryMetricName, primaryMetricValue: String(primaryMetricValue), frameworkVersion: "", branch: "", commit: "" });
  }, [defaultMode, primaryMetricName, primaryMetricValue]);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const accept = mode === "yolo" ? ".zip,application/zip" : ".onnx,.pt,.pth,.h5,.safetensors,.zip,application/zip";

  const switchMode = (next: UploadMode) => {
    setMode(next);
    setFile(null);
    setInspectResult(null);
    setIssues({ errors: [], warnings: [] });
    setImportedMetadata(null);
  };

  const selectFile = (selected: File | null) => {
    if (!selected) return;
    const lower = selected.name.toLowerCase();
    const valid = mode === "yolo"
      ? lower.endsWith(".zip")
      : [".onnx", ".pt", ".pth", ".h5", ".safetensors", ".zip"].some((ext) => lower.endsWith(ext));
    if (!valid) {
      setIssues({
        errors: [{
          code: "INVALID_FILE",
          message: mode === "yolo" ? "YOLO version upload requires a ZIP package." : "Supported: .onnx, .pt, .pth, .h5, .safetensors, .zip",
          severity: "error"
        }],
        warnings: []
      });
      return;
    }
    setFile(selected);
    setInspectResult(null);
    setIssues({ errors: [], warnings: [] });
  };

  const inspect = async () => {
    if (!file) return;
    setInspecting(true);
    setInspectResult(null);
    setIssues({ errors: [], warnings: [] });
    try {
      const payload = {
        name: modelName,
        version: form.version || "",
        description: "",
        architecture: "",
        task: "object_detection",
        framework: mode === "yolo" ? "ultralytics" : "onnx",
        tags: "",
        dataset_version_id: "",
        run_id: "",
        experiment_id: "",
        yolo_type: yoloType,
        storage_provider_id: storageProviderId
      };
      const result = mode === "yolo"
        ? await inspectYoloModel(file, payload)
        : await inspectGeneralModel(file, payload);
      setInspectResult(result);
      setIssues({ errors: result.validation_report.errors, warnings: result.validation_report.warnings });
      setForm((prev) => ({
        ...prev,
        version: prev.version || result.form.version || prev.version,
        primaryMetricName: result.metadata.primary_metric_name || prev.primaryMetricName,
        primaryMetricValue: result.metadata.primary_metric_value != null ? String(result.metadata.primary_metric_value) : prev.primaryMetricValue,
        frameworkVersion: result.form.framework || prev.frameworkVersion
      }));
    } catch {
      setIssues({ errors: [{ code: "INSPECT_FAILED", message: "Failed to read the file. Please check the package structure and try again.", severity: "error" }], warnings: [] });
    } finally {
      setInspecting(false);
    }
  };

  const importMetadata = async (f: File | null) => {
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text()) as Partial<UploadModelVersionMetadata>;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid");
      const parsedMetricValue = Number(parsed.primary_metric_value);
      setImportedMetadata(parsed);
      setMetadataFileName(f.name);
      setForm((prev) => ({
        ...prev,
        version: typeof parsed.version === "string" ? parsed.version : prev.version,
        changelog: typeof parsed.changelog === "string" ? parsed.changelog : prev.changelog,
        frameworkVersion: typeof parsed.framework_version === "string" ? parsed.framework_version : prev.frameworkVersion,
        branch: typeof parsed.branch === "string" ? parsed.branch : prev.branch,
        commit: typeof parsed.git_commit === "string" ? parsed.git_commit : typeof parsed.commit === "string" ? parsed.commit : prev.commit,
        primaryMetricName: typeof parsed.primary_metric_name === "string" ? parsed.primary_metric_name : prev.primaryMetricName,
        primaryMetricValue: Number.isFinite(parsedMetricValue) ? String(parsedMetricValue) : prev.primaryMetricValue
      }));
      toast.success("Imported version metadata JSON");
    } catch {
      toast.error("Invalid metadata JSON");
    }
  };

  const submit = async () => {
    if (!file || !inspectResult) return;
    setSubmitting(true);
    const metricValue = Number(form.primaryMetricValue);
    const hasMetric = form.primaryMetricName.trim() && Number.isFinite(metricValue);
    const metadata: UploadModelVersionMetadata & Record<string, unknown> = {
      ...(importedMetadata ?? {}),
      version: form.version.trim() || importedMetadata?.version,
      changelog: form.changelog.trim() || importedMetadata?.changelog,
      framework_version: form.frameworkVersion.trim() || importedMetadata?.framework_version,
      branch: form.branch.trim() || importedMetadata?.branch,
      git_commit: form.commit.trim() || importedMetadata?.git_commit || importedMetadata?.commit,
      primary_metric_name: hasMetric ? form.primaryMetricName.trim() : importedMetadata?.primary_metric_name,
      primary_metric_value: hasMetric ? metricValue : importedMetadata?.primary_metric_value,
      metrics: hasMetric ? { [form.primaryMetricName.trim()]: metricValue } : importedMetadata?.metrics,
      ...(mode === "yolo" ? { yolo_type: yoloType } : {}),
      ...(storageProviderId ? { storage_provider_id: storageProviderId } : {})
    };
    try {
      await uploadVersion.mutateAsync({ modelId, file, metadata });
      toast.success("New version uploaded successfully");
      onUploaded();
    } catch {
      toast.error("Failed to upload version");
      setSubmitting(false);
    }
  };

  const isPending = inspecting || submitting || uploadVersion.isPending;

  return (
    <Modal
      open={open}
      onClose={() => !isPending && onClose()}
      title={`Upload new version — ${modelName}`}
      size="lg"
      showCloseButton
      closeOnBackdrop={false}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-xs text-text-tertiary">{file ? `${file.name} · ${formatBytes(file.size)}` : "No file selected"}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>Close</Button>
            <Button variant="outline" onClick={() => void inspect()} disabled={!file || isPending} loading={inspecting}>
              Read
            </Button>
            <Button
              className="bg-violet-600 text-white hover:bg-violet-500"
              onClick={() => void submit()}
              disabled={!file || !inspectResult || issues.errors.length > 0 || isPending}
              loading={submitting || uploadVersion.isPending}
            >
              Upload version
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-bg-elevated p-1">
          <ModeTab active={mode === "yolo"} onClick={() => switchMode("yolo")} icon={<FileArchive size={15} />} label="YOLO Model" />
          <ModeTab active={mode === "general"} onClick={() => switchMode("general")} icon={<Package size={15} />} label="General Model" />
        </div>

        {/* YOLO sub-type selector */}
        {mode === "yolo" ? (
          <div className="space-y-3">
            <div className="flex w-fit rounded-md bg-bg-elevated p-1 shadow-sm">
              {(["detection", "classification", "segmentation", "pose"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    if (file && yoloType !== type) {
                      setIssues({ errors: [], warnings: [{ code: "TYPE_CHANGED", message: "Changing YOLO type may invalidate the current file structure.", severity: "warning" }] });
                    }
                    setYoloType(type);
                  }}
                  className={cn("relative rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors", yoloType === type ? "text-violet-700" : "text-text-secondary hover:text-text-primary")}
                >
                  {yoloType === type && (
                    <motion.div layoutId="versionYoloTypeTab" className="absolute inset-0 rounded bg-white shadow-sm" style={{ zIndex: 0 }} transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />
                  )}
                  <span className="relative z-10">{type}</span>
                </button>
              ))}
            </div>
            <YoloHelp type={yoloType} />
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-bg-elevated p-3 text-sm text-text-secondary">
            Upload a single trained model artifact (.onnx, .pt, .pth, .h5, .safetensors, or ZIP).
          </div>
        )}

        {/* Storage Provider */}
        {storageConnections.length > 0 ? (
          <div>
            <label className="mb-1 block text-[12.5px] font-medium text-text-secondary">Storage Provider</label>
            <select
              className="h-9 w-full rounded-md border border-border bg-white px-3 text-sm focus:border-violet-400 focus:outline-none"
              value={storageProviderId}
              onChange={(e) => setStorageProviderId(e.target.value)}
            >
              <option value="">Server Default (Internal MinIO)</option>
              {storageConnections.map((p) => (
                <option key={p.id} value={p.id}>{p.display_name} ({p.provider})</option>
              ))}
            </select>
          </div>
        ) : null}

        {/* Drop zone */}
        <button
          type="button"
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = accept;
            input.onchange = (e) => selectFile((e.target as HTMLInputElement).files?.[0] ?? null);
            input.click();
          }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); selectFile(e.dataTransfer.files?.[0] ?? null); }}
          className={cn(
            "flex min-h-32 w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
            dragging ? "border-violet-500 bg-violet-50" : "border-border bg-white hover:bg-bg-elevated"
          )}
        >
          <UploadCloud className="mb-2 text-violet-600" size={26} />
          <p className="text-sm font-medium text-text-primary">{file ? file.name : "Drop file here or click to browse"}</p>
          <p className="mt-1 text-xs text-text-secondary">
            {mode === "yolo" ? "ZIP package with weights/best.pt and optional model.metadata.json" : "Single artifact or ZIP package"}
          </p>
        </button>

        {/* Metadata JSON import */}
        <input
          ref={metadataInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => { void importMetadata(e.target.files?.[0] ?? null); if (e.target) e.target.value = ""; }}
        />
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2 text-sm">
          <div className="flex min-w-0 items-center gap-2">
            <FileJson size={16} className="shrink-0 text-violet-600" />
            <p className="truncate text-[13px] text-text-secondary">{metadataFileName || "No version metadata JSON selected"}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => metadataInputRef.current?.click()} disabled={isPending}>
            Import JSON
          </Button>
        </div>

        {/* Form fields */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Version">
            <input className={inputCls()} value={form.version} onChange={(e) => setForm((p) => ({ ...p, version: e.target.value }))} placeholder={`After ${currentVersion}`} />
          </Field>
          <Field label="Framework version">
            <input className={inputCls()} value={form.frameworkVersion} onChange={(e) => setForm((p) => ({ ...p, frameworkVersion: e.target.value }))} placeholder="PyTorch 2.3, ONNX opset 17..." />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Primary metric">
            <input className={inputCls()} value={form.primaryMetricName} onChange={(e) => setForm((p) => ({ ...p, primaryMetricName: e.target.value }))} placeholder="accuracy" />
          </Field>
          <Field label="Metric value">
            <input className={inputCls()} type="number" step="0.001" value={form.primaryMetricValue} onChange={(e) => setForm((p) => ({ ...p, primaryMetricValue: e.target.value }))} placeholder="0.92" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Git branch">
            <input className={inputCls()} value={form.branch} onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))} placeholder="main" />
          </Field>
          <Field label="Git commit">
            <input className={inputCls()} value={form.commit} onChange={(e) => setForm((p) => ({ ...p, commit: e.target.value }))} placeholder="a1b2c3d" />
          </Field>
        </div>
        <Field label="Changelog">
          <textarea className={cn(inputCls(), "min-h-[72px] resize-none")} value={form.changelog} onChange={(e) => setForm((p) => ({ ...p, changelog: e.target.value }))} placeholder="Key changes in this version" />
        </Field>

        {/* Results */}
        {issues.errors.length > 0 ? <IssueList title="Errors" issues={issues.errors} tone="error" /> : null}
        {issues.warnings.length > 0 ? <IssueList title="Warnings" issues={issues.warnings} tone="warning" /> : null}
        {inspectResult && issues.errors.length === 0 ? <InspectPreview result={inspectResult} /> : null}
      </div>
    </Modal>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModeTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium", active ? "bg-white text-violet-700 shadow-sm" : "text-text-secondary hover:text-text-primary")}
    >
      {icon} {label}
    </button>
  );
}

function YoloHelp({ type }: { type: string }) {
  const templates: Record<string, string> = {
    detection: `model/\n├── weights/best.pt\n├── exports/best.onnx\n├── reports/results.csv\n├── samples/val_batch0_pred.jpg\n├── args.yaml\n└── model.metadata.json`,
    classification: `model/\n├── weights/best.pt\n├── exports/best.onnx\n├── reports/metrics.json\n├── samples/class_preds.jpg\n├── args.yaml\n└── model.metadata.json`,
    segmentation: `model/\n├── weights/best.pt\n├── masks/\n├── reports/results.csv\n└── model.metadata.json`,
    pose: `model/\n├── weights/best.pt\n├── reports/results.csv\n└── model.metadata.json`
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-violet-100 bg-violet-50 p-3 text-sm text-violet-950">
      <p className="font-medium capitalize">YOLO {type} package should include weights/best.pt or weights/last.pt.</p>
      <pre className="mt-2 overflow-x-auto rounded-md bg-white p-2 text-xs text-slate-700">{templates[type] ?? templates.detection}</pre>
    </motion.div>
  );
}

function InspectPreview({ result }: { result: ModelInspectResponse }) {
  const meta = result.metadata;
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-violet-800">
        <CheckCircle2 size={16} /> Read {result.form.name || meta.name} · {meta.format}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <p><span className="text-text-tertiary">Framework:</span> {meta.framework}</p>
        <p><span className="text-text-tertiary">Task:</span> {meta.task_type?.replaceAll("_", " ")}</p>
        {meta.size_bytes ? <p><span className="text-text-tertiary">Size:</span> {formatBytes(meta.size_bytes)}</p> : null}
        {meta.primary_metric_name && meta.primary_metric_value != null ? (
          <p><span className="text-text-tertiary">{meta.primary_metric_name}:</span> {meta.primary_metric_value.toFixed(4)}</p>
        ) : null}
        <div className="col-span-2 flex gap-3 text-xs text-text-tertiary">
          {meta.has_weights !== undefined ? <span>Weights: {meta.has_weights ? "✓" : "✗"}</span> : null}
          {meta.has_onnx !== undefined ? <span>ONNX export: {meta.has_onnx ? "✓" : "✗"}</span> : null}
        </div>
      </div>
    </div>
  );
}

function IssueList({ title, issues, tone }: { title: string; issues: ModelInspectIssue[]; tone: "error" | "warning" }) {
  return (
    <details className={cn("group rounded-lg border p-3 text-sm", tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900")}>
      <summary className="flex cursor-pointer select-none list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden">
        <AlertTriangle size={15} /> {title} ({issues.length})
        <svg className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </summary>
      <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pl-5">
        {issues.map((issue, i) => (
          <p key={i} className="text-xs"><span className="font-semibold">{issue.code}</span>: {issue.message}</p>
        ))}
      </div>
    </details>
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
  return "w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100";
}

function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}
