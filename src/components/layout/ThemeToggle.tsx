"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { sunTimes } from "@/lib/utils";
import { Moon, Sun, SunMoon } from "lucide-react";

// Default coordinates (Riyadh) until the browser shares a real location —
// close enough for sunset/sunrise anywhere in the Gulf.
const FALLBACK_COORDS = { lat: 24.7136, lng: 46.6753 };
const GEO_KEY = "madar-geo";

function getCachedCoords(): { lat: number; lng: number } {
  try {
    const raw = localStorage.getItem(GEO_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return FALLBACK_COORDS;
}

// Is it currently "night" — i.e. after المغرب (sunset) or before sunrise?
function isNightNow(): boolean {
  const now = new Date();
  const coords = getCachedCoords();
  const t = sunTimes(now, coords.lat, coords.lng);
  if (!t) return now.getHours() >= 18 || now.getHours() < 6;
  return now >= t.sunset || now < t.sunrise;
}

// Applies the `dark` class on <html>. In "auto" mode the theme follows the
// sun: dark from المغرب until الصباح (sunrise) — re-checked every minute so
// the flip happens live without a reload.
export function ThemeApplier() {
  const theme = useAppStore((s) => s.theme);
  const [, setTick] = useState(0);

  // Ask for the real location once (silently) so sunset matches the user's
  // city; the cheap fallback is Riyadh.
  useEffect(() => {
    if (theme !== "auto") return;
    try {
      if (localStorage.getItem(GEO_KEY) || !("geolocation" in navigator)) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          localStorage.setItem(
            GEO_KEY,
            JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          );
          setTick((t) => t + 1);
        },
        () => {},
        { maximumAge: 24 * 3600 * 1000, timeout: 8000 }
      );
    } catch {}
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    function apply() {
      const dark = theme === "dark" || (theme === "auto" && isNightNow());
      root.classList.toggle("dark", dark);
    }
    apply();
    if (theme !== "auto") return;
    const id = setInterval(apply, 60 * 1000);
    return () => clearInterval(id);
  }, [theme]);

  return null;
}

const MODE_META = {
  auto: { icon: SunMoon, label: "تلقائي — ليلي مع المغرب ونهاري مع الصباح" },
  light: { icon: Sun, label: "الوضع النهاري" },
  dark: { icon: Moon, label: "الوضع الليلي" },
} as const;

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const meta = MODE_META[theme] ?? MODE_META.auto;
  const Icon = meta.icon;

  return (
    <button
      onClick={toggleTheme}
      className={
        "relative p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 transition-colors " +
        (className ?? "")
      }
      title={meta.label}
      aria-label={`الوضع الحالي: ${meta.label} — اضغط للتبديل`}
    >
      <Icon size={18} />
      {theme === "auto" && (
        <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] font-bold text-brand-500 leading-none">
          تلقائي
        </span>
      )}
    </button>
  );
}
