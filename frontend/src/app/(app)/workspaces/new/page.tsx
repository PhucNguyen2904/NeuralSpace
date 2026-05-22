"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { KeyboardEvent, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Card, Input } from "@/components/ui";
import { useCreateWorkspace, type CreateWorkspaceFormValues } from "@/lib/hooks/useCreateWorkspace";
import { cn } from "@/lib/utils/cn";

const pythonOptions = [
  { value: "3.10", title: "Python 3.10", subtitle: "LTS stable" },
  { value: "3.11", title: "Python 3.11", subtitle: "Recommended" },
  { value: "3.12", title: "Python 3.12", subtitle: "Latest" }
] as const;

const tierOptions = [
  { value: "cpu-standard", title: "CPU Standard", badge: "FREE TIER", popular: false, desc: "2 vCPU · 4 GB RAM · No GPU", fit: "Phù hợp: EDA, preprocessing, sklearn models" },
  { value: "cpu-large", title: "CPU Large", badge: "PRO", popular: false, desc: "4 vCPU · 8 GB RAM · No GPU", fit: "Phù hợp: Large datasets, heavy preprocessing" },
  { value: "gpu-t4", title: "GPU T4", badge: "PRO", popular: true, desc: "4 vCPU · 16 GB RAM · NVIDIA T4 (16GB VRAM)", fit: "Phù hợp: Deep learning, PyTorch, TensorFlow" }
] as const;

const datasetsMock = ["ImageNet 2024", "COCO", "Customer Churn", "Sales Forecast"]; 
const modelsMock = ["ResNet-50 pretrained", "YOLOv8n", "XGBoost baseline", "Llama-3 adapter"];

const schema = z.object({
  name: z.string().min(3, "Tên workspace tối thiểu 3 ký tự"),
  pythonVersion: z.enum(["3.10", "3.11", "3.12"]),
  packages: z.array(z.string().min(1)).max(20, "Tối đa 20 packages"),
  tier: z.enum(["cpu-standard", "cpu-large", "gpu-t4"]),
  datasets: z.array(z.string()),
  models: z.array(z.string())
});

const steps = ["Cấu hình", "Tài nguyên", "Xác nhận"] as const;

function StepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  return (
    <div className="mb-8 flex items-center justify-between">
      {steps.map((label, idx) => {
        const step = (idx + 1) as 1 | 2 | 3;
        const active = currentStep === step;
        const completed = currentStep > step;

        return (
          <div key={label} className="flex flex-1 items-center">
            <div className="flex items-center gap-2">
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-full border text-sm", completed || active ? "border-brand-500 bg-brand-500 text-white" : "border-border text-text-secondary")}>
                {completed ? <Check size={15} /> : step}
              </div>
              <span className={cn("text-sm", active ? "text-brand-600" : "text-text-secondary")}>{label}</span>
            </div>
            {step < 3 ? <div className={cn("mx-3 h-px flex-1", completed ? "bg-brand-500" : "bg-border")} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function MultiSelect({
  title,
  options,
  selected,
  onToggle,
  emptyText
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  emptyText: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = options.filter((item) => item.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search..."
        className="h-10 w-full rounded-md border border-border bg-bg-sunken px-3 text-sm outline-none focus:border-brand-500"
      />
      <div className="max-h-36 space-y-1 overflow-auto rounded-md border border-border bg-bg-surface p-2">
        {filtered.length === 0 ? <p className="text-xs text-text-tertiary">{emptyText}</p> : null}
        {filtered.map((item) => (
          <label key={item} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-text-secondary hover:bg-bg-elevated">
            <input type="checkbox" checked={selected.includes(item)} onChange={() => onToggle(item)} />
            {item}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {selected.map((item) => (
          <span key={item} className="rounded-full bg-brand-50 px-2 py-1 text-xs text-brand-600">{item}</span>
        ))}
      </div>
    </div>
  );
}

export default function NewWorkspacePage() {
  const form = useForm<CreateWorkspaceFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      pythonVersion: "3.11",
      packages: [],
      tier: "cpu-standard",
      datasets: [],
      models: []
    }
  });

  const { register, watch, setValue, formState: { errors } } = form;
  const { currentStep, nextStep, prevStep, submit, isSubmitting } = useCreateWorkspace(form);

  const [packageInput, setPackageInput] = useState("");
  const values = watch();

  const addPackage = () => {
    const pkg = packageInput.trim().toLowerCase();
    if (!pkg) return;
    const current = values.packages;
    if (current.includes(pkg) || current.length >= 20) return;
    setValue("packages", [...current, pkg], { shouldValidate: true });
    setPackageInput("");
  };

  const removePackage = (pkg: string) => {
    setValue("packages", values.packages.filter((item) => item !== pkg), { shouldValidate: true });
  };

  const onPackageKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addPackage();
    }
  };

  const toggleDataset = (dataset: string) => {
    const current = values.datasets;
    setValue("datasets", current.includes(dataset) ? current.filter((item) => item !== dataset) : [...current, dataset], { shouldValidate: true });
  };

  const toggleModel = (model: string) => {
    const current = values.models;
    setValue("models", current.includes(model) ? current.filter((item) => item !== model) : [...current, model], { shouldValidate: true });
  };

  const summaryTier = useMemo(() => tierOptions.find((item) => item.value === values.tier)?.title ?? values.tier, [values.tier]);

  return (
    <div className="mx-auto w-full max-w-[680px] py-8">
      <Card variant="elevated" padding="lg" className="border border-border">
        <StepIndicator currentStep={currentStep} />

        <motion.div key={currentStep} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          {currentStep === 1 ? (
            <div className="space-y-5">
              <Input label="Tên workspace" placeholder="vd: ResNet Training v2" error={errors.name?.message} {...register("name")} />
              <p className="-mt-3 text-xs text-text-tertiary">Tên để nhận diện workspace của bạn</p>

              <div>
                <p className="mb-2 text-sm font-medium text-text-primary">Python Version</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {pythonOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setValue("pythonVersion", option.value, { shouldValidate: true })}
                      className={cn("relative rounded-lg border p-3 text-left", values.pythonVersion === option.value ? "border-brand-500 bg-brand-50" : "border-border bg-bg-surface")}
                    >
                      {values.pythonVersion === option.value ? <CheckCircle2 size={16} className="absolute right-2 top-2 text-brand-600" /> : null}
                      <p className="font-medium text-text-primary">{option.title}</p>
                      <p className="text-xs text-text-secondary">{option.subtitle}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-text-primary">Extra packages (optional)</p>
                <div className="flex gap-2">
                  <input
                    value={packageInput}
                    onChange={(e) => setPackageInput(e.target.value)}
                    onKeyDown={onPackageKey}
                    placeholder="numpy, pandas, xgboost..."
                    className="h-10 flex-1 rounded-md border border-border bg-bg-sunken px-3 text-sm outline-none focus:border-brand-500"
                  />
                  <Button type="button" variant="secondary" onClick={addPackage} iconLeft={<Plus size={14} />}>Add</Button>
                </div>
                <p className="mt-1 text-xs text-text-tertiary">{values.packages.length}/20 packages</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {values.packages.map((pkg) => (
                    <span key={pkg} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-xs text-brand-600">
                      {pkg}
                      <button type="button" onClick={() => removePackage(pkg)}>×</button>
                    </span>
                  ))}
                </div>
                {errors.packages?.message ? <p className="mt-1 text-xs text-error-500">{errors.packages.message}</p> : null}
              </div>
            </div>
          ) : null}

          {currentStep === 2 ? (
            <div className="space-y-5">
              <div className="space-y-3">
                {tierOptions.map((tier) => (
                  <button
                    key={tier.value}
                    type="button"
                    onClick={() => setValue("tier", tier.value, { shouldValidate: true })}
                    className={cn("w-full rounded-lg border p-4 text-left", values.tier === tier.value ? "border-2 border-brand-500 shadow-brand" : "border-border")}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <p className="font-semibold text-text-primary">{tier.title}</p>
                      <span className={cn("rounded-full px-2 py-0.5 text-xs", tier.badge === "PRO" ? "bg-brand-gradient text-white" : "bg-bg-elevated text-text-secondary")}>{tier.popular ? "PRO · Popular" : tier.badge}</span>
                    </div>
                    <p className="text-sm text-text-secondary">{tier.desc}</p>
                    <p className="mt-1 text-xs text-text-tertiary">{tier.fit}</p>
                  </button>
                ))}
              </div>

              <div className="space-y-4 rounded-lg border border-border bg-bg-base p-4">
                <p className="text-sm font-semibold text-text-primary">Gắn kết dữ liệu (tùy chọn)</p>
                <MultiSelect
                  title="Dataset selector"
                  options={datasetsMock}
                  selected={values.datasets}
                  onToggle={toggleDataset}
                  emptyText="Chưa có dataset — Tạo trên Upstream module →"
                />
                <MultiSelect
                  title="Model selector"
                  options={modelsMock}
                  selected={values.models}
                  onToggle={toggleModel}
                  emptyText="Chưa có model — Tạo trên Upstream module →"
                />
              </div>
            </div>
          ) : null}

          {currentStep === 3 ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-bg-base p-4">
                <p className="mb-3 font-semibold text-text-primary">📋 Tóm tắt Workspace</p>
                <div className="space-y-2 text-sm">
                  <p><span className="inline-block w-24 text-text-tertiary">Tên:</span> {values.name}</p>
                  <p><span className="inline-block w-24 text-text-tertiary">Python:</span> {values.pythonVersion}</p>
                  <p><span className="inline-block w-24 text-text-tertiary">Tier:</span> {summaryTier}</p>
                  <p><span className="inline-block w-24 text-text-tertiary">Datasets:</span> {values.datasets.join(", ") || "-"}</p>
                  <p><span className="inline-block w-24 text-text-tertiary">Models:</span> {values.models.join(", ") || "-"}</p>
                  <p><span className="inline-block w-24 text-text-tertiary">Packages:</span> {values.packages.join(", ") || "-"}</p>
                </div>
                <div className="mt-4 border-t border-border pt-3 text-sm text-text-secondary">
                  <p>⏱ Khởi động ước tính: ~30 giây</p>
                  <p>💡 Tự động đóng sau 30 phút idle</p>
                </div>
              </div>
              <Button type="button" className="h-11 w-full" size="lg" onClick={submit} loading={isSubmitting}>🚀 Khởi động Workspace</Button>
            </div>
          ) : null}
        </motion.div>

        <div className="mt-8 flex items-center justify-between">
          <Button type="button" variant="ghost" onClick={prevStep} disabled={currentStep === 1} iconLeft={<ChevronLeft size={16} />}>Quay lại</Button>
          {currentStep < 3 ? (
            <Button type="button" onClick={nextStep} iconRight={<ChevronRight size={16} />}>Tiếp theo</Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
