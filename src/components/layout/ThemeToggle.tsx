"use client";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { sunTimes, getCachedCoords, GEO_KEY } from "@/lib/utils";
import { Moon, Sun, SunMoon } from "lucide-react";

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
  // Tracks the last-applied dark state so we only ease the colour change on an
  // actual flip (not on the first paint, and not on every minute-tick that
  // leaves the theme unchanged).
  const wasDark = useRef<boolean | null>(null);

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
    let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
    function apply() {
      const dark = theme === "dark" || (theme === "auto" && isNightNow());
      // Ease the colour change only on a genuine flip — skip the very first
      // apply (wasDark === null) so the initial paint doesn't animate.
      const flipping = wasDark.current !== null && wasDark.current !== dark;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (flipping && !reduce) {
        root.classList.add("theme-transition");
        if (cleanupTimer) clearTimeout(cleanupTimer);
        cleanupTimer = setTimeout(() => root.classList.remove("theme-transition"), 700);
      }
      root.classList.toggle("dark", dark);
      wasDark.current = dark;
    }
    apply();
    if (theme !== "auto") return () => { if (cleanupTimer) clearTimeout(cleanupTimer); };
    const id = setInterval(apply, 60 * 1000);
    return () => {
      clearInterval(id);
      if (cleanupTimer) clearTimeout(cleanupTimer);
    };
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
