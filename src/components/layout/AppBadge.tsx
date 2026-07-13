"use client";
import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { today } from "@/lib/utils";

// Sets a badge on the installed PWA's home-screen icon while today is still
// incomplete (missing its journal entry and/or reading log), and clears it the
// moment the day is done. A silent nudge — no notifications, no permission
// prompts. A no-op where the Badging API isn't available (most desktop
// browsers, non-installed web pages).
export function AppBadge() {
  const journalEntries = useAppStore((s) => s.journalEntries);
  const readingLogs = useAppStore((s) => s.readingLogs);

  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (typeof nav.setAppBadge !== "function") return;

    const todayStr = today();
    const missing =
      (journalEntries.some((e) => e.date === todayStr) ? 0 : 1) +
      (readingLogs.some((l) => l.date === todayStr) ? 0 : 1);

    try {
      if (missing > 0) nav.setAppBadge(missing);
      else nav.clearAppBadge?.();
    } catch {
      /* badge unsupported or blocked — ignore */
    }
  }, [journalEntries, readingLogs]);

  return null;
}
