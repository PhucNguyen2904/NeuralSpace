"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function MetricsChart({
  data
}: {
  data: { epoch: number; train_loss: number; val_loss: number; train_accuracy?: number; val_accuracy?: number }[];
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EDE9FE" />
          <XAxis dataKey="epoch" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="train_loss" stroke="#6366f1" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="val_loss" stroke="#8B5CF6" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
