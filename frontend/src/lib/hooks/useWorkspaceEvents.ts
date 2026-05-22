"use client";

import { useEffect, useMemo, useState } from "react";
import { sseManager, type IdleWarningEvent, type StatusChangeEvent, type WorkspaceKilledEvent } from "@/lib/sse/SSEManager";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

export function useWorkspaceEvents(workspaceId: string) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connected");
  const [lastEvent, setLastEvent] = useState<IdleWarningEvent | WorkspaceKilledEvent | StatusChangeEvent | null>(null);

  useEffect(() => {
    if (!workspaceId) return;

    const unsubscribe = sseManager.subscribe(workspaceId, {
      onIdleWarning: (data) => {
        setConnectionStatus("connected");
        setLastEvent(data);
      },
      onWorkspaceKilled: (data) => {
        setConnectionStatus("connected");
        setLastEvent(data);
      },
      onStatusChange: (data) => {
        setConnectionStatus("connected");
        setLastEvent(data);
      },
      onError: () => {
        setConnectionStatus("reconnecting");
      }
    });

    return () => {
      unsubscribe();
      setConnectionStatus("disconnected");
    };
  }, [workspaceId]);

  return useMemo(
    () => ({ connectionStatus, lastEvent }),
    [connectionStatus, lastEvent]
  );
}
