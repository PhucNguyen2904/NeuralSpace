"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useHeartbeatMutation } from "@/lib/hooks/useWorkspace";

export function useWorkspaceIdle(workspaceId: string) {
  const heartbeatMutation = useHeartbeatMutation();
  const [isIdleWarning, setIsIdleWarning] = useState(false);
  const [minutesLeft, setMinutesLeft] = useState(5);

  const extendSession = useCallback(async () => {
    await heartbeatMutation.mutateAsync(workspaceId);
    setIsIdleWarning(false);
    setMinutesLeft(30);
  }, [heartbeatMutation, workspaceId]);

  useEffect(() => {
    let warningTimer: ReturnType<typeof setTimeout> | null = null;
    let countdownTimer: ReturnType<typeof setInterval> | null = null;
    let eventSource: EventSource | null = null;

    const startWarning = (initialMinutes: number) => {
      setMinutesLeft(initialMinutes);
      setIsIdleWarning(true);
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = setInterval(() => {
        setMinutesLeft((prev) => Math.max(0, prev - 1 / 60));
      }, 1000);
    };

    try {
      eventSource = new EventSource(`/api/v1/workspaces/${workspaceId}/events`);
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { type?: string; minutes_left?: number };
          if (data.type === "IDLE_WARNING") {
            startWarning(data.minutes_left ?? 5);
          }
        } catch {}
      };
      eventSource.onerror = () => {
        eventSource?.close();
      };
    } catch {}

    // Mock fallback when SSE endpoint is not wired yet.
    warningTimer = setTimeout(() => startWarning(5), 45_000);

    const onActivity = () => {
      heartbeatMutation.mutate(workspaceId);
    };

    window.addEventListener("mousemove", onActivity);
    window.addEventListener("keydown", onActivity);

    return () => {
      if (warningTimer) clearTimeout(warningTimer);
      if (countdownTimer) clearInterval(countdownTimer);
      if (eventSource) eventSource.close();
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [heartbeatMutation, workspaceId]);

  return useMemo(
    () => ({
      isIdleWarning,
      minutesLeft: Math.max(0, minutesLeft),
      extendSession,
      dismissIdleWarning: () => setIsIdleWarning(false)
    }),
    [extendSession, isIdleWarning, minutesLeft]
  );
}
