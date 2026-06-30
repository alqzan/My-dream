import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AppData, Transaction, Book, ReadingLog, JournalEntry, Habit,
  RecurringTransaction, Budget, FinanceCategory,
} from "./types";
import { uid, today } from "./utils";

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

  // Recurring
  addRecurring: (r: RecurringTransaction) => void;
  updateRecurring: (id: string, updates: Partial<RecurringTransaction>) => void;
  deleteRecurring: (id: string) => void;
  runRecurring: () => number; // returns count of generated transactions

  // Budgets
  setBudget: (category: FinanceCategory, limit: number) => void;
  removeBudget: (category: FinanceCategory) => void;

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

  // Cloud sync
  hydrate: (data: Partial<AppData>) => void;
  snapshot: () => AppData;

  // Theme (device-local)
  theme: "light" | "dark";
  toggleTheme: () => void;
}

// Compute the most recent date this recurring item was/is due, on or before `now`.
function mostRecentDueDate(r: RecurringTransaction, now: Date): Date | null {
  const d = new Date(now);
  if (r.frequency === "شهري") {
    const day = Math.min(Math.max(r.dayOfMonth, 1), 28);
    let due = new Date(d.getFullYear(), d.getMonth(), day);
    if (due > d) due = new Date(d.getFullYear(), d.getMonth() - 1, day);
    return due;
  }
  if (r.frequency === "أسبوعي") {
    // dayOfMonth reused as weekday 0-6
    const target = ((r.dayOfMonth % 7) + 7) % 7;
    const due = new Date(d);
    const diff = (d.getDay() - target + 7) % 7;
    due.setDate(d.getDate() - diff);
    return due;
  }
  if (r.frequency === "سنوي") {
    let due = new Date(d.getFullYear(), 0, 1);
    due.setMonth(0);
    due.setDate(Math.min(Math.max(r.dayOfMonth, 1), 28));
    if (due > d) due = new Date(d.getFullYear() - 1, 0, Math.min(Math.max(r.dayOfMonth, 1), 28));
    return due;
  }
  return null;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      transactions: [],
      books: [],
      readingLogs: [],
      journalEntries: [],
      habits: [
        { id: "h1", name: "رياضة", icon: "🏃", color: "#3d9640", logs: [] },
        { id: "h2", name: "قرآن", icon: "📖", color: "#7c6fcd", logs: [] },
        { id: "h3", name: "قراءة", icon: "📚", color: "#e07b39", logs: [] },
      ],
      recurring: [],
      budgets: [],
      theme: "light",
      lastUpdated: new Date().toISOString(),

      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),

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

      addRecurring: (r) =>
        set((s) => ({ recurring: [...s.recurring, r] })),

      updateRecurring: (id, updates) =>
        set((s) => ({
          recurring: s.recurring.map((r) =>
            r.id === id ? { ...r, ...updates } : r
          ),
        })),

      deleteRecurring: (id) =>
        set((s) => ({ recurring: s.recurring.filter((r) => r.id !== id) })),

      runRecurring: () => {
        let generated = 0;
        set((s) => {
          const todayStr = today();
          const now = new Date(todayStr);
          const newTx: Transaction[] = [];
          const updatedRecurring = s.recurring.map((r) => {
            if (!r.active) return r;
            // Determine the most recent due date on/before today
            const due = mostRecentDueDate(r, now);
            if (!due) return r;
            const dueStr = due.toISOString().split("T")[0];
            // Already generated for this period?
            if (r.lastGenerated && r.lastGenerated >= dueStr) return r;
            newTx.push({
              id: uid(),
              date: dueStr,
              amount: r.amount,
              type: r.type,
              category: r.category,
              note: r.note ? `${r.note} (تلقائي)` : "معاملة متكررة",
            });
            generated++;
            return { ...r, lastGenerated: dueStr };
          });
          if (!newTx.length) return {};
          return {
            transactions: [...newTx, ...s.transactions],
            recurring: updatedRecurring,
          };
        });
        return generated;
      },

      setBudget: (category, limit) =>
        set((s) => {
          const existing = s.budgets.find((b) => b.category === category);
          if (existing) {
            return {
              budgets: s.budgets.map((b) =>
                b.category === category ? { ...b, limit } : b
              ),
            };
          }
          return { budgets: [...s.budgets, { category, limit }] };
        }),

      removeBudget: (category) =>
        set((s) => ({
          budgets: s.budgets.filter((b) => b.category !== category),
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

      hydrate: (data) =>
        set(() => ({
          transactions: data.transactions ?? [],
          books: data.books ?? [],
          readingLogs: data.readingLogs ?? [],
          journalEntries: data.journalEntries ?? [],
          habits: data.habits ?? [],
          recurring: data.recurring ?? [],
          budgets: data.budgets ?? [],
          lastUpdated: data.lastUpdated ?? new Date().toISOString(),
        })),

      snapshot: () => {
        const s = get();
        return {
          transactions: s.transactions,
          books: s.books,
          readingLogs: s.readingLogs,
          journalEntries: s.journalEntries,
          habits: s.habits,
          recurring: s.recurring,
          budgets: s.budgets,
          lastUpdated: s.lastUpdated,
        };
      },
    }),
    {
      name: "my-dream-store",
      version: 1,
      migrate: (persisted: unknown) => {
        const state = (persisted ?? {}) as Partial<AppData>;
        return {
          ...state,
          recurring: state.recurring ?? [],
          budgets: state.budgets ?? [],
        } as AppData;
      },
    }
  )
);
