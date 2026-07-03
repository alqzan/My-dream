"use client";
import { useMemo, useState } from "react";
import { formatDate, today, toDateStr } from "@/lib/utils";

interface YearHeatmapProps {
  // date (YYYY-MM-DD) → score 0..3 (how many of the three dailies were done)
  scores: Record<string, number>;
}

// Warm gold scale matching the Andalusian theme.
const LEVEL_COLORS = [
  "rgba(92, 61, 33, 0.08)", // 0 — empty
  "#f0d9a8", // 1
  "#dfa74e", // 2
  "#b56a1e", // 3 — full day
];

const DAY_LABELS = ["أح", "", "ثل", "", "خم", "", "سب"];

// GitHub-style heatmap of the last 52 weeks. Rendered inside an RTL
// scroll container so the most recent weeks are visible first.
export function YearHeatmap({ scores }: YearHeatmapProps) {
  const [tooltip, setTooltip] = useState<string | null>(null);

  const weeks = useMemo(() => {
    // End on the Saturday of the current week, go back 52 weeks.
    const end = new Date();
    end.setDate(end.getDate() + (6 - end.getDay()));
    const result: { date: string; future: boolean }[][] = [];
    const todayStr = today();
    for (let w = 0; w < 52; w++) {
      const week: { date: string; future: boolean }[] = [];
      for (let d = 6; d >= 0; d--) {
        const day = new Date(end);
        day.setDate(end.getDate() - w * 7 - (6 - d));
        const dateStr = toDateStr(day);
        week.push({ date: dateStr, future: dateStr > todayStr });
      }
      result.push(week); // result[0] = current week (newest first)
    }
    return result;
  }, []);

  const completedDays = Object.values(scores).filter((s) => s === 3).length;
  const activeDays = Object.values(scores).filter((s) => s > 0).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          <span className="font-bold text-gray-800">{completedDays}</span> يوم مكتمل
          <span className="mx-1.5 text-gray-300">•</span>
          <span className="font-bold text-gray-800">{activeDays}</span> يوم نشِط
        </span>
        <span className="flex items-center gap-1">
          أقل
          {LEVEL_COLORS.map((c, i) => (
            <span key={i} className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: c }} />
          ))}
          أكثر
        </span>
      </div>

      <div className="flex gap-1.5">
        <div className="flex flex-col gap-[3px] pt-0 text-[9px] text-gray-400 shrink-0">
          {DAY_LABELS.map((l, i) => (
            <div key={i} className="h-[11px] leading-[11px]">{l}</div>
          ))}
        </div>
        <div className="overflow-x-auto pb-1 flex-1 min-w-0">
          <div className="flex gap-[3px] w-max">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map(({ date, future }) => {
                  const score = scores[date] ?? 0;
                  return (
                    <button
                      key={date}
                      onClick={() => setTooltip(tooltip === date ? null : date)}
                      className="w-[11px] h-[11px] rounded-[3px] transition-transform hover:scale-125"
                      style={{
                        backgroundColor: future ? "transparent" : LEVEL_COLORS[score],
                      }}
                      disabled={future}
                      aria-label={date}
                    />
                  );
                })}
              </div>
            ))}
          </div>
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
