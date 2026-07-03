"use client";
import { useState } from "react";
import { getMonthDates, arabicMonthName, formatAmount, hijriMonthLabel, hijriDay, today, parseDate } from "@/lib/utils";
import type { Transaction, DailyBudget } from "@/lib/types";
import { ChevronRight, ChevronLeft } from "lucide-react";

const DAYS_AR = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];

interface SpendCalendarProps {
  transactions: Transaction[];
  dailyBudget: DailyBudget | null;
  onDayClick: (date: string) => void;
}

// A month at a glance: each day is a little bar sized by that day's spend.
// With a daily budget set, the bar is tinted by whether that day kept to
// the daily rate (green) or ran over it (red); otherwise it's a plain
// relative-height bar.
export function SpendCalendar({ transactions, dailyBudget, onDayClick }: SpendCalendarProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const dates = getMonthDates(year, month);
  const firstDay = new Date(year, month, 1).getDay();
  const todayStr = today();

  const spendByDate = new Map<string, number>();
  for (const t of transactions) {
    spendByDate.set(t.date, (spendByDate.get(t.date) ?? 0) + t.amount);
  }
  const maxSpend = Math.max(1, ...dates.map((d) => spendByDate.get(d) ?? 0));

  function prev() { if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1); }
  function next() { if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1); }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={next} className="p-1.5 hover:bg-gray-100 rounded-full">
          <ChevronRight size={16} className="text-gray-400" />
        </button>
        <div className="text-center">
          <span className="block text-sm font-semibold text-gray-700">{arabicMonthName(month)} {year}</span>
          <span className="block text-[10px] text-gray-400 mt-0.5">{hijriMonthLabel(year, month)}</span>
        </div>
        <button onClick={prev} className="p-1.5 hover:bg-gray-100 rounded-full">
          <ChevronLeft size={16} className="text-gray-400" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {DAYS_AR.map((d) => (
          <div key={d} className="text-[10px] font-medium text-gray-400 py-1">{d}</div>
        ))}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e-${i}`} />
        ))}
        {dates.map((date) => {
          const spent = spendByDate.get(date) ?? 0;
          const isToday = date === todayStr;
          const isFuture = date > todayStr;
          const barHeight = spent > 0 ? Math.max(4, Math.round((spent / maxSpend) * 20)) : 0;
          const barColor = dailyBudget
            ? spent > dailyBudget.amount ? "#e05555" : "#1f7a6c"
            : "#e17b6e";
          return (
            <button
              key={date}
              onClick={() => onDayClick(date)}
              className={`aspect-square flex flex-col items-center justify-end gap-0.5 rounded-lg pb-1 transition-colors ${
                isToday ? "ring-1 ring-finance" : "hover:bg-gray-50"
              }`}
            >
              {spent > 0 && (
                <div
                  className="w-2.5 rounded-full"
                  style={{ height: barHeight, backgroundColor: barColor }}
                  title={`${formatAmount(spent)} ر.س`}
                />
              )}
              <span className={`text-[10px] font-medium leading-none ${isFuture ? "text-gray-300" : "text-gray-600"}`}>
                {parseDate(date).getDate()}
              </span>
              <span className={`text-[7px] leading-none ${isFuture ? "text-gray-200" : "text-gray-400"}`}>
                {hijriDay(date)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-3 text-[10px] text-gray-400 pt-1">
        {dailyBudget ? (
          <>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-prayer inline-block" /> ضمن اليومية</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> تجاوزتها</span>
          </>
        ) : (
          <span>الطول = المبلغ المصروف</span>
        )}
      </div>
    </div>
  );
}
