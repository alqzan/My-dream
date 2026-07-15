"use client";
import { useEffect, useState } from "react";
import { computePrayerTimes, getCachedCoords, formatClock } from "@/lib/utils";

// A small rotating daily reflection — one item per day of the year, so the
// card changes every morning but stays stable throughout the day.
const HIKAM: { text: string; source: string }[] = [
  { text: "وَقُلِ اعْمَلُوا فَسَيَرَى اللَّهُ عَمَلَكُمْ وَرَسُولُهُ وَالْمُؤْمِنُونَ", source: "التوبة ١٠٥" },
  { text: "أحبُّ الأعمالِ إلى اللهِ أدومُها وإن قلّ", source: "متفق عليه" },
  { text: "إِنَّ مَعَ الْعُسْرِ يُسْرًا", source: "الشرح ٦" },
  { text: "الصلاةُ نور", source: "رواه مسلم" },
  { text: "من سلك طريقًا يلتمس فيه علمًا سهّل الله له به طريقًا إلى الجنة", source: "رواه مسلم" },
  { text: "وَاصْبِرْ وَمَا صَبْرُكَ إِلَّا بِاللَّهِ", source: "النحل ١٢٧" },
  { text: "القناعة كنزٌ لا يفنى", source: "حكمة" },
  { text: "الوقت كالسيف إن لم تقطعه قطعك", source: "حكمة" },
  { text: "قليلٌ دائم خيرٌ من كثيرٍ منقطع", source: "حكمة" },
  { text: "وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ", source: "الطلاق ٣" },
  { text: "لا يشكر اللهَ من لا يشكر الناس", source: "رواه أبو داود" },
  { text: "لا تؤجل عمل اليوم إلى الغد", source: "حكمة" },
  { text: "وَفِي ذَٰلِكَ فَلْيَتَنَافَسِ الْمُتَنَافِسُونَ", source: "المطففين ٢٦" },
  { text: "درهم وقاية خيرٌ من قنطار علاج", source: "حكمة" },
];

// ===================== مزولة زاد اليوم =====================
// A thin gold sundial: a shallow circular arc where a sun bead marks how much
// of today's daylight (from الفجر to العشاء) has elapsed — using the SAME
// offline prayer-time computation the app already uses (PrayerOrbit), live.
// A shallow circular arc keeps arc-length linear in angle, so the filled
// portion and the bead land at exactly the same spot. الفجر يسار، العشاء يمين
// (like PrayerOrbit's sun path). An accent along the card's foot — hidden
// (never an error) when prayer times can't be computed.
const SD_CX = 50;
const SD_PEAK_Y = 3;
const SD_END_Y = 13;
const SD_END_X = 8;
const SD_DX = SD_CX - SD_END_X;
const SD_R = (SD_DX * SD_DX + (SD_END_Y - SD_PEAK_Y) ** 2) / (2 * (SD_END_Y - SD_PEAK_Y));
const SD_CY = SD_R + SD_PEAK_Y;
function sdPoint(deg: number) {
  const r = (deg * Math.PI) / 180;
  return { x: SD_CX + SD_R * Math.cos(r), y: SD_CY - SD_R * Math.sin(r) };
}
const SD_A_FAJR = (Math.atan2(SD_CY - SD_END_Y, SD_END_X - SD_CX) * 180) / Math.PI; // left
const SD_A_ISHA = (Math.atan2(SD_CY - SD_END_Y, 100 - SD_END_X - SD_CX) * 180) / Math.PI; // right
const SD_FAJR_PT = sdPoint(SD_A_FAJR);
const SD_ISHA_PT = sdPoint(SD_A_ISHA);
const SD_PATH = `M ${SD_FAJR_PT.x} ${SD_FAJR_PT.y} A ${SD_R} ${SD_R} 0 0 1 ${SD_ISHA_PT.x} ${SD_ISHA_PT.y}`;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function Sundial({ fajr, isha, now }: { fajr: Date; isha: Date; now: Date }) {
  const span = isha.getTime() - fajr.getTime();
  const frac = span > 0 ? clamp01((now.getTime() - fajr.getTime()) / span) : 0;
  const sun = sdPoint(SD_A_FAJR - frac * (SD_A_FAJR - SD_A_ISHA));
  return (
    <div className="mt-3 pt-2.5 border-t border-brand-100 dark:border-brand-900/40">
      <svg viewBox="0 0 100 16" className="w-full block overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="sundialGold" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e0a94e" />
            <stop offset="100%" stopColor="#c9852a" />
          </linearGradient>
          <radialGradient id="sundialSun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f6c76a" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#f6c76a" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* faint full track */}
        <path d={SD_PATH} fill="none" stroke="currentColor" className="text-brand-200 dark:text-[#3a2e1e]" strokeWidth="1" strokeLinecap="round" />
        {/* elapsed daylight — thin gold */}
        <path
          d={SD_PATH}
          fill="none"
          stroke="url(#sundialGold)"
          strokeWidth="1.3"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${frac} 1`}
        />
        {/* الفجر / العشاء end ticks */}
        <circle cx={SD_FAJR_PT.x} cy={SD_FAJR_PT.y} r="0.9" className="fill-brand-400 dark:fill-brand-500" />
        <circle cx={SD_ISHA_PT.x} cy={SD_ISHA_PT.y} r="0.9" className="fill-brand-400 dark:fill-brand-500" />
        {/* sun bead — current position in the day */}
        <circle cx={sun.x} cy={sun.y} r="3" fill="url(#sundialSun)" />
        <circle cx={sun.x} cy={sun.y} r="1.5" fill="#f0b84e" stroke="#fff7e6" strokeWidth="0.5" />
      </svg>
      <div className="relative mt-0.5 text-[8px] font-medium text-brand-500/70 dark:text-brand-300/60">
        <span className="absolute left-0 tabular-nums">الفجر {formatClock(fajr)}</span>
        <span className="absolute right-0 tabular-nums">العشاء {formatClock(isha)}</span>
        <span className="block h-3" />
      </div>
    </div>
  );
}

export function HikmaCard() {
  // Resolve the day index on the client only, to keep SSR output stable.
  const [hikma, setHikma] = useState<{ text: string; source: string } | null>(null);
  const [times, setTimes] = useState<{ fajr: Date; isha: Date } | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const n = new Date();
    const start = new Date(n.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((n.getTime() - start.getTime()) / (24 * 3600 * 1000));
    setHikma(HIKAM[dayOfYear % HIKAM.length]);

    // Prayer times for the device's cached location (offline calc). Null near
    // the poles → the sundial simply doesn't render.
    const { lat, lng } = getCachedCoords();
    const pt = computePrayerTimes(n, lat, lng);
    if (pt) setTimes({ fajr: pt.الفجر, isha: pt.العشاء });
    setNow(n);

    // Keep the sun bead live: nudge «now» each minute so it creeps across the
    // arc while the dashboard stays open.
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  if (!hikma) return null;

  return (
    <div className="rounded-2xl border border-brand-200 dark:border-brand-900/50 bg-gradient-to-l from-brand-50 to-white dark:from-brand-900/25 dark:to-transparent p-4">
      <div className="text-[11px] font-semibold text-brand-600 dark:text-brand-300 mb-1.5">✨ زاد اليوم</div>
      <p className="text-[15px] font-bold text-gray-800 dark:text-gray-100 leading-relaxed">{hikma.text}</p>
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">— {hikma.source}</p>
      {times && now && <Sundial fajr={times.fajr} isha={times.isha} now={now} />}
    </div>
  );
}
