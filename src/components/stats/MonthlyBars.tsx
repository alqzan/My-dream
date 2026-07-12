"use client";
// The recharts bundle is ~90KB — kept out of the stats page's initial JS and
// loaded on demand (via next/dynamic in the page) so the page shell paints
// first. This component holds every recharts import for both monthly charts.
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const tooltipStyle = {
  borderRadius: 12,
  border: "none",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(92,61,33,0.18)",
  direction: "rtl" as const,
};

interface MonthlyBarsProps {
  data: Record<string, string | number>[];
  dataKey: string;
  color: string;
  cursorFill: string;
  yWidth: number;
  format: (v: number) => string;
}

export function MonthlyBars({ data, dataKey, color, cursorFill, yWidth, format }: MonthlyBarsProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(92,61,33,0.08)" />
        <XAxis dataKey="name" reversed tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis orientation="right" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={yWidth} />
        <Tooltip
          formatter={(v: number) => [format(v), ""]}
          contentStyle={tooltipStyle}
          cursor={{ fill: cursorFill }}
        />
        <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}
