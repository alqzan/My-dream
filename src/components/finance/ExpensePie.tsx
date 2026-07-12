"use client";
// Isolates the recharts import so the finance page can defer it (next/dynamic
// in FinanceSummary) instead of shipping ~90KB of charting in its initial JS.
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatAmount } from "@/lib/utils";

export interface PieDatum {
  name: string;
  value: number;
  color: string;
}

export function ExpensePie({ data }: { data: PieDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={40}
          outerRadius={65}
          dataKey="value"
          strokeWidth={2}
          stroke="#fff"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v: number) => [`${formatAmount(v)} ر.س`, ""]}
          contentStyle={{ borderRadius: 12, border: "none", fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
