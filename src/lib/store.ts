import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AppData, Transaction, Book, ReadingLog, JournalEntry, Habit,
  RecurringTransaction, Budget, FinanceCategory, PrayerName, PrayerStatus,
} from "./types";
import { CATEGORY_LABELS } from "./types";
import { uid, today, mostRecentDueDate } from "./utils";
import { idbStorage } from "./idbStorage";

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

  // Prayers
  setPrayerStatus: (date: string, prayer: PrayerName, status: PrayerStatus) => void;
  cyclePrayerStatus: (date: string, prayer: PrayerName) => void;

  // Cloud sync
  hydrate: (data: Partial<AppData>) => void;
  snapshot: () => AppData;

  // Theme (device-local)
  theme: "light" | "dark";
  toggleTheme: () => void;
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
      prayerLogs: [],
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
            const dueStr = due.toISOString().split("T")[0];
            // Already generated for this period?
            if (r.lastGenerated && r.lastGenerated >= dueStr) return r;
            newTx.push({
              id: uid(),
              date: dueStr,
              amount: r.amount,
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

      setPrayerStatus: (date, prayer, status) =>
        set((s) => {
          const existing = s.prayerLogs.find((l) => l.date === date);
          if (existing) {
            return {
              prayerLogs: s.prayerLogs.map((l) =>
                l.date === date ? { ...l, prayers: { ...l.prayers, [prayer]: status } } : l
              ),
            };
          }
          return { prayerLogs: [...s.prayerLogs, { date, prayers: { [prayer]: status } }] };
        }),

      cyclePrayerStatus: (date, prayer) =>
        set((s) => {
          const order: PrayerStatus[] = ["لم", "منفردة", "جماعة"];
          const existing = s.prayerLogs.find((l) => l.date === date);
          const current = existing?.prayers[prayer] ?? "لم";
          const next = order[(order.indexOf(current) + 1) % order.length];
          if (existing) {
            return {
              prayerLogs: s.prayerLogs.map((l) =>
                l.date === date ? { ...l, prayers: { ...l.prayers, [prayer]: next } } : l
              ),
            };
          }
          return { prayerLogs: [...s.prayerLogs, { date, prayers: { [prayer]: next } }] };
        }),

      hydrate: (data) =>
        set(() => ({
          transactions: data.transactions ?? [],
          books: data.books ?? [],
          readingLogs: data.readingLogs ?? [],
          journalEntries: data.journalEntries ?? [],
          habits: data.habits ?? [],
          recurring: data.recurring ?? [],
          budgets: data.budgets ?? [],
          prayerLogs: data.prayerLogs ?? [],
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
          prayerLogs: s.prayerLogs,
          lastUpdated: s.lastUpdated,
        };
      },
    }),
    {
      name: "my-dream-store",
      version: 2,
      storage: createJSONStorage(() => idbStorage),
      // v2 drops income entirely (finance is expense/budget-only now) and
      // replaces the fixed شهري/أسبوعي/سنوي frequency with a flexible
      // (unit, every) interval — this migration transforms any v1 data.
      migrate: (persisted: unknown) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        const validCategories = new Set(Object.keys(CATEGORY_LABELS));
        const todayStr = today();

        const transactions = ((state.transactions as Record<string, unknown>[]) ?? [])
          .filter((t) => t.type !== "دخل" && validCategories.has(t.category as string))
          .map((t) => ({
            id: t.id, date: t.date, amount: t.amount,
            category: t.category, note: t.note, linkedJournalId: t.linkedJournalId,
          })) as Transaction[];

        const recurring = ((state.recurring as Record<string, unknown>[]) ?? [])
          .filter((r) => r.type !== "دخل" && validCategories.has(r.category as string))
          .map((r) => {
            if (r.unit && typeof r.every === "number") return r as unknown as RecurringTransaction;
            let unit: RecurringTransaction["unit"] = "شهري";
            let every = 1;
            if (r.frequency === "أسبوعي") { unit = "أسبوعي"; every = 1; }
            else if (r.frequency === "سنوي") { unit = "شهري"; every = 12; }
            return {
              id: r.id, amount: r.amount, category: r.category, note: r.note,
              unit, every, dayOfMonth: (r.dayOfMonth as number) ?? 1,
              anchorDate: (r.lastGenerated as string) ?? todayStr,
              active: r.active, lastGenerated: r.lastGenerated,
            } as RecurringTransaction;
          });

        const budgets = ((state.budgets as Record<string, unknown>[]) ?? [])
          .filter((b) => validCategories.has(b.category as string)) as unknown as Budget[];

        return {
          ...state,
          transactions,
          recurring,
          budgets,
          prayerLogs: state.prayerLogs ?? [],
        } as AppData;
      },
    }
  )
);
