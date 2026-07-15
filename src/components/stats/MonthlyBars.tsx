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

// Warm serif tooltip in the app's display font, on a soft cream card — matches
// the instruments' warm palette instead of recharts' plain white/sans box.
const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid rgba(201,133,42,0.35)",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(92,61,33,0.18)",
  direction: "rtl" as const,
  background: "#fffdf7",
  color: "#5b3a1b",
  fontFamily: "var(--font-thamaniah), serif",
};

// Thin gold line-work (gridlines · axis ticks) — the instruments' idiom.
const GRID_GOLD = "#c9852a";
const TICK_GOLD = "#a9814a";
const tickStyle = { fontSize: 11, fill: TICK_GOLD, fontFamily: "var(--font-thamaniah), serif" };

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
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_GOLD} strokeOpacity={0.22} />
        <XAxis dataKey="name" reversed tick={tickStyle} axisLine={false} tickLine={false} />
        <YAxis orientation="right" tick={{ ...tickStyle, fontSize: 10 }} axisLine={false} tickLine={false} width={yWidth} />
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
