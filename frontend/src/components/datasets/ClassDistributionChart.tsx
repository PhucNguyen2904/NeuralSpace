"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function ClassDistributionChart({ distribution }: { distribution: Record<string, number> }) {
  const entries = Object.entries(distribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={entries} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#D1FAE5" />
          <XAxis type="number" tick={{ fill: "#5a6070", fontSize: 12 }} />
          <YAxis dataKey="name" type="category" tick={{ fill: "#0f1117", fontSize: 12 }} width={95} />
          <Tooltip cursor={{ fill: "#ECFDF5" }} />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} fill="#10B981" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
