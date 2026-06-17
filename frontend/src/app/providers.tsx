"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { GlobalErrorBoundary } from "@/components/error/GlobalErrorBoundary";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { setupApiErrorHandler } from "@/lib/api/ApiErrorHandler";
import { useWorkspaces } from "@/lib/hooks/useWorkspace";
import { sseManager } from "@/lib/sse/SSEManager";
import { useAuthStore } from "@/lib/stores/authStore";
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

  useEffect(() => {
    setupApiErrorHandler();
  }, []);

  return (
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <NotificationEventBridge />
          {children}
        </ToastProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
}

function NotificationEventBridge() {
  const token = useAuthStore((state) => state.token);
  const { data: workspaces = [] } = useWorkspaces(Boolean(token));
  const addNotification = useNotificationStore((state) => state.addNotification);

  useEffect(() => {
    if (!token) return;
    const cleanups = workspaces.map((workspace) =>
      sseManager.subscribe(workspace.id, {
        onIdleWarning: (event) => {
          addNotification({
            type: "IDLE_WARNING",
            title: "Workspace idle warning",
            description: event.message ?? `Workspace will close in ${event.minutesLeft} minute${event.minutesLeft === 1 ? "" : "s"} due to inactivity.`,
            workspaceId: event.workspaceId
          });
        },
        onWorkspaceKilled: (event) => {
          addNotification({
            type: "WORKSPACE_KILLED",
            title: "Workspace closed",
            description: event.message ?? event.reason ?? "Workspace was closed.",
            workspaceId: event.workspaceId
          });
        },
        onStatusChange: (event) => {
          if (event.status !== "RUNNING") return;
          addNotification({
            type: "WORKSPACE_STARTED",
            title: "Workspace ready",
            description: event.message ?? `${workspace.name} is ready to use.`,
            workspaceId: event.workspaceId
          });
        }
      })
    );

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [addNotification, token, workspaces]);

  return null;
}
