import { type ReactElement, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import type { RunDetailData } from "@/lib/hooks/useExperiments";

interface MetricsChartProps {
  run: RunDetailData;
}

export function MetricsChart({ run }: MetricsChartProps) {
  const [showTrainAcc, setShowTrainAcc] = useState(true);
  const [showValAcc, setShowValAcc] = useState(true);
  const [showTrainLoss, setShowTrainLoss] = useState(true);
  const [showValLoss, setShowValLoss] = useState(true);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <label><input type="checkbox" checked={showTrainAcc} onChange={() => setShowTrainAcc((v) => !v)} /> train_accuracy</label>
        <label><input type="checkbox" checked={showValAcc} onChange={() => setShowValAcc((v) => !v)} /> val_accuracy</label>
        <label><input type="checkbox" checked={showTrainLoss} onChange={() => setShowTrainLoss((v) => !v)} /> train_loss</label>
        <label><input type="checkbox" checked={showValLoss} onChange={() => setShowValLoss((v) => !v)} /> val_loss</label>
      </div>

      <ChartBox title="Accuracy Curves">
        <LineChart data={run.metricHistory}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="epoch" />
          <YAxis domain={[0, 1]} />
          <Tooltip />
          <Legend />
          {showTrainAcc ? <Line type="monotone" dataKey="train_accuracy" stroke="#6366F1" dot={false} /> : null}
          {showValAcc ? <Line type="monotone" dataKey="val_accuracy" stroke="#10B981" dot={false} /> : null}
        </LineChart>
      </ChartBox>

      <ChartBox title="Loss Curves">
        <LineChart data={run.metricHistory}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="epoch" />
          <YAxis />
          <Tooltip />
          <Legend />
          {showTrainLoss ? <Line type="monotone" dataKey="train_loss" stroke="#F59E0B" dot={false} /> : null}
          {showValLoss ? <Line type="monotone" dataKey="val_loss" stroke="#EF4444" dot={false} /> : null}
        </LineChart>
      </ChartBox>
    </div>
  );
}

function ChartBox({ title, children }: { title: string; children: ReactElement }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
