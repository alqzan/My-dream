"use client";
import { useMemo } from "react";
import { useAppStore } from "@/lib/store";
import {
  today, getPrayerLog, countDayPrayers, getPrayerStreak, getMosqueStreak,
  computePrayerTimes, getCachedCoords, formatClock, buzz,
} from "@/lib/utils";
import { PRAYERS, PRAYER_META, PRAYER_STATUS_META, type PrayerName } from "@/lib/types";

// A stylised dawn-to-night sky arc — each of the five daily prayers sits at
// its rough place along the day, echoing the app's orbit motif (مدار).
// Tapping a station cycles: لم أصلِّ → صليت منفرداً → صليت بالمسجد.
const CX = 50;
const CY = 50;
const R = 42;
const VB_H = 60;
const ARC_LENGTH = Math.PI * R;

function point(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY - R * Math.sin(rad) };
}

const ARC_START = point(178);
const ARC_END = point(2);
const ARC_PATH = `M ${ARC_START.x} ${ARC_START.y} A ${R} ${R} 0 0 1 ${ARC_END.x} ${ARC_END.y}`;

interface PrayerOrbitProps {
  // "large" is used on the dedicated /prayers page, where the orbit is the
  // page's hero and sole input for today — slightly bigger touch targets
  // and type. "default" (dashboard widget) keeps the exact original look.
  size?: "default" | "large";
}

export function PrayerOrbit({ size = "default" }: PrayerOrbitProps) {
  const large = size === "large";
  const { prayerLogs, cyclePrayerStatus } = useAppStore();
  const todayStr = today();
  const log = getPrayerLog(prayerLogs, todayStr);
  const { prayed, mosque } = countDayPrayers(log);
  const streak = getPrayerStreak(prayerLogs);
  const mosqueStreak = getMosqueStreak(prayerLogs);

  const now = new Date();

  // Actual prayer times for the device's location (offline astronomical
  // calc, Umm al-Qura convention) + which prayer is up next.
  const times = useMemo(() => computePrayerTimes(now, getCachedCoords().lat, getCachedCoords().lng), [todayStr]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextPrayer: PrayerName | null = useMemo(() => {
    if (!times) return null;
    return PRAYERS.find((p) => times[p] > now) ?? null;
  }, [times, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const hourFrac = now.getHours() + now.getMinutes() / 60;
  const inRange = hourFrac >= 4.5 && hourFrac <= 21;
  const nowPoint = inRange ? point(178 - ((hourFrac - 4.5) / (21 - 4.5)) * 176) : null;

  return (
    <div className={large ? "space-y-3" : "space-y-2"}>
      <div className="flex items-center justify-between">
        <span className={`font-semibold text-gray-700 ${large ? "text-base" : "text-sm"}`}>صلوات اليوم</span>
        <div className={`flex items-center gap-3 font-medium ${large ? "text-sm" : "text-xs"}`}>
          <span className="flex items-center gap-1 text-amber-600">
            <span>🔥</span> {streak}
          </span>
          <span className="flex items-center gap-1 text-prayer">
            <span>🕌</span> {mosqueStreak}
          </span>
        </div>
      </div>

      <div className="relative w-full" style={{ aspectRatio: "100 / 62" }}>
        <svg viewBox={`0 0 100 ${VB_H}`} className="absolute inset-0 w-full h-full overflow-visible">
          <defs>
            <linearGradient id="prayerSky" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#c9852a" />
              <stop offset="28%" stopColor="#e8c15a" />
              <stop offset="50%" stopColor="#4a9fbd" />
              <stop offset="72%" stopColor="#e0793d" />
              <stop offset="100%" stopColor="#433a6b" />
            </linearGradient>
          </defs>
          <path d={ARC_PATH} fill="none" stroke="currentColor" className="text-gray-200 dark:text-[#3a2e1e]" strokeWidth="1.4" strokeLinecap="round" />
          <path
            d={ARC_PATH}
            fill="none"
            stroke="url(#prayerSky)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeDasharray={`${(prayed / 5) * ARC_LENGTH} 999`}
          />
          {nowPoint && (
            <circle cx={nowPoint.x} cy={nowPoint.y} r="1.4" fill="#e8b15a">
              <animate attributeName="opacity" values="0.35;1;0.35" dur="2.4s" repeatCount="indefinite" />
            </circle>
          )}
        </svg>

        {PRAYERS.map((prayer) => {
          const meta = PRAYER_META[prayer];
          const { x, y } = point(meta.angle);
          const status = log?.prayers[prayer] ?? "لم";
          const statusMeta = PRAYER_STATUS_META[status];
          const isNext = prayer === nextPrayer;
          return (
            <button
              key={prayer}
              onClick={() => { buzz(); cyclePrayerStatus(todayStr, prayer); }}
              className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2 group"
              style={{ left: `${x}%`, top: `${(y / VB_H) * 100}%` }}
              title={`${prayer} — ${statusMeta.label}`}
            >
              <span
                className={`rounded-full flex items-center justify-center shadow-sm border-2 transition-all group-active:scale-90 ${
                  large ? "w-11 h-11 text-lg" : "w-9 h-9 text-base"
                } ${isNext && status === "لم" ? "animate-pulse ring-2 ring-brand-300 ring-offset-1" : ""}`}
                style={{
                  backgroundColor: status === "لم" ? "#fff" : statusMeta.color,
                  borderColor: statusMeta.color,
                }}
              >
                {meta.icon}
              </span>
              <span className={`font-medium whitespace-nowrap ${large ? "text-xs" : "text-[10px]"} ${isNext ? "text-brand-600 font-bold" : "text-gray-500"}`}>
                {prayer}
              </span>
              {times && (
                <span className={`tabular-nums whitespace-nowrap -mt-0.5 ${large ? "text-[10px]" : "text-[8px]"} ${isNext ? "text-brand-500 font-bold" : "text-gray-400"}`}>
                  {formatClock(times[prayer])}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className={`text-center pt-1 ${large ? "text-sm" : "text-xs"}`}>
        {prayed === 5 ? (
          <span className="font-bold text-prayer">
            {mosque === 5 ? "🕌 صليتها كلها بالمسجد اليوم — الله يتقبّل" : "أكملت صلوات اليوم كلها ✨"}
          </span>
        ) : (
          <span className="text-gray-400">
            {prayed}/5 اليوم{mosque > 0 ? ` · ${mosque} بالمسجد 🕌` : ""}
            {nextPrayer && times ? ` · القادمة ${nextPrayer} ${formatClock(times[nextPrayer])}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
