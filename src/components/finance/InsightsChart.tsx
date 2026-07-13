"use client";
// The recharts bundle is ~90KB — kept out of the insights page's initial JS
// and loaded on demand (via next/dynamic in the page) so the page shell
// paints first. This component holds every recharts import for this chart.
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, ReferenceLine,
} from "recharts";

interface ChartPoint {
  key: string;
  label: string;
  value: number;
  daily: number;
  isNow: boolean;
}

interface InsightsChartProps {
  data: ChartPoint[];
  period: "أسبوع" | "شهر" | "سنة";
  maxBar: number;
  dailyBudgetAmount?: number;
  format: (v: number) => string;
}

export function InsightsChart({ data, period, maxBar, dailyBudgetAmount, format }: InsightsChartProps) {
  const showBudgetLine = dailyBudgetAmount !== undefined && period !== "سنة";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, left: 0, right: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e0d5" strokeOpacity={0.5} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: "#a2947a" }}
          axisLine={false}
          tickLine={false}
          interval={period === "شهر" ? 4 : 0}
        />
        <YAxis hide domain={[0, Math.max(maxBar, showBudgetLine ? dailyBudgetAmount! * 1.15 : 0)]} />
        <Tooltip
          cursor={{ fill: "#00000008" }}
          formatter={(v: number) => [`${format(v)} ر.س`, "الصرف"]}
          contentStyle={{ borderRadius: 12, border: "none", fontSize: 12, direction: "rtl", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}
        />
        {showBudgetLine && (
          <ReferenceLine y={dailyBudgetAmount} stroke="#c9852a" strokeDasharray="4 4" strokeWidth={1.5} />
        )}
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={period === "شهر" ? 8 : 22}>
          {data.map((d) => (
            <Cell
              key={d.key}
              fill={
                showBudgetLine && d.daily > dailyBudgetAmount!
                  ? "#e05555"
                  : d.isNow
                  ? "#1d5c20"
                  : "#3d9640"
              }
              fillOpacity={d.value === 0 ? 0.15 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
