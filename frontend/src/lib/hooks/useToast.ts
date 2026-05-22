"use client";

import { useToastContext } from "@/components/ui/ToastProvider";

interface ToastOptions {
  id?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function useToast() {
  const { createToast, dismiss } = useToastContext();

  const toast = {
    success: (title: string, options?: ToastOptions) => createToast({ id: options?.id, title, description: options?.description, variant: "success", action: options?.action }),
    error: (title: string, options?: ToastOptions) => createToast({ id: options?.id, title, description: options?.description, variant: "error", action: options?.action }),
    warning: (title: string, options?: ToastOptions) => createToast({ id: options?.id, title, description: options?.description, variant: "warning", action: options?.action }),
    info: (title: string, options?: ToastOptions) => createToast({ id: options?.id, title, description: options?.description, variant: "info", action: options?.action }),
    loading: (title: string, options?: ToastOptions) => createToast({ id: options?.id, title, description: options?.description, variant: "loading", action: options?.action }),
    dismiss,
    promise: async <T>(promise: Promise<T>, messages: { loading: string; success: string; error: string }) => {
      const id = createToast({ title: messages.loading, variant: "loading" });
      try {
        const result = await promise;
        createToast({ id, title: messages.success, variant: "success" });
        return result;
      } catch (error) {
        createToast({ id, title: messages.error, variant: "error" });
        throw error;
      }
    }
  };

  return { toast };
}
