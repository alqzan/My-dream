"use client";
import { useEffect, useState } from "react";
import { computePrayerTimes, getCachedCoords, hijriParts, isRamadan, formatClock } from "@/lib/utils";

// Seasonal Ramadan card — renders only during the Hijri month of رمضان, so it
// leaves zero footprint the rest of the year. Shows the Ramadan day and a live
// countdown to إفطار (المغرب) or, after sunset, to الإمساك (فجر الغد), computed
// fully offline from the same solar model the prayer widgets use.
export function RamadanCard() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now || !isRamadan(now)) return null;

  const coords = getCachedCoords();
  const times = computePrayerTimes(now, coords.lat, coords.lng);
  if (!times) return null;

  const fajr = times.الفجر;
  const maghrib = times.المغرب;

  let target: Date;
  let label: string;
  let emoji: string;
  if (now < fajr) {
    target = fajr;
    label = "يتبقّى للإمساك";
    emoji = "🌙";
  } else if (now < maghrib) {
    target = maghrib;
    label = "يتبقّى للإفطار";
    emoji = "🌇";
  } else {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const t2 = computePrayerTimes(tomorrow, coords.lat, coords.lng);
    target = t2?.الفجر ?? fajr;
    label = "يتبقّى للإمساك";
    emoji = "🌙";
  }

  const diff = Math.max(0, target.getTime() - now.getTime());
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");

  const day = hijriParts(now)?.day ?? null;

  return (
    <div className="relative overflow-hidden rounded-2xl p-4 text-white bg-gradient-to-br from-[#3a2a5c] via-[#4a3570] to-[#6b4629] card-shadow shine">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-white/60 font-medium">رمضان مبارك {emoji}</p>
          <p className="text-base font-bold mt-0.5">
            {day ? `اليوم ${day} من رمضان` : "شهر رمضان"}
          </p>
        </div>
        <div className="text-3xl">🌙</div>
      </div>

      <div className="mt-3 bg-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-white/60">{label}</p>
          <p className="text-3xl font-black tabular-nums leading-tight mt-0.5" dir="ltr">
            {h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}
          </p>
        </div>
        <div className="text-left space-y-1">
          <p className="text-[11px] text-white/60">الإفطار {formatClock(maghrib)}</p>
          <p className="text-[11px] text-white/60">الإمساك {formatClock(fajr)}</p>
        </div>
      </div>
    </div>
  );
}
