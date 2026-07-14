"use client";
import { useEffect, useMemo, useState } from "react";
import { arabicMonthName, formatDate, today, toDateStr } from "@/lib/utils";

interface YearHeatmapProps {
  // date (YYYY-MM-DD) → score 0..3 (how many of the three dailies were done)
  scores: Record<string, number>;
}

// Warm gold scale matching the Andalusian theme. Values live as CSS custom
// properties (globals.css) so the .dark block can swap them for tones that
// stay legible on the dark parchment background.
const LEVEL_COLORS = [
  "var(--heat-0)", // 0 — empty
  "var(--heat-1)", // 1
  "var(--heat-2)", // 2
  "var(--heat-3)", // 3 — full day
];

// ===================== Astrolabe geometry =====================
// The year is one round dial ("إسطرلاب السنة"): twelve month-sectors around a
// disc, each holding its days as small marks on short radial rows. January sits
// at the top; the year runs clockwise. Angle encodes the month (so the rim
// labels line up exactly with their sector), radius+column encode the day.
const VB = 360;
const CX = VB / 2;
const CY = VB / 2;
const R_LABEL = 170; // month names on the rim
const R_RIM_OUTER = 160;
const R_MARK_OUTER = 146;
const R_MARK_INNER = 80;
const R_RIM_INNER = 72;
const ROWS = 7; // up to 31 days → 7 rows of 5
const COLS = 5;
const ROW_STEP = (R_MARK_OUTER - R_MARK_INNER) / (ROWS - 1);
const COL_STEP = 6; // degrees between day-columns inside a sector
const SECTOR = 30; // degrees per month
const GAP = 3; // spoke half-gap between sectors (degrees)

function point(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

// Mid-angle of a month sector (m = 0..11). -90° = straight up (January).
function midAngle(m: number) {
  return -90 + m * SECTOR;
}

interface Mark {
  date: string;
  score: number;
  future: boolean;
  x: number;
  y: number;
}

export function YearHeatmap({ scores }: YearHeatmapProps) {
  const [tooltip, setTooltip] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(
      typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    );
  }, []);

  const todayStr = today();
  const year = Number(todayStr.slice(0, 4));
  const curMonth = new Date().getMonth();

  // All marks for the calendar year, laid out sector → row → column.
  const marks = useMemo<Mark[]>(() => {
    const out: Mark[] = [];
    for (let m = 0; m < 12; m++) {
      const days = new Date(year, m + 1, 0).getDate();
      const base = midAngle(m);
      for (let d = 1; d <= days; d++) {
        const i = d - 1;
        const row = Math.floor(i / COLS);
        const col = i % COLS;
        const angle = base + (col - (COLS - 1) / 2) * COL_STEP;
        const r = R_MARK_OUTER - row * ROW_STEP;
        const { x, y } = point(angle, r);
        const date = toDateStr(new Date(year, m, d));
        out.push({
          date,
          score: scores[date] ?? 0,
          future: date > todayStr,
          x,
          y,
        });
      }
    }
    return out;
  }, [scores, year, todayStr]);

  const completedDays = Object.entries(scores).filter(
    ([d, s]) => s === 3 && d.startsWith(String(year))
  ).length;
  const activeDays = Object.entries(scores).filter(
    ([d, s]) => s > 0 && d.startsWith(String(year))
  ).length;

  // Faint gold wedge behind the current month.
  const wedge = useMemo(() => {
    const a0 = midAngle(curMonth) - SECTOR / 2 + GAP;
    const a1 = midAngle(curMonth) + SECTOR / 2 - GAP;
    const oi = point(a0, R_RIM_INNER);
    const oo = point(a0, R_RIM_OUTER);
    const eo = point(a1, R_RIM_OUTER);
    const ei = point(a1, R_RIM_INNER);
    return `M ${oi.x} ${oi.y} L ${oo.x} ${oo.y} A ${R_RIM_OUTER} ${R_RIM_OUTER} 0 0 1 ${eo.x} ${eo.y} L ${ei.x} ${ei.y} A ${R_RIM_INNER} ${R_RIM_INNER} 0 0 0 ${oi.x} ${oi.y} Z`;
  }, [curMonth]);

  return (
    <div className="space-y-3">
      {/* Summary + legend */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          <span className="font-bold text-gray-800">{activeDays}</span> يوم نشِط في {year}
        </span>
        <span className="flex items-center gap-1">
          أقل
          {LEVEL_COLORS.map((c, i) => (
            <span
              key={i}
              className="w-2.5 h-2.5 rounded-[3px]"
              style={{ backgroundColor: c }}
            />
          ))}
          أكثر
        </span>
      </div>

      {/* The disc */}
      <div className="relative mx-auto w-full max-w-[360px]" style={{ aspectRatio: "1 / 1" }}>
        <svg
          viewBox={`0 0 ${VB} ${VB}`}
          className="w-full h-full overflow-visible text-[#b07a2e] dark:text-[#e8c98a]"
        >
          {/* current-month wedge */}
          <path d={wedge} fill="currentColor" opacity={0.07} />

          {/* rings */}
          <circle cx={CX} cy={CY} r={R_RIM_OUTER} fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={1.2} />
          <circle cx={CX} cy={CY} r={R_RIM_INNER} fill="none" stroke="currentColor" strokeOpacity={0.28} strokeWidth={1} />

          {/* month spokes at each sector boundary */}
          {Array.from({ length: 12 }).map((_, m) => {
            const a = midAngle(m) - SECTOR / 2;
            const p0 = point(a, R_RIM_INNER);
            const p1 = point(a, R_RIM_OUTER);
            return (
              <line
                key={m}
                x1={p0.x}
                y1={p0.y}
                x2={p1.x}
                y2={p1.y}
                stroke="currentColor"
                strokeOpacity={0.16}
                strokeWidth={1}
              />
            );
          })}

          {/* day marks */}
          {marks.map((mk) => {
            const isToday = mk.date === todayStr;
            return (
              <circle
                key={mk.date}
                cx={mk.x}
                cy={mk.y}
                r={isToday ? 2.9 : 2.5}
                fill={mk.future ? "var(--heat-0)" : LEVEL_COLORS[mk.score]}
                fillOpacity={mk.future ? 0.4 : 1}
                className="cursor-pointer"
                onClick={() => setTooltip(tooltip === mk.date ? null : mk.date)}
                aria-label={mk.date}
              />
            );
          })}

          {/* today marker: a small gold ring, gently pulsing */}
          {marks
            .filter((mk) => mk.date === todayStr)
            .map((mk) => (
              <circle
                key="today"
                cx={mk.x}
                cy={mk.y}
                r={4.6}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.9}
                strokeWidth={1.3}
              >
                {!reduceMotion && (
                  <animate
                    attributeName="r"
                    values="4.2;5.4;4.2"
                    dur="2.6s"
                    repeatCount="indefinite"
                  />
                )}
              </circle>
            ))}

          {/* month labels on the rim */}
          {Array.from({ length: 12 }).map((_, m) => {
            const { x, y } = point(midAngle(m), R_LABEL);
            const isCur = m === curMonth;
            return (
              <text
                key={m}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={isCur ? 12.5 : 11.5}
                fontWeight={isCur ? 700 : 400}
                fill="currentColor"
                fillOpacity={isCur ? 1 : 0.6}
              >
                {arabicMonthName(m)}
              </text>
            );
          })}
        </svg>

        {/* center: the year's headline number */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-gray-800 leading-none tabular-nums">
            {completedDays}
          </span>
          <span className="text-[10px] text-gray-400 mt-1">يوم مكتمل</span>
          <span className="text-[11px] font-semibold text-[#b07a2e] dark:text-[#e8c98a] mt-2 tabular-nums">
            {year}
          </span>
        </div>
      </div>

      {tooltip && (
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 animate-fade-up">
          {formatDate(tooltip)} — {scores[tooltip] ?? 0} من 3 إنجازات
        </div>
      )}
    </div>
  );
}
