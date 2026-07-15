"use client";
import { useState } from "react";
import { getMonthDates, arabicMonthName, getPrayerLog, hijriMonthLabel, hijriDay, today, parseDate } from "@/lib/utils";
import { PRAYERS, PRAYER_STATUS_META, type PrayerLog } from "@/lib/types";
import { ChevronRight, ChevronLeft } from "lucide-react";

interface PrayerCalendarProps {
  prayerLogs: PrayerLog[];
  onDayClick: (date: string) => void;
  // Optional controlled view: when provided (e.g. so فلك الشهور can jump the
  // calendar to a tapped month) they drive the displayed month; otherwise the
  // calendar keeps its own internal month state as before.
  year?: number;
  month?: number;
  onNavigate?: (year: number, month: number) => void;
}

const DAYS_AR = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];

// ===== مدار مصغّر — a micro echo of PrayerOrbit's dawn→night sky arc =====
// Each day carries its five prayers as beads on a tiny gold semicircle, each
// coloured by that prayer's status (لم/منفردة/بالمسجد) — so the month reads as
// a field of little orbits rather than flat dot-rows. The stations are spread
// evenly (not at PrayerOrbit's true angles, which bunch illegibly at ~26px);
// order stays الفجر→العشاء with dawn on the left, matching the big instrument.
const MO_CX = 12;
const MO_CY = 11.4;
const MO_R = 9.2;
const MO_ANGLES = [162, 126, 90, 54, 18];
function moPoint(deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: MO_CX + MO_R * Math.cos(rad), y: MO_CY - MO_R * Math.sin(rad) };
}
const MO_ARC = (() => {
  const a = moPoint(180), b = moPoint(0);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${MO_R} ${MO_R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
})();

function MiniOrbit({ log, isFuture }: { log: PrayerLog | undefined; isFuture: boolean }) {
  return (
    <svg viewBox="0 0 24 13" className="w-[26px] h-[14px] overflow-visible" aria-hidden="true">
      <path
        d={MO_ARC}
        fill="none"
        stroke="currentColor"
        className="text-[#e2d3aa] dark:text-[#54462d]"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {PRAYERS.map((p, i) => {
        const status = log?.prayers[p] ?? "لم";
        const color = isFuture ? "#e6dcc6" : PRAYER_STATUS_META[status].color;
        const { x, y } = moPoint(MO_ANGLES[i]);
        return <circle key={p} cx={x} cy={y} r="1.7" fill={color} />;
      })}
    </svg>
  );
}

// Each day renders as a tiny mini-orbit of that day's five prayers instead of a
// single flat colour — a month becomes a field of little orbits at a glance.
export function PrayerCalendar({ prayerLogs, onDayClick, year: yearProp, month: monthProp, onNavigate }: PrayerCalendarProps) {
  const now = new Date();
  const [internalYear, setInternalYear] = useState(now.getFullYear());
  const [internalMonth, setInternalMonth] = useState(now.getMonth());
  const year = yearProp ?? internalYear;
  const month = monthProp ?? internalMonth;

  const dates = getMonthDates(year, month);
  const firstDay = new Date(year, month, 1).getDay();
  const todayStr = today();

  // Keep internal state in sync AND notify the parent, so the component works
  // both standalone (uncontrolled) and controlled without desyncing.
  function navigate(y: number, m: number) {
    setInternalYear(y);
    setInternalMonth(m);
    onNavigate?.(y, m);
  }
  function prev() {
    if (month === 0) navigate(year - 1, 11);
    else navigate(year, month - 1);
  }
  function next() {
    if (month === 11) navigate(year + 1, 0);
    else navigate(year, month + 1);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={next} aria-label="الشهر التالي" className="p-1.5 hover:bg-gray-100 rounded-full">
          <ChevronRight size={16} className="text-gray-400" />
        </button>
        <div className="text-center">
          <span className="block text-sm font-semibold text-gray-700">
            {arabicMonthName(month)} {year}
          </span>
          <span className="block text-[10px] text-gray-400 mt-0.5">{hijriMonthLabel(year, month)}</span>
        </div>
        <button onClick={prev} aria-label="الشهر السابق" className="p-1.5 hover:bg-gray-100 rounded-full">
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
              <MiniOrbit log={log} isFuture={isFuture} />
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
