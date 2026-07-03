"use client";
import { useState } from "react";
import { getMonthDates, arabicMonthName, getPrayerLog, hijriMonthLabel, hijriDay, today, parseDate } from "@/lib/utils";
import { PRAYERS, PRAYER_STATUS_META, type PrayerLog } from "@/lib/types";
import { ChevronRight, ChevronLeft } from "lucide-react";

interface PrayerCalendarProps {
  prayerLogs: PrayerLog[];
  onDayClick: (date: string) => void;
}

const DAYS_AR = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];

// Each day renders as a tiny five-dot "fingerprint" of that day's prayers
// instead of a single flat colour — a month becomes a mosaic at a glance.
export function PrayerCalendar({ prayerLogs, onDayClick }: PrayerCalendarProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const dates = getMonthDates(year, month);
  const firstDay = new Date(year, month, 1).getDay();
  const todayStr = today();

  function prev() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function next() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={next} className="p-1.5 hover:bg-gray-100 rounded-full">
          <ChevronRight size={16} className="text-gray-400" />
        </button>
        <div className="text-center">
          <span className="block text-sm font-semibold text-gray-700">
            {arabicMonthName(month)} {year}
          </span>
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
          const log = getPrayerLog(prayerLogs, date);
          const isToday = date === todayStr;
          const isFuture = date > todayStr;
          return (
            <button
              key={date}
              onClick={() => onDayClick(date)}
              className={`aspect-square flex flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
                isToday ? "ring-1 ring-prayer" : "hover:bg-gray-50"
              }`}
            >
              <span className={`text-[10px] font-medium leading-none ${isFuture ? "text-gray-300" : "text-gray-600"}`}>
                {parseDate(date).getDate()}
              </span>
              <span className={`text-[7px] leading-none ${isFuture ? "text-gray-200" : "text-gray-400"}`}>
                {hijriDay(date)}
              </span>
              <span className="flex gap-[1.5px]">
                {PRAYERS.map((p) => {
                  const status = log?.prayers[p] ?? "لم";
                  const color = isFuture ? "#e9e2d0" : PRAYER_STATUS_META[status].color;
                  return (
                    <span
                      key={p}
                      className="block w-[3px] h-[3px] rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  );
                })}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-3 text-[10px] text-gray-400 pt-1">
        {(["لم", "منفردة", "جماعة"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="block w-2 h-2 rounded-full" style={{ backgroundColor: PRAYER_STATUS_META[s].color }} />
            {PRAYER_STATUS_META[s].short === "لم" ? "لم تُصلَّ" : PRAYER_STATUS_META[s].short}
          </span>
        ))}
      </div>
    </div>
  );
}
