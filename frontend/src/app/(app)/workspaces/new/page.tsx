"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import {
  Boxes,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Database,
  ExternalLink,
  LockKeyhole,
  Package,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Card, Input } from "@/components/ui";
import { defaultDatasetFilters, useDatasets } from "@/lib/hooks/useDatasets";
import { useCreateWorkspace, type CreateWorkspaceFormValues } from "@/lib/hooks/useCreateWorkspace";
import { defaultModelFilters, useModels } from "@/lib/hooks/useModels";
import { cn } from "@/lib/utils/cn";

const schema = z.object({
  name: z.string().trim().min(3, "Project name must be at least 3 characters").max(255),
  pythonVersion: z.enum(["3.10", "3.11", "3.12"]),
  packages: z.array(z.string()),
  datasets: z.array(z.string()).max(10, "Maximum 10 datasets"),
  models: z.array(z.string()).max(10, "Maximum 10 models"),
});

const steps = ["Project", "Assets", "Confirm"] as const;

function StepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {steps.map((label, index) => {
        const step = (index + 1) as 1 | 2 | 3;
        const active = currentStep === step;
        const completed = currentStep > step;
        return (
          <div
            key={label}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
              active && "border-brand-500 bg-brand-50 text-brand-600",
              completed && "border-success-500/30 bg-success-50 text-success-500",
              !active && !completed && "border-border text-text-tertiary",
            )}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current">
              {completed ? <Check size={12} /> : step}
            </span>
            {label}
          </div>
        );
      })}
    </div>
  );
}

type AssetOption = {
  id: string;
  name: string;
  meta: string;
};

function AssetSelector({
  title,
  description,
  icon,
  options,
  selected,
  loading,
  onToggle,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  options: AssetOption[];
  selected: string[];
  loading: boolean;
  onToggle: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = options.filter((option) =>
    `${option.name} ${option.meta}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <section className="rounded-xl border border-border bg-bg-base p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="rounded-lg bg-brand-50 p-2 text-brand-600">{icon}</div>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            <p className="text-xs text-text-tertiary">{description}</p>
          </div>
        </div>
        <span className="rounded-full bg-bg-elevated px-2 py-1 text-xs text-text-secondary">
          {selected.length}/10
        </span>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-2.5 text-text-tertiary" size={14} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Search ${title.toLowerCase()}...`}
          className="h-9 w-full rounded-md border border-border bg-bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand-500"
        />
      </div>

      <div className="max-h-56 space-y-2 overflow-auto">
        {loading ? <p className="py-6 text-center text-xs text-text-tertiary">Loading assets...</p> : null}
        {!loading && filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-text-tertiary">No matching assets.</p>
        ) : null}
        {filtered.map((option) => {
          const checked = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onToggle(option.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors",
                checked ? "border-brand-500 bg-brand-50" : "border-border bg-bg-surface hover:bg-bg-elevated",
              )}
            >
              <span>
                <span className="block text-sm font-medium text-text-primary">{option.name}</span>
                <span className="block text-xs text-text-tertiary">{option.meta}</span>
              </span>
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded border",
                  checked ? "border-brand-500 bg-brand-500 text-white" : "border-border",
                )}
              >
                {checked ? <Check size={13} /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function NewWorkspacePage() {
  const form = useForm<CreateWorkspaceFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      pythonVersion: "3.11",
      packages: [],
      datasets: [],
      models: [],
    },
  });
  const datasetsQuery = useDatasets(defaultDatasetFilters);
  const modelsQuery = useModels(defaultModelFilters);
  const { register, watch, setValue, formState: { errors } } = form;
  const { currentStep, nextStep, prevStep, submit, isSubmitting, error } = useCreateWorkspace(form);
  const values = watch();

  const datasetOptions = (datasetsQuery.data?.items ?? []).map((dataset) => ({
    id: dataset.id,
    name: dataset.name,
    meta: `${dataset.type} · ${dataset.item_count.toLocaleString()} items`,
  }));
  const modelOptions = (modelsQuery.data?.items ?? []).map((model) => ({
    id: model.id,
    name: model.name,
    meta: `${model.framework} · ${model.version}`,
  }));

  const toggle = (field: "datasets" | "models", id: string) => {
    const current = values[field];
    setValue(field, current.includes(id) ? current.filter((item) => item !== id) : [...current, id], {
      shouldValidate: true,
    });
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:py-8">
      <div className="mb-5">
        <Link href="/workspaces" className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
          <ChevronLeft size={14} /> Back to Projects
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Create Colab project</h1>
            <p className="mt-1 max-w-2xl text-sm text-text-secondary">
              Projects store context, assets, and runtime sessions. Compute is provided by Google Colab.
            </p>
          </div>
          <div className="hidden rounded-xl border border-brand-500/20 bg-brand-50 p-3 text-brand-600 sm:block">
            <Cloud size={22} />
          </div>
        </div>
      </div>

      <Card variant="elevated" className="overflow-hidden">
        <div className="border-b border-border p-4 sm:p-5">
          <StepIndicator currentStep={currentStep} />
        </div>

        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="p-4 sm:p-6"
        >
          {currentStep === 1 ? (
            <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
              <div className="space-y-5">
                <div>
                  <Input
                    label="Project name"
                    placeholder="Example: Customer churn experiment"
                    error={errors.name?.message}
                    autoFocus
                    {...register("name")}
                  />
                  <p className="mt-1.5 text-xs text-text-tertiary">Name used to identify the project and related runtime sessions.</p>
                </div>
                <div className="rounded-xl border border-border bg-bg-base p-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 text-brand-500" size={18} />
                    <div>
                      <p className="text-sm font-medium text-text-primary">Externally managed runtime</p>
                      <p className="mt-1 text-xs leading-5 text-text-secondary">
                        NeuralSpace does not provision dedicated CPU/GPU resources. When opening a project, the system creates a short-lived token to connect a Colab notebook to datasets and the tracking API.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  [Cloud, "Google Colab", "CPU/GPU/RAM managed by Colab"],
                  [LockKeyhole, "Scoped token", "Only access the selected project and assets"],
                  [Boxes, "Reusable context", "Can create multiple runtime sessions"],
                ].map(([Icon, title, subtitle]) => (
                  <div key={String(title)} className="flex gap-3 rounded-xl border border-border bg-bg-base p-3">
                    <Icon size={16} className="mt-0.5 text-brand-500" />
                    <div>
                      <p className="text-xs font-semibold text-text-primary">{String(title)}</p>
                      <p className="text-xs text-text-tertiary">{String(subtitle)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {currentStep === 2 ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Select accessible assets</h2>
                <p className="text-xs text-text-tertiary">You can skip this and attach assets later. Only real system IDs are stored.</p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <AssetSelector
                  title="Datasets"
                  description="Signed URLs are issued when Colab connects"
                  icon={<Database size={17} />}
                  options={datasetOptions}
                  selected={values.datasets}
                  loading={datasetsQuery.isLoading}
                  onToggle={(id) => toggle("datasets", id)}
                />
                <AssetSelector
                  title="Models"
                  description="Attached to the project for tracking and reuse"
                  icon={<Package size={17} />}
                  options={modelOptions}
                  selected={values.models}
                  loading={modelsQuery.isLoading}
                  onToggle={(id) => toggle("models", id)}
                />
              </div>
              <div className="flex justify-end gap-3 text-xs">
                <Link href="/datasets" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                  Manage datasets <ExternalLink size={11} />
                </Link>
                <Link href="/models" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                  Manage models <ExternalLink size={11} />
                </Link>
              </div>
            </div>
          ) : null}

          {currentStep === 3 ? (
            <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
              <div className="rounded-xl border border-border bg-bg-base p-5">
                <h2 className="mb-4 text-base font-semibold text-text-primary">Confirm project</h2>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-text-tertiary">Name</dt><dd className="font-medium text-text-primary">{values.name}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-text-tertiary">Runtime</dt><dd className="text-text-primary">Google Colab external</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-text-tertiary">Datasets</dt><dd className="text-text-primary">{values.datasets.length}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-text-tertiary">Models</dt><dd className="text-text-primary">{values.models.length}</dd></div>
                </dl>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-success-500/20 bg-success-50 p-4">
                  <div className="flex gap-3">
                    <CheckCircle2 size={18} className="text-success-500" />
                    <div>
                      <p className="text-sm font-medium text-text-primary">Ready to create</p>
                      <p className="mt-1 text-xs leading-5 text-text-secondary">
                        The project will be created in READY state. When opened, you will receive a Colab link and a new runtime session.
                      </p>
                    </div>
                  </div>
                </div>
                {error ? <p className="rounded-lg bg-error-50 p-3 text-xs text-error-500">{error}</p> : null}
                <Button type="button" size="lg" className="h-11 w-full" onClick={submit} loading={isSubmitting}>
                  Create project
                </Button>
              </div>
            </div>
          ) : null}
        </motion.div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3 sm:px-6">
          <Button type="button" variant="ghost" onClick={prevStep} disabled={currentStep === 1} iconLeft={<ChevronLeft size={15} />}>
            Back
          </Button>
          {currentStep < 3 ? (
            <Button type="button" onClick={nextStep} iconRight={<ChevronRight size={15} />}>
              Next
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
