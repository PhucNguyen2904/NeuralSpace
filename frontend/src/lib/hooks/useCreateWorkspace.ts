"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { FieldPath, UseFormReturn } from "react-hook-form";
import { useCreateWorkspaceMutation } from "@/lib/hooks/useWorkspace";
import type { CreateWorkspaceInput } from "@/types/workspace";

export type WizardStep = 1 | 2 | 3;

export interface CreateWorkspaceFormValues {
  name: string;
  pythonVersion: "3.10" | "3.11" | "3.12";
  packages: string[];
  datasets: string[];
  models: string[];
}

const SESSION_KEY = "neuralspace-create-workspace";

const stepFields: Record<WizardStep, FieldPath<CreateWorkspaceFormValues>[]> = {
  1: ["name", "pythonVersion", "packages"],
  2: ["datasets", "models"],
  3: []
};

export function useCreateWorkspace(form: UseFormReturn<CreateWorkspaceFormValues>) {
  const router = useRouter();
  const mutation = useCreateWorkspaceMutation();
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<CreateWorkspaceFormValues>;
      form.reset({ ...form.getValues(), ...parsed });
    } catch {}
  }, [form]);

  useEffect(() => {
    const subscription = form.watch((value) => {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const nextStep = async () => {
    if (currentStep === 3) return;
    const fields = stepFields[currentStep];
    const valid = await form.trigger(fields);
    if (valid) {
      setCurrentStep((prev) => (Math.min(prev + 1, 3) as WizardStep));
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => (Math.max(prev - 1, 1) as WizardStep));
  };

  const submit = form.handleSubmit(async (values) => {
    const payload: CreateWorkspaceInput = {
      name: values.name,
      pythonVersion: values.pythonVersion,
      packages: values.packages,
      datasets: values.datasets,
      models: values.models
    };
    const workspace = await mutation.mutateAsync(payload);
    sessionStorage.removeItem(SESSION_KEY);
    router.push(`/workspaces/${workspace.id}`);
  });

  return useMemo(
    () => ({
      currentStep,
      setCurrentStep,
      nextStep,
      prevStep,
      submit,
      isSubmitting: mutation.isPending,
      error: mutation.error?.message ?? null,
    }),
    [currentStep, mutation.error?.message, mutation.isPending]
  );
}
