import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppData, Transaction, Book, ReadingLog, JournalEntry, Habit } from "./types";

interface AppStore extends AppData {
  // Journal
  addJournalEntry: (entry: JournalEntry) => void;
  updateJournalEntry: (id: string, updates: Partial<JournalEntry>) => void;
  deleteJournalEntry: (id: string) => void;
  importDayOneEntries: (entries: JournalEntry[]) => void;

  // Finance
  addTransaction: (tx: Transaction) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;

  // Reading
  addBook: (book: Book) => void;
  updateBook: (id: string, updates: Partial<Book>) => void;
  deleteBook: (id: string) => void;
  addReadingLog: (log: ReadingLog) => void;
  deleteReadingLog: (id: string) => void;

  // Habits
  addHabit: (habit: Habit) => void;
  toggleHabitLog: (habitId: string, date: string) => void;
  deleteHabit: (id: string) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      transactions: [],
      books: [],
      readingLogs: [],
      journalEntries: [],
      habits: [
        { id: "h1", name: "رياضة", icon: "🏃", color: "#3d9640", logs: [] },
        { id: "h2", name: "قرآن", icon: "📖", color: "#7c6fcd", logs: [] },
        { id: "h3", name: "قراءة", icon: "📚", color: "#e07b39", logs: [] },
      ],
      lastUpdated: new Date().toISOString(),

      addJournalEntry: (entry) =>
        set((s) => ({ journalEntries: [entry, ...s.journalEntries] })),

      updateJournalEntry: (id, updates) =>
        set((s) => ({
          journalEntries: s.journalEntries.map((e) =>
            e.id === id ? { ...e, ...updates } : e
          ),
        })),

      deleteJournalEntry: (id) =>
        set((s) => ({
          journalEntries: s.journalEntries.filter((e) => e.id !== id),
        })),

      importDayOneEntries: (entries) =>
        set((s) => {
          const existingIds = new Set(s.journalEntries.map((e) => e.dayOneUUID).filter(Boolean));
          const newEntries = entries.filter(
            (e) => !e.dayOneUUID || !existingIds.has(e.dayOneUUID)
          );
          return { journalEntries: [...newEntries, ...s.journalEntries] };
        }),

      addTransaction: (tx) =>
        set((s) => ({ transactions: [tx, ...s.transactions] })),

      updateTransaction: (id, updates) =>
        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        })),

      deleteTransaction: (id) =>
        set((s) => ({
          transactions: s.transactions.filter((t) => t.id !== id),
        })),

      addBook: (book) =>
        set((s) => ({ books: [book, ...s.books] })),

      updateBook: (id, updates) =>
        set((s) => ({
          books: s.books.map((b) => (b.id === id ? { ...b, ...updates } : b)),
        })),

      deleteBook: (id) =>
        set((s) => ({ books: s.books.filter((b) => b.id !== id) })),

      addReadingLog: (log) =>
        set((s) => ({ readingLogs: [log, ...s.readingLogs] })),

      deleteReadingLog: (id) =>
        set((s) => ({ readingLogs: s.readingLogs.filter((l) => l.id !== id) })),

      addHabit: (habit) =>
        set((s) => ({ habits: [...s.habits, habit] })),

      toggleHabitLog: (habitId, date) =>
        set((s) => ({
          habits: s.habits.map((h) => {
            if (h.id !== habitId) return h;
            const logs = h.logs.includes(date)
              ? h.logs.filter((d) => d !== date)
              : [...h.logs, date];
            return { ...h, logs };
          }),
        })),

      deleteHabit: (id) =>
        set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),
    }),
    { name: "my-dream-store" }
  )
);
