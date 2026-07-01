import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { JournalEntry, ReadingLog, Transaction, PrayerLog, PrayerName } from "./types";
import { PRAYERS } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function today() {
  return new Date().toISOString().split("T")[0];
}

// Force Gregorian calendar + Latin digits so server (build) and client render
// identically — avoids hydration mismatches from ar-SA's Hijri default.
export function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDateShort(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { month: "short", day: "numeric" });
}

// Hijri (Umm al-Qura) date, e.g. "15 محرم 1448 هـ".
// Note: the ar-SA Islamic formatter already appends the "هـ" era marker on
// its own — appending it again produced a doubled "هـ هـ" (garbled to "ه ه").
export function hijriDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return "";
  }
}

// Percentage of the current year elapsed (0-100).
export function yearProgress(now = new Date()): number {
  const start = new Date(now.getFullYear(), 0, 1).getTime();
  const end = new Date(now.getFullYear() + 1, 0, 1).getTime();
  return Math.round(((now.getTime() - start) / (end - start)) * 100);
}

export function formatAmount(amount: number) {
  return amount.toLocaleString("ar-SA-u-nu-latn", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function calcStreak(dates: string[]): number {
  if (!dates.length) return 0;
  const sorted = [...new Set(dates)].sort().reverse();
  const todayStr = today();
  let streak = 0;
  let current = new Date(todayStr);

  for (let i = 0; i < 365; i++) {
    const dateStr = current.toISOString().split("T")[0];
    if (sorted.includes(dateStr)) {
      streak++;
      current.setDate(current.getDate() - 1);
    } else if (i === 0) {
      // today not logged yet, check yesterday
      current.setDate(current.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export function getJournalStreak(entries: JournalEntry[]): number {
  return calcStreak(entries.map((e) => e.date));
}

export function getReadingStreak(logs: ReadingLog[]): number {
  return calcStreak(logs.map((l) => l.date));
}

export function getFinanceStreak(transactions: Transaction[]): number {
  return calcStreak(transactions.map((t) => t.date));
}

export function getDailyCompletionDates(
  journalEntries: JournalEntry[],
  readingLogs: ReadingLog[],
  transactions: Transaction[]
): string[] {
  const jDates = new Set(journalEntries.map((e) => e.date));
  const rDates = new Set(readingLogs.map((l) => l.date));
  const fDates = new Set(transactions.map((t) => t.date));

  const allDates = new Set([...jDates, ...rDates, ...fDates]);
  return [...allDates].filter((d) => jDates.has(d) && rDates.has(d) && fDates.has(d));
}

export function getMonthDates(year: number, month: number): string[] {
  const dates: string[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    dates.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// ===================== Prayers =====================

export function getPrayerLog(logs: PrayerLog[], date: string): PrayerLog | undefined {
  return logs.find((l) => l.date === date);
}

// Counts for a single day: how many of the 5 prayers were prayed at all,
// and how many of those were prayed in congregation (at the mosque).
export function countDayPrayers(log: PrayerLog | undefined): { prayed: number; mosque: number } {
  if (!log) return { prayed: 0, mosque: 0 };
  let prayed = 0;
  let mosque = 0;
  for (const p of PRAYERS) {
    const status = log.prayers[p];
    if (status === "منفردة" || status === "جماعة") prayed++;
    if (status === "جماعة") mosque++;
  }
  return { prayed, mosque };
}

// Consecutive-day streak of days where all 5 prayers were performed
// (in the mosque or alone — either counts).
export function getPrayerStreak(logs: PrayerLog[]): number {
  const fullDays = logs
    .filter((l) => PRAYERS.every((p) => l.prayers[p] === "منفردة" || l.prayers[p] === "جماعة"))
    .map((l) => l.date);
  return calcStreak(fullDays);
}

// Consecutive-day streak of days where all 5 prayers were performed at the mosque.
export function getMosqueStreak(logs: PrayerLog[]): number {
  const fullMosqueDays = logs
    .filter((l) => PRAYERS.every((p) => l.prayers[p] === "جماعة"))
    .map((l) => l.date);
  return calcStreak(fullMosqueDays);
}

// Per-prayer completion rate (0-1) across all logged days — used to find
// which of the five prayers a person is most/least consistent with.
export function prayerConsistency(logs: PrayerLog[]): Record<PrayerName, number> {
  const result = {} as Record<PrayerName, number>;
  const total = logs.length || 1;
  for (const p of PRAYERS) {
    const done = logs.filter((l) => l.prayers[p] === "منفردة" || l.prayers[p] === "جماعة").length;
    result[p] = done / total;
  }
  return result;
}

export function arabicMonthName(month: number): string {
  const months = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
  ];
  return months[month];
}
