import type { Transaction, JournalEntry, ReadingLog, Book, Habit, PrayerLog } from "./types";
import { countDayPrayers } from "./utils";

export interface DaySummary {
  date: string;
  journal?: JournalEntry;
  transactions: Transaction[];
  expense: number;
  readingLogs: { log: ReadingLog; book?: Book }[];
  pagesRead: number;
  habitsCompleted: { name: string; icon: string }[];
  mood?: JournalEntry["mood"];
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
  const journal = data.journalEntries.find((e) => e.date === date);
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

  const hasJournal = !!journal;
  const hasReading = dayLogs.length > 0;
  // السلسلة تحسب المذكرة والقراءة فقط — المالية خارجها.
  const completionScore = [hasJournal, hasReading].filter(Boolean).length;

  const prayerLog = data.prayerLogs.find((l) => l.date === date);
  const { prayed: prayersCount, mosque: mosqueCount } = countDayPrayers(prayerLog);

  return {
    date,
    journal,
    transactions,
    expense,
    readingLogs,
    pagesRead,
    habitsCompleted,
    mood: journal?.mood,
    completionScore,
    prayerLog,
    prayersCount,
    mosqueCount,
  };
}
