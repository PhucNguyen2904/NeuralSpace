"use client";

import { useEffect, useMemo, useState } from "react";

export function useIdleTimer(autoKillAt?: string) {
  const [timeUntilKill, setTimeUntilKill] = useState(0);

  useEffect(() => {
    if (!autoKillAt) return;

    const tick = () => {
      const left = Math.max(0, new Date(autoKillAt).getTime() - Date.now());
      setTimeUntilKill(left);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [autoKillAt]);

  return useMemo(
    () => ({
      timeUntilKill,
      isWarning: timeUntilKill <= 5 * 60_000,
      isUrgent: timeUntilKill <= 60_000
    }),
    [timeUntilKill]
  );
}
