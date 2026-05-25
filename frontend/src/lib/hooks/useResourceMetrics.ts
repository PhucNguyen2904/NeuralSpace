"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api/client";

type MetricPoint = {
  ts: number;
  cpu: number;
  ramPercent: number;
  gpu: number;
};

type MetricsResponse = {
  cpu?: { usage_percent?: number; used_cores?: number; total_cores?: number };
  memory?: {
    used_gb?: number;
    total_gb?: number;
    used_mb?: number;
    total_mb?: number;
    kernel_mb?: number;
    packages_mb?: number;
    free_mb?: number;
  };
  gpu?: {
    usage_percent?: number;
    vram_used_gb?: number;
    vram_total_gb?: number;
    temperature_c?: number;
  };
};

type ResourceFallbackResponse = { cpu: number; ramUsedGb: number; ramTotalGb: number; gpu: number };

const MAX_POINTS = 60;
const POLL_MS = 3000;

function appendPointCircular(buffer: MetricPoint[], point: MetricPoint): MetricPoint[] {
  if (buffer.length < MAX_POINTS) return [...buffer, point];
  return [...buffer.slice(1), point];
}

export function useResourceMetrics(workspaceId: string, enabled: boolean, hasGpu: boolean, fallbackRamTotalGb: number) {
  const [history, setHistory] = useState<MetricPoint[]>([]);
  const [cpu, setCpu] = useState({ usagePercent: 0, usedCores: 0, totalCores: 0 });
  const [memory, setMemory] = useState({ usedGb: 0, totalGb: fallbackRamTotalGb, usagePercent: 0, kernelMb: 0, packagesMb: 0, freeMb: 0 });
  const [gpu, setGpu] = useState({ usagePercent: 0, vramUsedGb: 0, vramTotalGb: 16, temperatureC: 0 });

  useEffect(() => {
    if (!enabled || !workspaceId) return;
    let cancelled = false;

    const fetchMetrics = async () => {
      try {
        const { data } = await apiClient.get<MetricsResponse>(`/workspaces/${workspaceId}/metrics`);
        if (cancelled) return;

        const cpuUsage = Math.max(0, Math.min(100, Math.round(data.cpu?.usage_percent ?? 0)));
        const usedCores = Number((data.cpu?.used_cores ?? 0).toFixed(1));
        const totalCores = Number((data.cpu?.total_cores ?? 0).toFixed(1));

        const usedGb = Number((data.memory?.used_gb ?? (data.memory?.used_mb ?? 0) / 1024).toFixed(1));
        const totalGb = Number((data.memory?.total_gb ?? (data.memory?.total_mb ?? fallbackRamTotalGb * 1024) / 1024).toFixed(1));
        const ramPercent = totalGb > 0 ? Math.round((usedGb / totalGb) * 100) : 0;

        const kernelMb = Math.round(data.memory?.kernel_mb ?? usedGb * 1024 * 0.66);
        const packagesMb = Math.round(data.memory?.packages_mb ?? usedGb * 1024 * 0.34);
        const freeMb = Math.max(0, Math.round(data.memory?.free_mb ?? (totalGb - usedGb) * 1024));

        const gpuUsage = Math.max(0, Math.min(100, Math.round(data.gpu?.usage_percent ?? 0)));
        const vramUsedGb = Number((data.gpu?.vram_used_gb ?? 0).toFixed(1));
        const vramTotalGb = Number((data.gpu?.vram_total_gb ?? 16).toFixed(1));
        const temperatureC = Math.round(data.gpu?.temperature_c ?? 0);

        setCpu({ usagePercent: cpuUsage, usedCores, totalCores });
        setMemory({ usedGb, totalGb, usagePercent: ramPercent, kernelMb, packagesMb, freeMb });
        setGpu({ usagePercent: gpuUsage, vramUsedGb, vramTotalGb, temperatureC });
        setHistory((prev) =>
          appendPointCircular(prev, {
            ts: Date.now(),
            cpu: cpuUsage,
            ramPercent,
            gpu: hasGpu ? gpuUsage : 0
          })
        );
      } catch {
        if (cancelled) return;
        try {
          const { data } = await apiClient.get<ResourceFallbackResponse>(`/workspaces/${workspaceId}/resources`);
          if (cancelled) return;
          const cpuUsage = Math.max(0, Math.min(100, Math.round(data.cpu ?? 0)));
          const usedGb = Number((data.ramUsedGb ?? 0).toFixed(1));
          const totalGb = Number((data.ramTotalGb ?? fallbackRamTotalGb).toFixed(1));
          const ramPercent = totalGb > 0 ? Math.round((usedGb / totalGb) * 100) : 0;
          const kernelMb = Math.round(usedGb * 1024 * 0.66);
          const packagesMb = Math.round(usedGb * 1024 * 0.34);
          const freeMb = Math.max(0, Math.round((totalGb - usedGb) * 1024));
          const gpuUsage = Math.max(0, Math.min(100, Math.round(data.gpu ?? 0)));

          setCpu((prev) => ({ ...prev, usagePercent: cpuUsage }));
          setMemory({ usedGb, totalGb, usagePercent: ramPercent, kernelMb, packagesMb, freeMb });
          setGpu((prev) => ({ ...prev, usagePercent: gpuUsage }));
          setHistory((prev) =>
            appendPointCircular(prev, {
              ts: Date.now(),
              cpu: cpuUsage,
              ramPercent,
              gpu: hasGpu ? gpuUsage : 0
            })
          );
        } catch {
          if (cancelled) return;
        }
      }
    };

    void fetchMetrics();
    const interval = setInterval(() => void fetchMetrics(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [workspaceId, enabled, hasGpu, fallbackRamTotalGb]);

  const chartHistory = useMemo(
    () =>
      history.map((item, idx) => ({
        index: idx + 1,
        cpu: item.cpu,
        ram: item.ramPercent,
        gpu: item.gpu
      })),
    [history]
  );

  return { cpu, memory, gpu, history: chartHistory };
}
