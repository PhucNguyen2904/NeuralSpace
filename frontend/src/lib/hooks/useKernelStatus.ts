"use client";

import { useEffect, useMemo, useState } from "react";
import { useKernelStatusQuery } from "@/lib/hooks/useWorkspace";

export function useKernelStatus(workspaceId: string) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const onVisibility = () => setIsVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const query = useKernelStatusQuery(workspaceId, isVisible);

  return useMemo(
    () => ({
      status: query.data?.status ?? "idle",
      activeKernels: query.data?.activeKernels ?? ["Python 3 (ipykernel)"],
      isLoading: query.isLoading
    }),
    [query.data, query.isLoading]
  );
}
