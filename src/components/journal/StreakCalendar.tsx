"use client";
import { useState } from "react";
import { getMonthDates, arabicMonthName } from "@/lib/utils";
import { ChevronRight, ChevronLeft } from "lucide-react";

interface StreakCalendarProps {
  markedDates: string[];
  color?: string;
  onDayClick?: (date: string) => void;
}

const DAYS_AR = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];

export function StreakCalendar({ markedDates, color = "#7c6fcd", onDayClick }: StreakCalendarProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const dates = getMonthDates(year, month);
  const firstDay = new Date(year, month, 1).getDay();
  const marked = new Set(markedDates);
  const todayStr = now.toISOString().split("T")[0];

  function prev() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function next() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={next} className="p-1.5 hover:bg-gray-100 rounded-full">
          <ChevronRight size={16} className="text-gray-400" />
        </button>
        <span className="text-sm font-semibold text-gray-700">
          {arabicMonthName(month)} {year}
        </span>
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
          const isMarked = marked.has(date);
          const isToday = date === todayStr;
          return (
            <button
              key={date}
              onClick={() => onDayClick?.(date)}
              disabled={!onDayClick}
              className={`aspect-square flex items-center justify-center rounded-full text-xs font-medium transition-colors ${
                onDayClick ? "hover:ring-2 hover:ring-offset-1 cursor-pointer" : ""
              }`}
              style={
                isMarked
                  ? { backgroundColor: color, color: "#fff" }
                  : isToday
                  ? { border: `2px solid ${color}`, color }
                  : {}
              }
            >
              {new Date(date).getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
