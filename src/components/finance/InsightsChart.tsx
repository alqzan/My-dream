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
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#c9852a" strokeOpacity={0.22} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: "#a9814a", fontFamily: "var(--font-thamaniah), serif" }}
          axisLine={false}
          tickLine={false}
          interval={period === "شهر" ? 4 : 0}
        />
        <YAxis hide domain={[0, Math.max(maxBar, showBudgetLine ? dailyBudgetAmount! * 1.15 : 0)]} />
        <Tooltip
          cursor={{ fill: "rgba(61,150,64,0.08)" }}
          formatter={(v: number) => [`${format(v)} ر.س`, "الصرف"]}
          contentStyle={{ borderRadius: 12, border: "1px solid rgba(201,133,42,0.35)", fontSize: 12, direction: "rtl", boxShadow: "0 6px 20px rgba(92,61,33,0.18)", background: "#fffdf7", color: "#5b3a1b", fontFamily: "var(--font-thamaniah), serif" }}
        />
        {showBudgetLine && (
          <ReferenceLine y={dailyBudgetAmount} stroke="#c9852a" strokeDasharray="4 4" strokeWidth={1.5} />
        )}
        {/* بلا حركة نموّ: الحركة كانت لا تستقرّ (خصوصًا مع خلايا الألوان المنفصلة
            والتحميل الكسول لـrecharts)، فتُلتقط الأعمدة قصيرةً باهتةً — كأخوات
            الرسم في «الإحصائيات». التعطيل يجعلها صلبةً فورًا ويحترم تقليل الحركة. */}
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={period === "شهر" ? 8 : 22} isAnimationActive={false}>
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
