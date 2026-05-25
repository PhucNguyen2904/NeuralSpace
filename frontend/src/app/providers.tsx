"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { GlobalErrorBoundary } from "@/components/error/GlobalErrorBoundary";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { setupApiErrorHandler } from "@/lib/api/ApiErrorHandler";
import { useNotificationStore } from "@/lib/stores/notificationStore";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          gcTime: 5 * 60_000,
          retry: 2,
          retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
          refetchOnWindowFocus: false
        }
      }
    })
  );

  const addNotification = useNotificationStore((state) => state.addNotification);

  useEffect(() => {
    setupApiErrorHandler();
  }, []);

  return (
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
}
