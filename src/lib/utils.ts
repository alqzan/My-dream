import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { JournalEntry, ReadingLog, Transaction, PrayerLog, PrayerName, RecurringTransaction, FinanceCategoryDef, ReserveFund } from "./types";
import { PRAYERS, UNKNOWN_CATEGORY } from "./types";

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

// Numeric Hijri (Umm al-Qura) day-of-month for a date — used by the
// calendars to print the Hijri day beside the Gregorian one in each cell.
const hijriDayFmt =
  typeof Intl !== "undefined"
    ? new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric" })
    : null;

export function hijriDay(dateStr: string): string {
  try {
    return hijriDayFmt?.format(new Date(dateStr)) ?? "";
  } catch {
    return "";
  }
}

// Hijri month(s) label for a whole Gregorian month, e.g. "محرم – صفر 1447 هـ".
// A Gregorian month always spans one or two Hijri months.
export function hijriMonthLabel(year: number, month: number): string {
  try {
    const fmtMonth = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { month: "long" });
    const fmtYear = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { year: "numeric" });
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const m1 = fmtMonth.format(first);
    const m2 = fmtMonth.format(last);
    const y2 = fmtYear.format(last).replace(/هـ/g, "").trim();
    return (m1 === m2 ? m1 : `${m1} – ${m2}`) + ` ${y2} هـ`;
  } catch {
    return "";
  }
}

// ===================== Sun times (auto theme) =====================

// NOAA-simplified sunrise/sunset for a date + location. Accurate to a couple
// of minutes — plenty for flipping the app theme at المغرب and الصباح.
// Returns null in polar edge cases (sun never rises/sets).
export function sunTimes(date: Date, lat: number, lng: number): { sunrise: Date; sunset: Date } | null {
  const rad = Math.PI / 180;
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  );
  // Fractional year (radians)
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (date.getHours() - 12) / 24);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  // Zenith 90.833° accounts for refraction + solar disc radius
  const cosHA =
    (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) /
    (Math.cos(lat * rad) * Math.cos(decl));
  if (cosHA < -1 || cosHA > 1) return null;
  const ha = Math.acos(cosHA) / rad; // degrees
  const utcNoonMin = 720 - 4 * lng - eqTime; // minutes from UTC midnight
  const sunriseUTC = utcNoonMin - 4 * ha;
  const sunsetUTC = utcNoonMin + 4 * ha;
  const dayStartUTC = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return {
    sunrise: new Date(dayStartUTC + sunriseUTC * 60000),
    sunset: new Date(dayStartUTC + sunsetUTC * 60000),
  };
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

export function getCategoryInfo(categories: FinanceCategoryDef[], id: string): FinanceCategoryDef {
  return categories.find((c) => c.id === id) ?? UNKNOWN_CATEGORY;
}

// Resolve a (possibly sub-) category to its main category — totals, budgets
// and charts aggregate at the main level; subs are the drill-down detail.
export function getMainCategory(categories: FinanceCategoryDef[], id: string): FinanceCategoryDef {
  const cat = categories.find((c) => c.id === id);
  if (!cat) return UNKNOWN_CATEGORY;
  if (!cat.parentId) return cat;
  return categories.find((c) => c.id === cat.parentId) ?? cat;
}

export function getSubCategories(categories: FinanceCategoryDef[], mainId: string): FinanceCategoryDef[] {
  return categories.filter((c) => c.parentId === mainId);
}

// ===================== Reserve funds & split spending =====================

// Share of a transaction charged to the daily budget (the remainder after
// any reserve splits). A transaction with no splits is 100% daily.
export function dailyShare(t: Transaction): number {
  if (!t.reserveSplits?.length) return t.amount;
  const reservedPct = Math.min(100, t.reserveSplits.reduce((s, sp) => s + sp.pct, 0));
  return (t.amount * (100 - reservedPct)) / 100;
}

// Share of a transaction charged to one specific reserve fund.
export function reserveShare(t: Transaction, fundId: string): number {
  const split = t.reserveSplits?.find((s) => s.fundId === fundId);
  return split ? (t.amount * split.pct) / 100 : 0;
}

// Live balance of a fund: deposits in, charged transaction shares out.
export function reserveBalance(fund: ReserveFund, transactions: Transaction[]): number {
  const deposited = fund.deposits.reduce((s, d) => s + d.amount, 0);
  const spent = transactions.reduce((s, t) => s + reserveShare(t, fund.id), 0);
  return deposited - spent;
}

// Total spent from a fund (for progress displays).
export function reserveSpent(fund: ReserveFund, transactions: Transaction[]): number {
  return transactions.reduce((s, t) => s + reserveShare(t, fund.id), 0);
}

export interface DailyBudgetStatus {
  days: number; // days since (and including) startDate, through today
  allowance: number; // amount * days
  spent: number; // sum of non-big transactions since startDate
  balance: number; // allowance - spent (negative = over)
}

// Cumulative daily allowance: every day since `startDate` contributes
// `amount`, and every (non-"big") transaction since then eats into the
// running total — a surplus day cushions a rough one later on. Only the
// daily-budget share counts: a portion split onto a reserve fund is that
// fund's business, not the daily allowance's.
export function computeDailyBudgetStatus(
  dailyBudget: { amount: number; startDate: string },
  transactions: Transaction[]
): DailyBudgetStatus {
  const todayStr = today();
  const days = Math.max(
    1,
    Math.round((new Date(todayStr).getTime() - new Date(dailyBudget.startDate).getTime()) / (24 * 3600 * 1000)) + 1
  );
  const allowance = dailyBudget.amount * days;
  const spent = transactions
    .filter((t) => !t.big && t.date >= dailyBudget.startDate && t.date <= todayStr)
    .reduce((s, t) => s + dailyShare(t), 0);
  return { days, allowance, spent, balance: allowance - spent };
}

// Compute the most recent date this recurring item was/is due, on or before
// `now`. The interval's phase is anchored to `anchorDate` so "every N months/
// weeks" (not just a fixed 1/12) lines up on a consistent cadence.
export function mostRecentDueDate(r: RecurringTransaction, now: Date): Date {
  const every = Math.max(1, Math.floor(r.every) || 1);
  const anchor = new Date(r.anchorDate || today());

  if (r.unit === "أسبوعي") {
    // dayOfMonth reused as weekday 0-6
    const target = ((r.dayOfMonth % 7) + 7) % 7;
    const due = new Date(now);
    due.setDate(now.getDate() - ((now.getDay() - target + 7) % 7));

    const anchorDue = new Date(anchor);
    anchorDue.setDate(anchor.getDate() - ((anchor.getDay() - target + 7) % 7));

    const weeksBetween = Math.round((due.getTime() - anchorDue.getTime()) / (7 * 24 * 3600 * 1000));
    const remainder = ((weeksBetween % every) + every) % every;
    if (remainder !== 0) due.setDate(due.getDate() - remainder * 7);
    return due < anchorDue ? anchorDue : due;
  }

  // شهري (and anything else) — monthly-based cadence
  const day = Math.min(Math.max(r.dayOfMonth, 1), 28);
  const anchorMonthIndex = anchor.getFullYear() * 12 + anchor.getMonth();
  const nowMonthIndex = now.getFullYear() * 12 + now.getMonth();
  let k = Math.floor((nowMonthIndex - anchorMonthIndex) / every);
  let dueMonthIndex = anchorMonthIndex + k * every;
  let due = new Date(Math.floor(dueMonthIndex / 12), ((dueMonthIndex % 12) + 12) % 12, day);
  if (due > now) {
    k -= 1;
    dueMonthIndex = anchorMonthIndex + k * every;
    due = new Date(Math.floor(dueMonthIndex / 12), ((dueMonthIndex % 12) + 12) % 12, day);
  }
  return due < anchor ? new Date(anchor.getFullYear(), anchor.getMonth(), day) : due;
}

// The next occurrence strictly after `now` — one interval past the most
// recent due date.
export function nextDueDate(r: RecurringTransaction, now: Date): Date {
  const recent = mostRecentDueDate(r, now);
  const every = Math.max(1, Math.floor(r.every) || 1);
  if (r.unit === "أسبوعي") {
    const next = new Date(recent);
    next.setDate(recent.getDate() + every * 7);
    return next;
  }
  const monthIndex = recent.getFullYear() * 12 + recent.getMonth() + every;
  return new Date(Math.floor(monthIndex / 12), ((monthIndex % 12) + 12) % 12, recent.getDate());
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
