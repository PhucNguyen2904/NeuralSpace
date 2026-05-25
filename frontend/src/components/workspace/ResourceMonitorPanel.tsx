"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils/cn";

type HistoryPoint = { index: number; cpu: number; ram: number; gpu: number };

type ResourceMonitorPanelProps = {
  open: boolean;
  hasGpu: boolean;
  cpu: { usagePercent: number; usedCores: number; totalCores: number };
  memory: { usedGb: number; totalGb: number; usagePercent: number; kernelMb: number; packagesMb: number; freeMb: number };
  gpu: { usagePercent: number; vramUsedGb: number; vramTotalGb: number; temperatureC: number };
  history: HistoryPoint[];
};

function gaugeColor(value: number) {
  if (value >= 80) return "var(--color-error-500)";
  if (value >= 60) return "var(--color-warning-500)";
  return "var(--color-success-500)";
}

function SemiGauge({ value }: { value: number }) {
  const radius = 58;
  const circumference = Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const dashOffset = circumference - (clamped / 100) * circumference;
  const color = gaugeColor(clamped);

  return (
    <div className="relative h-28 w-36">
      <svg viewBox="0 0 140 90" className="h-full w-full overflow-visible">
        <path d="M 12 78 A 58 58 0 0 1 128 78" fill="none" stroke="var(--color-border-default)" strokeWidth="10" strokeLinecap="round" />
        <path
          d="M 12 78 A 58 58 0 0 1 128 78"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 450ms ease, stroke 450ms ease" }}
        />
      </svg>
      <p className="absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-xl font-semibold text-text-primary">{clamped}%</p>
    </div>
  );
}

const sparklineMargin = { top: 2, right: 2, bottom: 2, left: 2 };

export function ResourceMonitorPanel({ open, hasGpu, cpu, memory, gpu, history }: ResourceMonitorPanelProps) {
  const ramFill = `${Math.max(0, Math.min(100, memory.usagePercent))}%`;
  const cpuChart = history.map((point) => ({ index: point.index, value: point.cpu }));
  const ramChart = history.map((point) => ({ index: point.index, value: point.ram }));
  const gpuChart = history.map((point) => ({ index: point.index, value: point.gpu }));

  return (
    <div className={cn("absolute bottom-7 left-0 right-0 z-30 h-[280px] translate-y-full border-t border-border bg-bg-surface px-4 py-3 shadow-2xl transition-transform duration-300", open && "translate-y-0")}>
      <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-border bg-bg-elevated p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">CPU</p>
          <div className="flex items-center justify-center"><SemiGauge value={cpu.usagePercent} /></div>
          <p className="text-center font-mono text-sm text-text-secondary">{cpu.usedCores} / {cpu.totalCores} cores</p>
          <div className="mt-2 h-16">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cpuChart} margin={sparklineMargin}>
                <Area type="monotone" dataKey="value" stroke="#2563EB" fill="#DBEAFE" fillOpacity={1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-bg-elevated p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">RAM</p>
          <div className="h-3 w-full overflow-hidden rounded bg-bg-surface">
            <div className="h-3 bg-gradient-to-r from-brand-500 to-info-500 transition-all duration-500" style={{ width: ramFill }} />
          </div>
          <p className="mt-2 font-mono text-sm text-text-secondary">{memory.usedGb} GB / {memory.totalGb} GB ({memory.usagePercent}%)</p>
          <div className="mt-2 space-y-1 text-xs text-text-secondary">
            <p>🔵 Kernel: {memory.kernelMb} MB</p>
            <p>🟣 Packages: {memory.packagesMb} MB</p>
            <p>⬜ Free: {(memory.freeMb / 1024).toFixed(1)} GB</p>
          </div>
          <div className="mt-2 h-14">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ramChart} margin={sparklineMargin}>
                <Area type="monotone" dataKey="value" stroke="#2563EB" fill="#DBEAFE" fillOpacity={1} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-bg-elevated p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">GPU</p>
          {hasGpu ? (
            <>
              <div className="flex items-center justify-center"><SemiGauge value={gpu.usagePercent} /></div>
              <p className="text-center font-mono text-sm text-text-secondary">GPU: {gpu.usagePercent}% · VRAM: {gpu.vramUsedGb}/{gpu.vramTotalGb} GB</p>
              <p className="text-center text-xs text-text-secondary">🌡 {gpu.temperatureC}°C</p>
              <div className="mt-2 h-12">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={gpuChart} margin={sparklineMargin}>
                    <Area type="monotone" dataKey="value" stroke="#2563EB" fill="#DBEAFE" fillOpacity={1} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div className="flex h-[220px] flex-col items-center justify-center rounded-md border border-dashed border-border bg-bg-surface text-center">
              <p className="text-3xl">🧩</p>
              <p className="mt-2 text-sm font-medium text-text-primary">CPU tier không có GPU</p>
              <p className="text-xs text-text-tertiary">Chọn tier gpu-t4 để xem GPU metrics</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
