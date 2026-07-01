import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { JournalEntry, ReadingLog, Transaction } from "./types";

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

// Hijri (Umm al-Qura) date, e.g. "١٥ محرم ١٤٤٨ هـ".
export function hijriDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const formatted = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
    // Some environments already append the هـ era marker — don't double it.
    return formatted.includes("هـ") ? formatted : formatted + " هـ";
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

// Longest run of consecutive days in the given dates (all-time best).
export function longestStreak(dates: string[]): number {
  if (!dates.length) return 0;
  const sorted = [...new Set(dates)].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    prev.setDate(prev.getDate() + 1);
    if (prev.toISOString().split("T")[0] === sorted[i]) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
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

export function arabicMonthName(month: number): string {
  const months = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
  ];
  return months[month];
}
