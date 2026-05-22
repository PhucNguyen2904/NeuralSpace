"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { useNotificationStore } from "@/lib/stores/notificationStore";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() =>
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: 1,
          refetchOnWindowFocus: false
        }
      }
    })
  );

  const addNotification = useNotificationStore((state) => state.addNotification);

  useEffect(() => {
    const interval = setInterval(() => {
      addNotification({
        type: "SAVE_COMPLETE",
        title: "Autosave hoàn tất",
        description: "Notebook đã được lưu tự động",
        workspaceId: "ws_1"
      });
    }, 120000);

    return () => clearInterval(interval);
  }, [addNotification]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
