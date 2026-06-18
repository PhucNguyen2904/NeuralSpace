"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Database, FileArchive, FileSpreadsheet, Info, UploadCloud } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { inspectGeneralDataset, inspectYoloDataset, uploadGeneralDataset, uploadYoloDataset } from "@/lib/api/datasets";
import { useDvcProfiles } from "@/lib/hooks/useDatasetVersions";
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
  const [inspecting, setInspecting] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [inspectResult, setInspectResult] = React.useState<DatasetInspectResponse | null>(null);
  const [result, setResult] = React.useState<DatasetUploadResponse | null>(null);
  const [issues, setIssues] = React.useState<{ errors: DatasetUploadIssue[]; warnings: DatasetUploadIssue[] }>({ errors: [], warnings: [] });
  const [form, setForm] = React.useState({ ...INITIAL_FORM });
  const [dvcProfileId, setDvcProfileId] = React.useState("");
  const [versionTouched, setVersionTouched] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const { data: dvcProfiles = [], isLoading: isLoadingDvcProfiles } = useDvcProfiles();
  const readyDvcProfiles = dvcProfiles.filter((profile) => profile.status === "ready");
  const selectedDvcProfileId = dvcProfileId || readyDvcProfiles.find((profile) => profile.is_environment_default)?.id || readyDvcProfiles[0]?.id || "";

  const resetState = React.useCallback(() => {
    setMode("yolo");
    setFile(null);
    setDragging(false);
    setInspecting(false);
    setSubmitting(false);
    setInspectResult(null);
    setResult(null);
    setIssues({ errors: [], warnings: [] });
    setForm({ ...INITIAL_FORM });
    setDvcProfileId("");
    setVersionTouched(false);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  React.useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

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
    task: form.task,
    label_column: form.label_column,
    dvc_profile_id: selectedDvcProfileId
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
          <p className="text-xs text-text-tertiary">{file ? `${file.name} · ${formatBytes(file.size)}` : "No file selected"}</p>
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
                <Button className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => void submit()} disabled={!file || !inspectResult || !selectedDvcProfileId || submitting || inspecting} loading={submitting}>
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
          <TabButton active={mode === "yolo"} onClick={() => { setMode("yolo"); setFile(null); setInspectResult(null); setResult(null); setIssues({ errors: [], warnings: [] }); }} icon={<FileArchive size={15} />} label="YOLO Dataset" />
          <TabButton active={mode === "general"} onClick={() => { setMode("general"); setFile(null); setInspectResult(null); setResult(null); setIssues({ errors: [], warnings: [] }); }} icon={<FileSpreadsheet size={15} />} label="General Dataset" />
        </div>

        <Field label="DVC storage">
          <div className="relative">
            <Database size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <select
              className={`${inputCls()} w-full pl-9`}
              value={selectedDvcProfileId}
              onChange={(event) => setDvcProfileId(event.target.value)}
              disabled={submitting || isLoadingDvcProfiles || readyDvcProfiles.length === 0}
            >
              {readyDvcProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.is_environment_default ? `${profile.name} · no setup needed` : `${profile.name} · ${profile.remote_name}`}
                </option>
              ))}
            </select>
          </div>
          {readyDvcProfiles.length === 0 ? <span className="text-xs text-red-600">No ready DVC storage profile is available.</span> : null}
        </Field>

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

        <CommonFields form={form} setForm={setForm} setVersionTouched={setVersionTouched} mode={mode} />
        <IssueList title="Errors" issues={issues.errors} tone="error" />
        <IssueList title="Warnings" issues={issues.warnings} tone="warning" />
        {inspectResult && !result ? <InspectPreview result={inspectResult} /> : null}
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

function CommonFields({
  form,
  setForm,
  setVersionTouched,
  mode
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  setVersionTouched: React.Dispatch<React.SetStateAction<boolean>>;
  mode: UploadMode;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Field label="Dataset name">
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
  const maybe = error as { response?: { data?: { detail?: unknown; message?: unknown; error_code?: unknown } } };
  const detail = maybe.response?.data?.detail;
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
