"use client";

import { AnimatePresence } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Toast, type ToastAction, type ToastItem, type ToastVariant } from "@/components/ui/toast";

type CreateToastInput = {
  id?: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration?: number;
  action?: ToastAction;
};

type ToastRecord = ToastItem & {
  createdAt: number;
  paused: boolean;
  pausedElapsedMs: number;
  pauseStartedAt?: number;
};

interface ToastContextType {
  toasts: ToastRecord[];
  createToast: (input: CreateToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const defaultDuration = (variant: ToastVariant) => {
  if (variant === "warning") return 6000;
  if (variant === "error") return 0;
  if (variant === "loading") return 0;
  return 4000;
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const createToast = useCallback((input: CreateToastInput) => {
    const id = input.id ?? `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const duration = input.duration ?? defaultDuration(input.variant);

    setToasts((prev) => {
      const exists = prev.find((item) => item.id === id);
      const nextItem: ToastRecord = {
        id,
        title: input.title,
        description: input.description,
        variant: input.variant,
        duration,
        action: input.action,
        createdAt: Date.now(),
        paused: false,
        pausedElapsedMs: 0
      };

      const updated = exists ? prev.map((item) => (item.id === id ? nextItem : item)) : [nextItem, ...prev].slice(0, 3);
      return updated;
    });

    return id;
  }, []);

  const setPaused = useCallback((id: string, paused: boolean) => {
    setToasts((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (paused && !item.paused) {
          return { ...item, paused: true, pauseStartedAt: Date.now() };
        }
        if (!paused && item.paused) {
          const elapsed = item.pauseStartedAt ? Date.now() - item.pauseStartedAt : 0;
          return { ...item, paused: false, pauseStartedAt: undefined, pausedElapsedMs: item.pausedElapsedMs + elapsed };
        }
        return item;
      })
    );
  }, []);

  useEffect(() => {
    tickRef.current = setInterval(() => {
      setToasts((prev) =>
        prev.filter((item) => {
          if (!item.duration || item.duration <= 0 || item.paused) return true;
          const elapsed = Date.now() - item.createdAt - item.pausedElapsedMs;
          return elapsed < item.duration;
        })
      );
    }, 100);

    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const value = useMemo(
    () => ({ toasts, createToast, dismiss }),
    [toasts, createToast, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((item) => {
            const elapsed = Date.now() - item.createdAt - item.pausedElapsedMs;
            const progressPct = item.duration && item.duration > 0 ? 100 - (elapsed / item.duration) * 100 : 100;

            return (
              <div className="pointer-events-auto" key={item.id}>
                <Toast
                  item={item}
                  remaining={Math.max(0, (item.duration ?? 0) - elapsed)}
                  progressPct={progressPct}
                  onClose={dismiss}
                  onPause={setPaused}
                />
              </div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToastContext() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToastContext must be used within ToastProvider");
  return context;
}
