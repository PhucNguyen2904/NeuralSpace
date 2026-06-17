"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, FileArchive, FileSpreadsheet, Info, UploadCloud } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { uploadGeneralDataset, uploadYoloDataset } from "@/lib/api/datasets";
import { cn } from "@/lib/utils/cn";
import type { DatasetUploadIssue, DatasetUploadResponse } from "@/types/dataset";

type UploadMode = "yolo" | "general";

export function DatasetUploadModal({
  open,
  onClose,
  onUploaded
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [mode, setMode] = React.useState<UploadMode>("yolo");
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<DatasetUploadResponse | null>(null);
  const [issues, setIssues] = React.useState<{ errors: DatasetUploadIssue[]; warnings: DatasetUploadIssue[] }>({ errors: [], warnings: [] });
  const [form, setForm] = React.useState({
    name: "",
    version: "",
    description: "",
    tags: "",
    dataset_type: "tabular",
    task: "custom",
    label_column: ""
  });
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) {
      setFile(null);
      setResult(null);
      setIssues({ errors: [], warnings: [] });
      setSubmitting(false);
    }
  }, [open]);

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
    setResult(null);
    setIssues({ errors: [], warnings: [] });
  };

  const submit = async () => {
    if (!file) return;
    setSubmitting(true);
    setIssues({ errors: [], warnings: [] });
    try {
      const payload = {
        name: form.name,
        version: form.version,
        description: form.description,
        tags: form.tags,
        dataset_type: form.dataset_type,
        task: form.task,
        label_column: form.label_column
      };
      const response = mode === "yolo"
        ? await uploadYoloDataset(file, payload)
        : await uploadGeneralDataset(file, payload);
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
          <p className="text-xs text-text-tertiary">{file ? `${file.name} · ${formatBytes(file.size)}` : "No file selected"}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>Close</Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => void submit()} disabled={!file || submitting} loading={submitting}>
              Upload
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-bg-elevated p-1">
          <TabButton active={mode === "yolo"} onClick={() => { setMode("yolo"); setFile(null); setResult(null); }} icon={<FileArchive size={15} />} label="YOLO Dataset" />
          <TabButton active={mode === "general"} onClick={() => { setMode("general"); setFile(null); setResult(null); }} icon={<FileSpreadsheet size={15} />} label="General Dataset" />
        </div>

        {mode === "yolo" ? <YoloHelp /> : <GeneralForm form={form} setForm={setForm} />}

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
          className={cn(
            "flex min-h-36 w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
            dragging ? "border-emerald-500 bg-emerald-50" : "border-border bg-white hover:bg-bg-elevated"
          )}
        >
          <UploadCloud className="mb-2 text-emerald-600" size={26} />
          <p className="text-sm font-medium text-text-primary">{file ? file.name : "Drop file here or click to browse"}</p>
          <p className="mt-1 text-xs text-text-secondary">{mode === "yolo" ? "ZIP with data.yaml, images, and labels" : "CSV, JSON, Parquet, or custom ZIP"}</p>
        </button>

        <CommonFields form={form} setForm={setForm} mode={mode} />
        <IssueList title="Errors" issues={issues.errors} tone="error" />
        <IssueList title="Warnings" issues={issues.warnings} tone="warning" />
        {result ? <UploadPreview result={result} /> : null}
      </div>
    </Modal>
  );
}

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

function YoloHelp() {
  const [openSample, setOpenSample] = React.useState(false);
  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 shrink-0" size={15} />
        <div className="min-w-0">
          <p className="font-medium">YOLO/Ultralytics ZIP must include data.yaml, images/train, images/val, labels/train, and labels/val.</p>
          <pre className="mt-2 overflow-x-auto rounded-md bg-white p-2 text-xs text-slate-700">{`dataset/
├── data.yaml
├── images/
│   ├── train/
│   └── val/
└── labels/
    ├── train/
    └── val/`}</pre>
          <button type="button" onClick={() => setOpenSample((value) => !value)} className="mt-2 text-xs font-semibold text-emerald-700 hover:underline">
            View sample data.yaml
          </button>
          {openSample ? (
            <pre className="mt-2 overflow-x-auto rounded-md bg-white p-2 text-xs text-slate-700">{`path: .
train: images/train
val: images/val
test: images/test
names:
  0: person
  1: helmet`}</pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GeneralForm({
  form,
  setForm
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 md:grid-cols-3">
      <Field label="Dataset type">
        <select className={inputCls()} value={form.dataset_type} onChange={(event) => setForm((prev) => ({ ...prev, dataset_type: event.target.value }))}>
          <option value="tabular">Tabular</option>
          <option value="image">Image</option>
          <option value="text">Text</option>
          <option value="audio">Audio</option>
          <option value="video">Video</option>
          <option value="custom">Custom</option>
        </select>
      </Field>
      <Field label="Task">
        <select className={inputCls()} value={form.task} onChange={(event) => setForm((prev) => ({ ...prev, task: event.target.value }))}>
          <option value="classification">Classification</option>
          <option value="regression">Regression</option>
          <option value="clustering">Clustering</option>
          <option value="nlp">NLP</option>
          <option value="custom">Custom</option>
        </select>
      </Field>
      <Field label="Label column">
        <input className={inputCls()} value={form.label_column} onChange={(event) => setForm((prev) => ({ ...prev, label_column: event.target.value }))} placeholder="optional" />
      </Field>
    </div>
  );
}

type FormState = {
  name: string;
  version: string;
  description: string;
  tags: string;
  dataset_type: string;
  task: string;
  label_column: string;
};

function CommonFields({ form, setForm, mode }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; mode: UploadMode }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field label="Dataset name">
        <input className={inputCls()} value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Inferred from file if empty" />
      </Field>
      <Field label="Version">
        <input className={inputCls()} value={form.version} onChange={(event) => setForm((prev) => ({ ...prev, version: event.target.value }))} placeholder="v1.0" />
      </Field>
      <Field label="Tags">
        <input className={inputCls()} value={form.tags} onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="vision, gold, training" />
      </Field>
      <Field label="Description">
        <input className={inputCls()} value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder={mode === "yolo" ? "Object detection dataset" : "Dataset notes"} />
      </Field>
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
              {preview.columns.slice(0, 8).map((column) => (
                <div key={column.name} className="grid grid-cols-[1fr_90px_80px] gap-2 border-b border-border px-2 py-1 text-xs">
                  <span className="truncate">{column.name}</span>
                  <span>{column.type}</span>
                  <span>{column.missing ?? 0} missing</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function IssueList({ title, issues, tone }: { title: string; issues: DatasetUploadIssue[]; tone: "error" | "warning" }) {
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
            {issue.line ? <span>:{issue.line}</span> : null}
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
  return "h-9 rounded-md border border-border bg-white px-3 text-sm text-text-primary focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100";
}

function parseUploadError(error: unknown): { errors: DatasetUploadIssue[]; warnings: DatasetUploadIssue[] } {
  const maybe = error as { response?: { data?: { detail?: unknown } } };
  const detail = maybe.response?.data?.detail;
  if (detail && typeof detail === "object") {
    const payload = detail as { errors?: DatasetUploadIssue[]; warnings?: DatasetUploadIssue[]; message?: string };
    return {
      errors: payload.errors?.length ? payload.errors : [{ code: "UPLOAD_FAILED", message: payload.message || "Upload failed", severity: "error" }],
      warnings: payload.warnings ?? []
    };
  }
  return { errors: [{ code: "UPLOAD_FAILED", message: "Upload failed", severity: "error" }], warnings: [] };
}

function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

