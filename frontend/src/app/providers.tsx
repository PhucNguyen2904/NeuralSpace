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
          staleTime: 2 * 60_000,      // 2 minutes — keep data fresh longer and reduce refetching
          gcTime: 10 * 60_000,        // 10 minutes — keep cache alive longer while navigating
          retry: 1,                   // Retry once instead of twice
          retryDelay: 1_000,          // Fixed 1s delay, no exponential backoff
          refetchOnWindowFocus: false,
          refetchOnReconnect: "always"
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
