import type { Transaction, JournalEntry, ReadingLog, Book, Habit } from "./types";

export interface DaySummary {
  date: string;
  journal?: JournalEntry;
  transactions: Transaction[];
  income: number;
  expense: number;
  readingLogs: { log: ReadingLog; book?: Book }[];
  pagesRead: number;
  habitsCompleted: { name: string; icon: string }[];
  mood?: JournalEntry["mood"];
  completionScore: number; // 0-3
}

export function aggregateDay(
  date: string,
  data: {
    transactions: Transaction[];
    journalEntries: JournalEntry[];
    readingLogs: ReadingLog[];
    books: Book[];
    habits: Habit[];
  }
): DaySummary {
  const journal = data.journalEntries.find((e) => e.date === date);
  const transactions = data.transactions.filter((t) => t.date === date);
  const income = transactions.filter((t) => t.type === "دخل").reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter((t) => t.type === "مصروف").reduce((s, t) => s + t.amount, 0);

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
  const hasFinance = transactions.length > 0;
  const hasReading = dayLogs.length > 0;
  const completionScore = [hasJournal, hasFinance, hasReading].filter(Boolean).length;

  return {
    date,
    journal,
    transactions,
    income,
    expense,
    readingLogs,
    pagesRead,
    habitsCompleted,
    mood: journal?.mood,
    completionScore,
  };
}
