"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Database, FileArchive, FileSpreadsheet, UploadCloud } from "lucide-react";
import { motion } from "framer-motion";
import { Button, Modal } from "@/components/ui";
import { inspectGeneralDataset, inspectYoloDataset, uploadGeneralDataset, uploadYoloDataset } from "@/lib/api/datasets";
import { useGitAccounts, useGitRepositories } from "@/lib/hooks/useGitIntegration";
import { useStorageConnections } from "@/lib/hooks/useStorageProviders";
import { useYoloDatasetTaskStore } from "@/lib/stores/yoloDatasetTaskStore";
import { cn } from "@/lib/utils/cn";
import type { DatasetInspectResponse, DatasetUploadIssue, DatasetUploadResponse } from "@/types/dataset";

type UploadMode = "yolo" | "general";

const INITIAL_FORM = {
  name: "",
  version: "",
  description: "",
  tags: "",
  dataset_type: "tabular",
  task: "custom",
  label_column: ""
};

type FormState = typeof INITIAL_FORM;

// ── YOLO task tab config ──────────────────────────────────────────────────────
const YOLO_TASK_TABS = [
  { key: "object_detection",       label: "Detection",      short: "DET"  },
  { key: "image_classification",   label: "Classification", short: "CLS"  },
  { key: "instance_segmentation",  label: "Segmentation",   short: "SEG"  },
  { key: "pose_estimation",        label: "Pose",           short: "POSE" },
  { key: "obb",                    label: "OBB",            short: "OBB"  },
] as const;

type YoloTaskKey = typeof YOLO_TASK_TABS[number]["key"];

function getYoloPackageTemplate(task: YoloTaskKey): string {
  switch (task) {
    case "image_classification":
      return `dataset/\n├── data.yaml\n├── images/\n│   ├── train/\n│   │   ├── class_a/\n│   │   └── class_b/\n│   └── val/\n│       ├── class_a/\n│       └── class_b/\n└── (no labels/ needed)`;
    case "instance_segmentation":
      return `dataset/\n├── data.yaml\n├── images/\n│   ├── train/\n│   └── val/\n└── labels/      ← polygon format\n    ├── train/   (class cx cy x1 y1 x2 y2...)\n    └── val/`;
    case "pose_estimation":
      return `dataset/\n├── data.yaml    ← kpt_shape: [17, 3]\n├── images/\n│   ├── train/\n│   └── val/\n└── labels/      ← keypoint format\n    ├── train/\n    └── val/`;
    case "obb":
      return `dataset/\n├── data.yaml\n├── images/\n│   ├── train/\n│   └── val/\n└── labels/      ← OBB format\n    ├── train/   (class cx cy w h angle)\n    └── val/`;
    case "object_detection":
    default:
      return `dataset/\n├── data.yaml\n├── images/\n│   ├── train/\n│   └── val/\n└── labels/      ← YOLO bbox format\n    ├── train/   (class cx cy w h)\n    └── val/`;
  }
}

export function DatasetUploadModal({
  open,
  onClose,
  onUploaded,
  initialDatasetName
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  initialDatasetName?: string;
}) {
  const [mode, setMode] = React.useState<UploadMode>("yolo");
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [inspecting, setInspecting] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [inspectResult, setInspectResult] = React.useState<DatasetInspectResponse | null>(null);
  const [result, setResult] = React.useState<DatasetUploadResponse | null>(null);
  const [issues, setIssues] = React.useState<{ errors: DatasetUploadIssue[]; warnings: DatasetUploadIssue[] }>({ errors: [], warnings: [] });
  const [form, setForm] = React.useState({ ...INITIAL_FORM, name: initialDatasetName || "" });
  const [versionTouched, setVersionTouched] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dvcMode, setDvcMode] = React.useState<"default" | "git">("default");
  const [gitAccountId, setGitAccountId] = React.useState("");
  const [gitRepoId, setGitRepoId] = React.useState("");

  const { data: gitAccounts = [], isLoading: isLoadingGitAccounts } = useGitAccounts();
  const selectedGitAccountId = gitAccountId || gitAccounts[0]?.id || "";
  const { data: gitRepos = [], isLoading: isLoadingGitRepos } = useGitRepositories(selectedGitAccountId);
  const trackedGitRepos = React.useMemo(() => gitRepos.filter((r) => r.is_tracked), [gitRepos]);
  const selectedGitRepoId = gitRepoId || trackedGitRepos[0]?.id || "";

  const [storageProviderId, setStorageProviderId] = React.useState("");
  const { data: storageConnections = [], isLoading: isLoadingStorageConnections } = useStorageConnections();

  const { yoloTask, setYoloTask } = useYoloDatasetTaskStore();

  const resetState = React.useCallback(() => {
    setMode("yolo");
    setFile(null);
    setDragging(false);
    setInspecting(false);
    setSubmitting(false);
    setInspectResult(null);
    setResult(null);
    setIssues({ errors: [], warnings: [] });
    setForm({ ...INITIAL_FORM, name: initialDatasetName || "" });
    setDvcMode("default");
    setGitAccountId("");
    setGitRepoId("");
    setStorageProviderId("");
    setVersionTouched(false);
    if (inputRef.current) inputRef.current.value = "";
  }, [initialDatasetName]);

  React.useEffect(() => {
    if (!open) {
      resetState();
    } else if (initialDatasetName) {
      setForm((prev) => ({ ...prev, name: initialDatasetName }));
    }
  }, [open, resetState, initialDatasetName]);

  const accept = mode === "yolo" ? ".zip,application/zip" : ".csv,.json,.parquet,.zip";

  const selectFile = (selected: File | null) => {
    if (!selected) return;
    const lower = selected.name.toLowerCase();
    const valid = mode === "yolo"
      ? lower.endsWith(".zip")
      : lower.endsWith(".csv") || lower.endsWith(".json") || lower.endsWith(".parquet") || lower.endsWith(".zip");
    if (!valid) {
      setIssues({
        errors: [{ code: "CLIENT_INVALID_FILE_TYPE", message: mode === "yolo" ? "YOLO upload requires a ZIP file." : "Supported files: CSV, JSON, Parquet, ZIP.", severity: "error" }],
        warnings: []
      });
      return;
    }
    setFile(selected);
    setForm((current) => ({
      ...current,
      version: versionTouched ? current.version : "",
      name: current.name.trim() || filenameStem(selected.name),
      description: current.description.trim() || defaultDescription(selected.name, mode)
    }));
    setInspectResult(null);
    setResult(null);
    setIssues({ errors: [], warnings: [] });
  };

  const payloadForRequest = () => ({
    name: form.name,
    version: versionTouched ? form.version : "",
    description: form.description,
    tags: form.tags,
    dataset_type: form.dataset_type,
    task: mode === "yolo" ? yoloTask : form.task,
    label_column: form.label_column,
    git_repository_id: dvcMode === "git" ? selectedGitRepoId : "",
    storage_provider_id: storageProviderId
  });

  const inspect = async () => {
    if (!file) return;
    setInspecting(true);
    setInspectResult(null);
    setResult(null);
    setIssues({ errors: [], warnings: [] });
    try {
      const response = mode === "yolo"
        ? await inspectYoloDataset(file, payloadForRequest())
        : await inspectGeneralDataset(file, payloadForRequest());
      setInspectResult(response);
      setIssues({ errors: response.validation_report.errors, warnings: response.validation_report.warnings });
      setForm((current) => ({
        ...current,
        name: response.form.name || current.name,
        version: response.form.version || current.version,
        description: response.form.description || current.description,
        tags: response.form.tags.join(", "),
        dataset_type: response.form.dataset_type,
        task: response.form.task
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
      const response = mode === "yolo"
        ? await uploadYoloDataset(file, payloadForRequest())
        : await uploadGeneralDataset(file, payloadForRequest());
      setResult(response);
      setIssues({ errors: response.validation_report.errors, warnings: response.validation_report.warnings });
      onUploaded();
    } catch (error) {
      setIssues(parseUploadError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title="Upload Dataset"
      size="lg"
      showCloseButton
      closeOnBackdrop={false}
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-xs text-text-tertiary">{file ? `${file.name} · ${formatBytes(file.size)}` : "No file selected"}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>Close</Button>
            {result ? (
              <Button className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={resetState} disabled={submitting}>
                Upload another
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => void inspect()} disabled={!file || inspecting || submitting} loading={inspecting}>
                  Read
                </Button>
                <Button className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => void submit()} disabled={!file || !inspectResult || issues.errors.length > 0 || (dvcMode === "git" && !selectedGitRepoId) || submitting || inspecting} loading={submitting}>
                  Upload
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ── Mode tabs ── */}
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-bg-elevated p-1">
          <TabButton active={mode === "yolo"} onClick={() => switchMode("yolo", setMode, setFile, setInspectResult, setResult, setIssues)} icon={<FileArchive size={15} />} label="YOLO Dataset" />
          <TabButton active={mode === "general"} onClick={() => switchMode("general", setMode, setFile, setInspectResult, setResult, setIssues)} icon={<FileSpreadsheet size={15} />} label="General Dataset" />
        </div>

        {/* ── Storage provider ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Storage Provider (Data Layer)">
            <div className="relative">
              <UploadCloud size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <select
                className={`${inputCls()} w-full pl-9`}
                value={storageProviderId}
                onChange={(e) => setStorageProviderId(e.target.value)}
                disabled={isLoadingStorageConnections || submitting}
              >
                <option value="">Server Default (Internal MinIO)</option>
                {storageConnections.map((p) => (
                  <option key={p.id} value={p.id}>{p.display_name} ({p.provider})</option>
                ))}
              </select>
            </div>
          </Field>

          <Field label="Version Control Storage">
            <div className="relative">
              <Database size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <select
                className={`${inputCls()} w-full pl-9`}
                value={dvcMode}
                onChange={(e) => setDvcMode(e.target.value as "default" | "git")}
                disabled={submitting}
              >
                <option value="default">Server Default</option>
                <option value="git">External Git Repository</option>
              </select>
            </div>
          </Field>
        </div>

        {/* ── Git repo (conditional) ── */}
        {dvcMode === "git" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-border bg-bg-surface/50 p-3">
            <Field label="Git Account (Version Layer)">
              <div className="relative">
                <Database size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <select
                  className={`${inputCls()} w-full pl-9`}
                  value={selectedGitAccountId}
                  onChange={(e) => { setGitAccountId(e.target.value); setGitRepoId(""); }}
                  disabled={submitting || isLoadingGitAccounts || gitAccounts.length === 0}
                >
                  {gitAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.provider} (@{account.username})</option>
                  ))}
                </select>
              </div>
              {gitAccounts.length === 0 ? <span className="text-xs text-red-600">No connected Git accounts.</span> : null}
            </Field>
            <Field label="Git Repository">
              <div className="relative">
                <Database size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <select
                  className={`${inputCls()} w-full pl-9`}
                  value={selectedGitRepoId}
                  onChange={(e) => setGitRepoId(e.target.value)}
                  disabled={submitting || isLoadingGitRepos || trackedGitRepos.length === 0 || !selectedGitAccountId}
                >
                  {trackedGitRepos.map((repo) => (
                    <option key={repo.id} value={repo.id}>{repo.repo_name}</option>
                  ))}
                </select>
              </div>
              {selectedGitAccountId && trackedGitRepos.length === 0 ? <span className="text-xs text-amber-600">No tracked repositories.</span> : null}
            </Field>
          </div>
        )}

        {/* ── YOLO task selector / General help ── */}
        {mode === "yolo" ? (
          <div className="space-y-3">
            {/* Pill tab row — same pattern as ModelUploadModal */}
            <div className="flex w-fit rounded-md bg-bg-elevated p-1 shadow-sm">
              {YOLO_TASK_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => {
                    if (file && yoloTask !== key) {
                      setIssues({ errors: [], warnings: [{ code: "TASK_CHANGED", message: "Please click 'Read' again to validate your dataset against the new task type", severity: "warning" }] });
                    }
                    setYoloTask(key);
                  }}
                  className={cn(
                    "relative rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    yoloTask === key ? "text-emerald-700" : "text-text-secondary hover:text-text-primary"
                  )}
                >
                  {yoloTask === key && (
                    <motion.div
                      layoutId="yoloDatasetTaskTab"
                      className="absolute inset-0 rounded bg-white shadow-sm"
                      style={{ zIndex: 0 }}
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </button>
              ))}
            </div>
            <YoloDatasetHelp task={yoloTask} />
          </div>
        ) : (
          <GeneralDatasetHelp />
        )}

        {/* ── Drop zone ── */}
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0] ?? null); }}
          className={cn(
            "flex min-h-36 w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
            dragging ? "border-emerald-500 bg-emerald-50" : "border-border bg-white hover:bg-bg-elevated"
          )}
        >
          <UploadCloud className="mb-2 text-emerald-600" size={26} />
          <p className="text-sm font-medium text-text-primary">{file ? file.name : "Drop file here or click to browse"}</p>
          <p className="mt-1 text-xs text-text-secondary">{mode === "yolo" ? "ZIP with data.yaml, images, and labels" : "CSV, JSON, Parquet, or custom ZIP"}</p>
        </button>

        {/* ── Dataset fields ── */}
        <DatasetFields form={form} setForm={setForm} setVersionTouched={setVersionTouched} mode={mode} initialDatasetName={initialDatasetName} />

        <IssueList title="Errors" issues={issues.errors} tone="error" />
        <IssueList title="Warnings" issues={issues.warnings} tone="warning" />
        {inspectResult && !result ? <InspectPreview result={inspectResult} /> : null}
        {result ? <UploadPreview result={result} /> : null}
      </div>
    </Modal>
  );
}

// ── Helper: switch mode ───────────────────────────────────────────────────────
function switchMode(
  mode: UploadMode,
  setMode: React.Dispatch<React.SetStateAction<UploadMode>>,
  setFile: React.Dispatch<React.SetStateAction<File | null>>,
  setInspectResult: React.Dispatch<React.SetStateAction<DatasetInspectResponse | null>>,
  setResult: React.Dispatch<React.SetStateAction<DatasetUploadResponse | null>>,
  setIssues: React.Dispatch<React.SetStateAction<{ errors: DatasetUploadIssue[]; warnings: DatasetUploadIssue[] }>>
) {
  setMode(mode);
  setFile(null);
  setInspectResult(null);
  setResult(null);
  setIssues({ errors: [], warnings: [] });
}

// ── TabButton ─────────────────────────────────────────────────────────────────
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium", active ? "bg-white text-emerald-700 shadow-sm" : "text-text-secondary hover:text-text-primary")}
    >
      {icon}
      {label}
    </button>
  );
}

// ── YOLO dataset help panel ───────────────────────────────────────────────────
function YoloDatasetHelp({ task }: { task: YoloTaskKey }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-950"
    >
      <p className="font-medium capitalize">
        YOLO {task.replace(/_/g, " ")} dataset structure:
      </p>
      <pre className="mt-2 overflow-x-auto rounded-md bg-white p-2 text-xs text-slate-700">
        {getYoloPackageTemplate(task)}
      </pre>
    </motion.div>
  );
}

// ── General dataset help ──────────────────────────────────────────────────────
function GeneralDatasetHelp() {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3 text-sm text-text-secondary">
      Upload a CSV, JSON, Parquet, or custom ZIP dataset. Use YOLO Dataset for Ultralytics-format datasets with data.yaml, images, and labels.
    </div>
  );
}

// ── Dataset fields ────────────────────────────────────────────────────────────
function DatasetFields({
  form,
  setForm,
  setVersionTouched,
  mode,
  initialDatasetName
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  setVersionTouched: React.Dispatch<React.SetStateAction<boolean>>;
  mode: UploadMode;
  initialDatasetName?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field label="Dataset name">
        <input
          className={inputCls()}
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="Inferred from file if empty"
          disabled={!!initialDatasetName}
        />
      </Field>
      <Field label="Version">
        <input
          className={inputCls()}
          value={form.version}
          onChange={(e) => { setVersionTouched(true); setForm((prev) => ({ ...prev, version: e.target.value })); }}
          placeholder="Resolved after Read"
        />
      </Field>
      {mode === "general" && (
        <>
          <Field label="Dataset type">
            <select className={inputCls()} value={form.dataset_type} onChange={(e) => setForm((prev) => ({ ...prev, dataset_type: e.target.value }))}>
              <option value="tabular">Tabular</option>
              <option value="image">Image</option>
              <option value="text">Text</option>
              <option value="audio">Audio</option>
              <option value="video">Video</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
          <Field label="Task">
            <select className={inputCls()} value={form.task} onChange={(e) => setForm((prev) => ({ ...prev, task: e.target.value }))}>
              <option value="classification">Classification</option>
              <option value="regression">Regression</option>
              <option value="clustering">Clustering</option>
              <option value="nlp">NLP</option>
              <option value="custom">Custom</option>
            </select>
          </Field>
          <Field label="Label column">
            <input className={inputCls()} value={form.label_column} onChange={(e) => setForm((prev) => ({ ...prev, label_column: e.target.value }))} placeholder="optional" />
          </Field>
        </>
      )}
      <Field label="Tags">
        <input className={inputCls()} value={form.tags} onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))} placeholder="vision, gold, training" />
      </Field>
      <Field label="Description">
        <input className={inputCls()} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder={mode === "yolo" ? "YOLO dataset description" : "Dataset notes"} />
      </Field>
    </div>
  );
}

// ── Inspect / Upload previews ─────────────────────────────────────────────────
function InspectPreview({ result }: { result: DatasetInspectResponse }) {
  const preview = result.preview;
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-800">
        <CheckCircle2 size={16} />
        Read {result.form.name || result.metadata.name} · {result.metadata.format}
      </div>
      <div className="space-y-2 text-sm">
        <p><span className="text-text-tertiary">Items:</span> {result.metadata.item_count}</p>
        <p><span className="text-text-tertiary">Type:</span> {result.metadata.dataset_type} · {result.metadata.task}</p>
        {preview.classes ? <p><span className="text-text-tertiary">Classes:</span> {preview.classes.join(", ") || "-"}</p> : null}
        {preview.columns?.length ? (
          <div className="max-h-36 overflow-auto rounded-md bg-white">
            {preview.columns.slice(0, 8).map((col) => (
              <div key={col.name} className="grid grid-cols-[1fr_90px_80px] gap-2 border-b border-border px-2 py-1 text-xs">
                <span className="truncate">{col.name}</span>
                <span>{col.type}</span>
                <span>{col.missing ?? 0} missing</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function UploadPreview({ result }: { result: DatasetUploadResponse }) {
  const preview = result.preview;
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-800">
        <CheckCircle2 size={16} />
        Uploaded {result.dataset.name} · {result.version.version}
      </div>
      {preview.classes ? (
        <div className="space-y-2 text-sm">
          <p><span className="text-text-tertiary">Classes:</span> {preview.classes.join(", ") || "-"}</p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(preview.splits ?? {}).map(([split, counts]) => (
              <div key={split} className="rounded-md bg-white p-2">
                <p className="font-medium capitalize">{split}</p>
                <p className="text-xs text-text-secondary">{counts.images ?? 0} images · {counts.labels ?? 0} labels · {counts.annotations ?? 0} boxes</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <p><span className="text-text-tertiary">Format:</span> {preview.format}</p>
          <p><span className="text-text-tertiary">Rows/files:</span> {preview.row_count ?? preview.record_count ?? preview.file_count ?? 0}</p>
          {preview.columns?.length ? (
            <div className="max-h-36 overflow-auto rounded-md bg-white">
              {preview.columns.slice(0, 8).map((col) => (
                <div key={col.name} className="grid grid-cols-[1fr_90px_80px] gap-2 border-b border-border px-2 py-1 text-xs">
                  <span className="truncate">{col.name}</span>
                  <span>{col.type}</span>
                  <span>{col.missing ?? 0} missing</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Issue list ────────────────────────────────────────────────────────────────
function IssueList({ title, issues, tone }: { title: string; issues: DatasetUploadIssue[]; tone: "error" | "warning" }) {
  if (issues.length === 0) return null;
  return (
    <details className={cn("rounded-lg border p-3 text-sm group", tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900")}>
      <summary className="flex items-center gap-2 font-semibold cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <AlertTriangle size={15} />
        {title} ({issues.length})
        <svg className="w-4 h-4 ml-auto transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </summary>
      <div className="mt-3 space-y-1 max-h-48 overflow-y-auto pl-6">
        {issues.map((issue, index) => (
          <p key={`${issue.code}-${index}`} className="text-xs">
            <span className="font-semibold">{issue.code}</span>: {issue.message}
            {issue.path ? <span> · {issue.path}</span> : null}
            {issue.line ? <span>:{issue.line}</span> : null}
          </p>
        ))}
      </div>
    </details>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[12.5px] font-medium text-text-secondary">
      {label}
      {children}
    </label>
  );
}

function inputCls() {
  return "h-9 rounded-md border border-border bg-white px-3 text-sm text-text-primary focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";
}

function parseUploadError(error: unknown): { errors: DatasetUploadIssue[]; warnings: DatasetUploadIssue[] } {
  const maybe = error as { response?: { data?: { detail?: unknown; message?: unknown; error_code?: unknown } } };
  const detail = maybe.response?.data?.detail || maybe.response?.data?.message;
  if (detail && typeof detail === "object") {
    const payload = detail as { errors?: DatasetUploadIssue[]; warnings?: DatasetUploadIssue[]; message?: string };
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
  const clean = filename.replace(/\\/g, "/").split("/").pop() || "dataset";
  return clean.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "dataset";
}

function defaultDescription(filename: string, mode: UploadMode) {
  const name = filenameStem(filename);
  return mode === "yolo" ? `YOLO dataset imported from ${name}` : `Dataset imported from ${name}`;
}
