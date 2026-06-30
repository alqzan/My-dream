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

export function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDateShort(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ar-SA", { month: "short", day: "numeric" });
}

export function formatAmount(amount: number) {
  return amount.toLocaleString("ar-SA", {
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

export function arabicMonthName(month: number): string {
  const months = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
  ];
  return months[month];
}
