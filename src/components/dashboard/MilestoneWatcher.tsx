"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import {
  getDailyCompletionDates,
  calcStreak,
  getPrayerStreak,
  getJournalStreak,
  getReadingStreak,
  buzz,
} from "@/lib/utils";
import { hifzStreak } from "@/lib/quran/hifz";
import { juzRange } from "@/lib/quran/meta";
import { STREAK_MILESTONES, BOOK_MILESTONES, highestReached } from "@/lib/milestones";
import { Confetti } from "@/components/ui/Confetti";
import { showToast } from "@/components/ui/UndoToast";

interface Metric {
  key: string;
  value: number;
  thresholds: number[];
  message: (t: number) => string;
}

// Watches the app's headline streaks and book count and throws a confetti
// burst the moment one crosses a milestone — the first 7-day streak, a 100th
// day, a 10th finished book. Each milestone celebrates once, ever (a persisted
// marker per metric). A ~2.5s warm-up captures the real baseline after cloud
// sync settles, so opening the app on a device that already has a long streak
// doesn't retro-fire a celebration.
export function MilestoneWatcher() {
  const { journalEntries, readingLogs, prayerLogs, books, quranHifz } = useAppStore();
  const [ready, setReady] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready) return;

    const completion = getDailyCompletionDates(journalEntries, readingLogs);
    const booksFinished = books.filter((b) => b.status === "أنهيت").length;

    const metrics: Metric[] = [
      { key: "full", value: calcStreak(completion), thresholds: STREAK_MILESTONES,
        message: (t) => `🔥 سلسلة ${t} يوم متواصل — مذكرة وقراءة كل يوم!` },
      { key: "prayer", value: getPrayerStreak(prayerLogs), thresholds: STREAK_MILESTONES,
        message: (t) => `🕌 ${t} يوماً وصلواتك الخمس كاملة — ما شاء الله!` },
      { key: "journal", value: getJournalStreak(journalEntries), thresholds: STREAK_MILESTONES,
        message: (t) => `📓 ${t} يوماً من الكتابة المتواصلة!` },
      { key: "reading", value: getReadingStreak(readingLogs), thresholds: STREAK_MILESTONES,
        message: (t) => `📚 ${t} يوماً من القراءة المتواصلة!` },
      { key: "books", value: booksFinished, thresholds: BOOK_MILESTONES,
        message: (t) => `🏁 أنهيت ${t} ${t === 1 ? "كتاباً — بداية رحلة!" : "كتاباً!"}` },
      { key: "hifz", value: hifzStreak(quranHifz ?? { plan: null, frontierId: 0, sessions: [], reviews: [], reviewCursorId: 0 }), thresholds: STREAK_MILESTONES,
        message: (t) => `🧠 ${t} يوماً من الحفظ المتواصل — ثبّتك الله!` },
    ];

    const messages: string[] = [];
    for (const m of metrics) {
      const reached = highestReached(m.value, m.thresholds);
      const storageKey = `madar-ms-${m.key}`;
      let stored: number | null;
      try {
        const raw = localStorage.getItem(storageKey);
        stored = raw === null ? null : parseInt(raw) || 0;
      } catch {
        stored = 0;
      }
      // First time we ever see this metric: record the baseline silently.
      if (stored === null) {
        try { localStorage.setItem(storageKey, String(reached)); } catch { /* ignore */ }
        continue;
      }
      if (reached > stored) {
        try { localStorage.setItem(storageKey, String(reached)); } catch { /* ignore */ }
        messages.push(m.message(reached));
      }
    }

    // إتمام جزءٍ من الحفظ — كلّما اكتمل جزءٌ كاملاً ضمن المحفوظ نحتفل باسمه.
    if (quranHifz?.plan) {
      let completed = 0, top = 0;
      for (let j = 1; j <= 30; j++) {
        const r = juzRange(j);
        if (r.start >= quranHifz.plan.startId && r.end <= quranHifz.frontierId) { completed++; top = j; }
      }
      const key = "madar-ms-hifzjuz";
      let stored: number | null;
      try { const raw = localStorage.getItem(key); stored = raw === null ? null : parseInt(raw) || 0; } catch { stored = 0; }
      if (stored === null) {
        try { localStorage.setItem(key, String(completed)); } catch { /* ignore */ }
      } else if (completed > stored) {
        try { localStorage.setItem(key, String(completed)); } catch { /* ignore */ }
        messages.push(`🎉 أتممت حفظ الجزء ${top} — تقبّل الله وبارك فيك!`);
      }
    }

    if (messages.length) {
      setCelebrate(true);
      buzz(30);
      showToast(messages[0], "success");
      const t = setTimeout(() => setCelebrate(false), 5200);
      return () => clearTimeout(t);
    }
  }, [ready, journalEntries, readingLogs, prayerLogs, books, quranHifz]);

  return celebrate ? <Confetti pieces={80} /> : null;
}
