"use client";
import type { RecurringTransaction } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { nextDueDate, formatAmount } from "@/lib/utils";
import { describeFrequency } from "./RecurringManager";

interface UpcomingRecurringProps {
  recurring: RecurringTransaction[];
}

// A short "what's coming" strip so recurring bills feel anticipated instead
// of a surprise line item at the end of the month.
export function UpcomingRecurring({ recurring }: UpcomingRecurringProps) {
  const active = recurring.filter((r) => r.active);
  if (!active.length) return null;

  const now = new Date();
  const upcoming = active
    .map((r) => ({ r, due: nextDueDate(r, now) }))
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .slice(0, 4);

  function daysUntil(due: Date) {
    return Math.round((due.getTime() - new Date(now.toDateString()).getTime()) / (24 * 3600 * 1000));
  }

  return (
    <div className="space-y-2">
      <span className="text-sm font-semibold text-gray-700">القادم قريباً</span>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {upcoming.map(({ r, due }) => {
          const info = CATEGORY_LABELS[r.category];
          const days = daysUntil(due);
          return (
            <div key={r.id} className="shrink-0 bg-white border border-gray-100 rounded-xl px-3 py-2 min-w-[120px]">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 truncate">
                <span>{info.icon}</span>
                <span className="truncate">{r.note || info.label}</span>
              </div>
              <div className="text-xs text-red-500 font-bold mt-0.5">-{formatAmount(r.amount)} ر.س</div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {days <= 0 ? "اليوم" : days === 1 ? "غداً" : `خلال ${days} يوم`} · {describeFrequency(r.unit, r.every)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
