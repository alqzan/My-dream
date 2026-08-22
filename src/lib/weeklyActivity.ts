import type { Habit, JournalEntry, PrayerLog, ReadingLog, Transaction } from "./types";
import { cashOut, countDayPrayers, toDateStr } from "./utils";

export interface WeeklyActivityInput {
  transactions: Transaction[];
  journalEntries: JournalEntry[];
  readingLogs: ReadingLog[];
  prayerLogs: PrayerLog[];
  habits: Habit[];
  frozenHabits?: string[];
  quranActivity: Iterable<string>;
}

export interface WeeklyActivitySummary {
  week: string[];
  journalDays: number;
  readingDays: number;
  pagesRead: number;
  quranDays: number;
  prayerCount: number;
  prayerDays: number;
  habitCompletions: number;
  habitDays: number;
  spent: number;
  activeDates: string[];
  activeDays: number;
}

/** الأيام السبعة الأخيرة، مرتبة من الأقدم إلى الأحدث حتى يطابقها شريط النشاط. */
export function weeklyDates(now = new Date()): string[] {
  const dates: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    dates.push(toDateStr(date));
  }
  return dates;
}

/**
 * يجمع كل ما له أثر يومي في مكان واحد. أي عادة جديدة تُضاف إلى `habits`
 * وتُسجّل في `logs` تدخل هنا تلقائياً، فلا يحتاج الملخص إلى تعديل جديد.
 */
export function summarizeWeeklyActivity(
  input: WeeklyActivityInput,
  now = new Date()
): WeeklyActivitySummary {
  const week = weeklyDates(now);
  const weekSet = new Set(week);
  const journalDates = new Set(
    input.journalEntries.filter((entry) => weekSet.has(entry.date)).map((entry) => entry.date)
  );
  const readingLogs = input.readingLogs.filter((log) => weekSet.has(log.date));
  const readingDates = new Set(readingLogs.map((log) => log.date));
  const quranDates = new Set([...input.quranActivity].filter((date) => weekSet.has(date)));
  const prayerByDate = new Map(input.prayerLogs.map((log) => [log.date, log]));
  const prayerDates = new Set<string>();
  let prayerCount = 0;

  for (const date of week) {
    const prayed = countDayPrayers(prayerByDate.get(date)).prayed;
    if (prayed > 0) prayerDates.add(date);
    prayerCount += prayed;
  }

  const frozen = new Set(input.frozenHabits ?? []);
  const habitDates = new Set<string>();
  let habitCompletions = 0;
  for (const habit of input.habits) {
    if (frozen.has(habit.id)) continue;
    const loggedDates = new Set(habit.logs);
    for (const date of loggedDates) {
      if (!weekSet.has(date)) continue;
      habitDates.add(date);
      habitCompletions += 1;
    }
  }

  const transactionDates = new Set(
    input.transactions.filter((transaction) => weekSet.has(transaction.date)).map((transaction) => transaction.date)
  );
  const spent = input.transactions
    .filter((transaction) => weekSet.has(transaction.date))
    .reduce((sum, transaction) => sum + cashOut(transaction), 0);
  const activeDates = new Set([
    ...journalDates,
    ...readingDates,
    ...quranDates,
    ...prayerDates,
    ...habitDates,
    ...transactionDates,
  ]);

  return {
    week,
    journalDays: journalDates.size,
    readingDays: readingDates.size,
    pagesRead: readingLogs.reduce((sum, log) => sum + log.pagesRead, 0),
    quranDays: quranDates.size,
    prayerCount,
    prayerDays: prayerDates.size,
    habitCompletions,
    habitDays: habitDates.size,
    spent,
    activeDates: week.filter((date) => activeDates.has(date)),
    activeDays: activeDates.size,
  };
}
