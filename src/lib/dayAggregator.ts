import type { Transaction, JournalEntry, ReadingLog, Book, Habit, PrayerLog } from "./types";
import { countDayPrayers } from "./utils";

export interface DaySummary {
  date: string;
  // كل مذكرات هذا اليوم — قد يكون فيها أكثر من مذكرة واحدة.
  journalEntries: JournalEntry[];
  transactions: Transaction[];
  expense: number;
  readingLogs: { log: ReadingLog; book?: Book }[];
  pagesRead: number;
  habitsCompleted: { name: string; icon: string }[];
  completionScore: number; // 0-2 (مذكرة + قراءة)
  prayerLog?: PrayerLog;
  prayersCount: number; // 0-5
  mosqueCount: number; // 0-5
}

export function aggregateDay(
  date: string,
  data: {
    transactions: Transaction[];
    journalEntries: JournalEntry[];
    readingLogs: ReadingLog[];
    books: Book[];
    habits: Habit[];
    prayerLogs: PrayerLog[];
  }
): DaySummary {
  const journalEntries = data.journalEntries.filter((e) => e.date === date);
  const transactions = data.transactions.filter((t) => t.date === date);
  const expense = transactions.reduce((s, t) => s + t.amount, 0);

  const dayLogs = data.readingLogs.filter((l) => l.date === date);
  const readingLogs = dayLogs.map((log) => ({
    log,
    book: data.books.find((b) => b.id === log.bookId),
  }));
  const pagesRead = dayLogs.reduce((s, l) => s + l.pagesRead, 0);

  const habitsCompleted = data.habits
    .filter((h) => h.logs.includes(date))
    .map((h) => ({ name: h.name, icon: h.icon }));

  const hasJournal = journalEntries.length > 0;
  const hasReading = dayLogs.length > 0;
  // السلسلة تحسب المذكرة والقراءة فقط — المالية خارجها.
  const completionScore = [hasJournal, hasReading].filter(Boolean).length;

  const prayerLog = data.prayerLogs.find((l) => l.date === date);
  const { prayed: prayersCount, mosque: mosqueCount } = countDayPrayers(prayerLog);

  return {
    date,
    journalEntries,
    transactions,
    expense,
    readingLogs,
    pagesRead,
    habitsCompleted,
    completionScore,
    prayerLog,
    prayersCount,
    mosqueCount,
  };
}
