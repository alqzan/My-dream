import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AppData, Transaction, Book, ReadingLog, JournalEntry, Habit,
  RecurringTransaction, Budget, FinanceCategoryDef, PrayerName, PrayerStatus, DailyBudget,
  ReserveFund, ReserveDeposit, FutureLetter,
} from "./types";
import { DEFAULT_CATEGORIES, SURPLUS_FUND_NAME } from "./types";
import { uid, today, toDateStr, parseDate, mostRecentDueDate, computeDailyBudgetStatus, dailyShare, round2 } from "./utils";
import { normalizeMerchant } from "./bankParser";
import { idbStorage } from "./idbStorage";

// Id-keyed collections whose deletions must be tombstoned (see the `set`
// wrapper) so cloud sync can't resurrect a removed item from another device.
const ID_COLLECTIONS = [
  "transactions", "books", "readingLogs", "journalEntries",
  "recurring", "reserves", "habits", "futureLetters", "categories",
] as const;

interface AppStore extends AppData {
  // Journal
  addJournalEntry: (entry: JournalEntry) => void;
  updateJournalEntry: (id: string, updates: Partial<JournalEntry>) => void;
  deleteJournalEntry: (id: string) => void;
  importDayOneEntries: (entries: JournalEntry[]) => number; // returns count actually added
  deleteDayOneImports: () => number; // يحذف كل المذكرات المستوردة من Day One؛ يرجع العدد

  // Finance
  addTransaction: (tx: Transaction) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;

  // Recurring
  addRecurring: (r: RecurringTransaction) => void;
  updateRecurring: (id: string, updates: Partial<RecurringTransaction>) => void;
  deleteRecurring: (id: string) => void;
  runRecurring: () => number; // returns count of generated transactions

  // Budgets — a fixed limit OR a % of monthly income
  setBudget: (category: string, cap: { limit?: number; pct?: number }) => void;
  removeBudget: (category: string) => void;
  setMonthlyIncome: (amount: number | null) => void;

  // Categories (user-managed, like habits)
  addCategory: (def: FinanceCategoryDef) => void;
  updateCategory: (id: string, updates: Partial<FinanceCategoryDef>) => void;
  deleteCategory: (id: string) => void;
  moveCategory: (id: string, dir: -1 | 1) => void; // reorder within its siblings
  rememberMerchant: (note: string, categoryId: string) => void; // learn a rule

  // Reserve funds (الاحتياطي)
  addReserve: (fund: ReserveFund) => void;
  updateReserve: (id: string, updates: Partial<ReserveFund>) => void;
  deleteReserve: (id: string) => void;
  addReserveDeposit: (fundId: string, deposit: ReserveDeposit) => void;
  deleteReserveDeposit: (fundId: string, depositId: string) => void;

  // Daily cumulative budget — `source` marks an income-percentage-derived
  // amount (نسبة من الدخل الشهري) so the editor can reopen in that mode.
  setDailyBudget: (amount: number, source?: { monthlyIncome: number; incomePct: number }) => void;
  removeDailyBudget: () => void;

  // دورة الراتب: يوم النزول + تحويل باقي الميزانية اليومية إلى «الفوائض»
  setSalaryDay: (day: number) => void;
  confirmSalary: () => number; // ينقل الفائض لصندوق الفوائض ويصفّر العداد؛ يرجع المبلغ
  // نقل مبلغ من فائض الميزانية اليومية إلى احتياطي محدد (ويصفّر عداد اليومية)
  sweepToReserve: (fundId: string, amount: number, note?: string) => void;

  // رسائل لنفسك المستقبلية
  addFutureLetter: (letter: FutureLetter) => void;
  openFutureLetter: (id: string) => void;
  deleteFutureLetter: (id: string) => void;

  // هدف القراءة السنوي (عدد كتب) — null يعني بلا هدف
  setReadingGoal: (goal: number | null) => void;

  // Reading
  addBook: (book: Book) => void;
  updateBook: (id: string, updates: Partial<Book>) => void;
  deleteBook: (id: string) => void;
  addReadingLog: (log: ReadingLog) => void;
  updateReadingLog: (id: string, updates: Partial<ReadingLog>) => void;
  deleteReadingLog: (id: string) => void;

  // Habits
  addHabit: (habit: Habit) => void;
  updateHabit: (id: string, updates: Partial<Habit>) => void;
  toggleHabitLog: (habitId: string, date: string) => void;
  deleteHabit: (id: string) => void;

  // Prayers
  setPrayerStatus: (date: string, prayer: PrayerName, status: PrayerStatus) => void;
  cyclePrayerStatus: (date: string, prayer: PrayerName) => void;

  // Cloud sync
  hydrate: (data: Partial<AppData>) => void;
  snapshot: () => AppData;

  // Theme (device-local). "auto" follows the sun: dark from المغرب
  // (sunset) until sunrise, light through the day.
  theme: "light" | "dark" | "auto";
  toggleTheme: () => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (rawSet, get) => {
    // Every mutating action goes through this wrapper so `lastUpdated` is
    // stamped on any state change — the cloud-merge heuristic in AuthProvider
    // compares `lastUpdated`, and without this the local value never moved,
    // making a genuinely-newer local edit look older than the cloud (and get
    // discarded). A genuine no-op (an action that returns `{}`, e.g.
    // runRecurring with nothing due — which fires on every app open) is
    // skipped entirely, so merely opening the app doesn't bump the timestamp
    // and cause needless cloud churn. `hydrate` and `toggleTheme` deliberately
    // use `rawSet`: hydrate must keep the cloud's own timestamp, and the theme
    // is a device-local preference that should not trigger a cloud push.
    const set: typeof rawSet = ((partial, replace) => {
      const prev = get();
      const next = typeof partial === "function"
        ? (partial as (s: AppStore) => Partial<AppStore>)(prev)
        : partial;
      if (!next || Object.keys(next).length === 0) return; // real no-op

      // Auto-tombstone: any id-keyed item this change removes is recorded in
      // `deleted` (id → ts). Without this, the cloud union-merge resurrects a
      // deleted entry from any device that still holds a copy — so a delete
      // "came back" after reopening once a second device re-seeded it.
      let removed: Record<string, number> | undefined;
      for (const key of ID_COLLECTIONS) {
        if (!(key in next)) continue;
        const before = prev[key] as { id: string }[] | undefined;
        const after = (next as Record<string, unknown>)[key] as { id: string }[] | undefined;
        if (!Array.isArray(before) || !Array.isArray(after)) continue;
        const afterIds = new Set(after.map((x) => x.id));
        for (const item of before) {
          if (item && !afterIds.has(item.id)) (removed ??= {})[item.id] = Date.now();
        }
      }

      const patch: Record<string, unknown> = { ...next, lastUpdated: new Date().toISOString() };
      if (removed) patch.deleted = { ...prev.deleted, ...removed };
      rawSet(patch as Partial<AppStore>, replace as false);
    }) as typeof rawSet;

    return {
      transactions: [],
      books: [],
      readingLogs: [],
      journalEntries: [],
      habits: [
        { id: "h1", name: "رياضة", icon: "🏃", color: "#3d9640", logs: [] },
        { id: "h2", name: "قرآن", icon: "📖", color: "#7c6fcd", logs: [] },
      ],
      recurring: [],
      budgets: [],
      categories: DEFAULT_CATEGORIES,
      reserves: [],
      prayerLogs: [],
      dailyBudget: null,
      monthlyIncome: null,
      futureLetters: [],
      salaryDay: 27,
      lastSalaryConfirm: null,
      readingGoal: null,
      merchantRules: {},
      deleted: {},
      theme: "auto",
      lastUpdated: new Date().toISOString(),

      // Cycles auto → light → dark → auto. Uses rawSet: the theme is a
      // device-local preference and must not bump lastUpdated / push to cloud.
      toggleTheme: () =>
        rawSet((s) => ({
          theme: s.theme === "auto" ? "light" : s.theme === "light" ? "dark" : "auto",
        })),

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

      importDayOneEntries: (entries) => {
        let touched = 0;
        set((s) => {
          const byUuid = new Map(
            s.journalEntries
              .filter((e) => e.dayOneUUID)
              .map((e) => [e.dayOneUUID as string, e] as const)
          );
          const toAdd: JournalEntry[] = [];
          const patches = new Map<string, Partial<JournalEntry>>();
          for (const e of entries) {
            const existing = e.dayOneUUID ? byUuid.get(e.dayOneUUID) : undefined;
            if (!existing) {
              toAdd.push(e);
              continue;
            }
            // إعادة الاستيراد تُكمّل الوسائط الناقصة لمذكرة موجودة (مثلاً صور
            // سقطت في استيراد سابق قبل دعم HEIC) بدل تخطّيها كمكرر.
            const patch: Partial<JournalEntry> = {};
            if (!(existing.photos?.length || existing.photo) && (e.photos?.length || e.photo)) {
              patch.photos = e.photos;
              patch.photo = e.photo;
            }
            if (!(existing.audios?.length || existing.audio) && (e.audios?.length || e.audio)) {
              patch.audios = e.audios;
              patch.audio = e.audio;
            }
            if (Object.keys(patch).length) patches.set(existing.id, patch);
          }
          touched = toAdd.length + patches.size;
          const updated = s.journalEntries.map((en) =>
            patches.has(en.id) ? { ...en, ...patches.get(en.id) } : en
          );
          return { journalEntries: [...toAdd, ...updated] };
        });
        return touched;
      },

      deleteDayOneImports: () => {
        let removed = 0;
        set((s) => {
          const kept = s.journalEntries.filter((e) => e.source !== "dayOne");
          removed = s.journalEntries.length - kept.length;
          return { journalEntries: kept };
        });
        return removed;
      },

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
          const now = parseDate(today());
          const newTx: Transaction[] = [];
          const updatedRecurring = s.recurring.map((r) => {
            if (!r.active) return r;
            // Backfill every missed occurrence, not just the latest — if the
            // app wasn't opened for two months, both rent payments land.
            // Walk back from the most recent due date until we hit what was
            // already generated (capped so a corrupt anchor can't explode).
            const every = Math.max(1, Math.floor(r.every) || 1);
            const dueDates: string[] = [];
            let due = mostRecentDueDate(r, now);
            // The date-based breaks below (lastGenerated / anchorDate) are the
            // real terminators; the counter is only a runaway guard for a
            // corrupt anchor. 600 covers >10 years of weekly occurrences so a
            // long gap never silently drops legitimate transactions.
            for (let i = 0; i < 600; i++) {
              const dueStr = toDateStr(due);
              if (r.lastGenerated && dueStr <= r.lastGenerated) break;
              if (dueStr < r.anchorDate) break;
              dueDates.unshift(dueStr);
              if (r.unit === "أسبوعي") {
                due = new Date(due);
                due.setDate(due.getDate() - every * 7);
              } else {
                const idx = due.getFullYear() * 12 + due.getMonth() - every;
                due = new Date(Math.floor(idx / 12), ((idx % 12) + 12) % 12, due.getDate());
              }
            }
            if (!dueDates.length) return r;
            for (const dueStr of dueDates) {
              newTx.push({
                id: uid(),
                date: dueStr,
                amount: r.amount,
                category: r.category,
                note: r.note ? `${r.note} (تلقائي)` : "معاملة متكررة",
              });
              generated++;
            }
            return { ...r, lastGenerated: dueDates[dueDates.length - 1] };
          });
          if (!newTx.length) return {};
          return {
            transactions: [...newTx, ...s.transactions],
            recurring: updatedRecurring,
          };
        });
        return generated;
      },

      setBudget: (category, cap) =>
        set((s) => {
          const entry = { category, limit: cap.limit, pct: cap.pct };
          const existing = s.budgets.find((b) => b.category === category);
          if (existing) {
            return {
              budgets: s.budgets.map((b) => (b.category === category ? entry : b)),
            };
          }
          return { budgets: [...s.budgets, entry] };
        }),

      setMonthlyIncome: (amount) =>
        set(() => ({ monthlyIncome: amount && amount > 0 ? amount : null })),

      removeBudget: (category) =>
        set((s) => ({
          budgets: s.budgets.filter((b) => b.category !== category),
        })),

      addCategory: (def) =>
        set((s) => ({ categories: [...s.categories, def] })),

      updateCategory: (id, updates) =>
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        })),

      deleteCategory: (id) =>
        set((s) => ({
          // Deleting a main category takes its sub-categories with it.
          categories: s.categories.filter((c) => c.id !== id && c.parentId !== id),
          // A budget cap for a category that no longer exists is meaningless —
          // the transactions/recurring rules themselves are kept (history is
          // never deleted), they'll just show as "غير مصنف".
          budgets: s.budgets.filter((b) => b.category !== id),
        })),

      // Reorder a category among its siblings (mains among mains, subs among
      // subs of the same parent) by swapping it with the adjacent one — the
      // array order is the display order everywhere.
      moveCategory: (id, dir) =>
        set((s) => {
          const cats = [...s.categories];
          const cat = cats.find((c) => c.id === id);
          if (!cat) return {};
          const sameGroup = (c: FinanceCategoryDef) =>
            cat.parentId ? c.parentId === cat.parentId : !c.parentId;
          const sibIdx = cats.map((c, i) => (sameGroup(c) ? i : -1)).filter((i) => i >= 0);
          const here = sibIdx.indexOf(cats.indexOf(cat));
          const there = here + dir;
          if (there < 0 || there >= sibIdx.length) return {};
          const a = sibIdx[here];
          const b = sibIdx[there];
          [cats[a], cats[b]] = [cats[b], cats[a]];
          return { categories: cats };
        }),

      // Remember "this merchant → this category" from a hand-categorization so
      // future expenses from the same place are auto-classified the same way.
      rememberMerchant: (note, categoryId) =>
        set((s) => {
          const key = normalizeMerchant(note);
          const rules = s.merchantRules ?? {};
          if (!key || !categoryId) return {};
          if (rules[key] === categoryId) return {};
          return { merchantRules: { ...rules, [key]: categoryId } };
        }),

      addReserve: (fund) =>
        set((s) => ({ reserves: [...s.reserves, fund] })),

      updateReserve: (id, updates) =>
        set((s) => ({
          reserves: s.reserves.map((f) => (f.id === id ? { ...f, ...updates } : f)),
        })),

      deleteReserve: (id) =>
        set((s) => ({
          reserves: s.reserves.filter((f) => f.id !== id),
          // Splits pointing at a deleted fund would silently re-charge those
          // amounts nowhere; fold them back into the daily budget instead.
          transactions: s.transactions.map((t) =>
            t.reserveSplits?.some((sp) => sp.fundId === id)
              ? { ...t, reserveSplits: t.reserveSplits.filter((sp) => sp.fundId !== id) }
              : t
          ),
        })),

      addReserveDeposit: (fundId, deposit) =>
        set((s) => ({
          reserves: s.reserves.map((f) =>
            f.id === fundId ? { ...f, deposits: [deposit, ...f.deposits] } : f
          ),
        })),

      deleteReserveDeposit: (fundId, depositId) =>
        set((s) => ({
          reserves: s.reserves.map((f) =>
            f.id === fundId
              ? { ...f, deposits: f.deposits.filter((d) => d.id !== depositId) }
              : f
          ),
        })),

      setDailyBudget: (amount, source) =>
        // Changing the daily amount restarts the cumulative tally from today
        // rather than reinterpreting all of history under the new rate.
        // Ignore invalid amounts (NaN / non-positive), mirroring setMonthlyIncome.
        set(() => {
          if (!Number.isFinite(amount) || amount <= 0) return {};
          return {
            dailyBudget: {
              amount,
              startDate: today(),
              monthlyIncome: source?.monthlyIncome,
              incomePct: source?.incomePct,
            },
          };
        }),

      removeDailyBudget: () =>
        set(() => ({ dailyBudget: null })),

      setSalaryDay: (day) =>
        set(() => ({ salaryDay: Math.min(Math.max(Math.round(day) || 27, 1), 31) })),

      setReadingGoal: (goal) =>
        set(() => ({ readingGoal: goal && goal > 0 ? Math.round(goal) : null })),

      // «نزل الراتب»: باقي الميزانية اليومية المتراكمة يتحول لصندوق
      // «الفوائض» (يُنشأ تلقائياً إن لم يوجد)، ويبدأ عدّاد اليومية من جديد.
      confirmSalary: () => {
        let moved = 0;
        set((s) => {
          const todayStr = today();
          const balance = s.dailyBudget
            ? computeDailyBudgetStatus(s.dailyBudget, s.transactions).balance
            : 0;
          moved = Math.max(0, Math.round(balance * 100) / 100);

          let reserves = s.reserves;
          if (moved > 0) {
            let fund = reserves.find((f) => f.name === SURPLUS_FUND_NAME);
            if (!fund) {
              fund = {
                id: uid(),
                name: SURPLUS_FUND_NAME,
                icon: "✨",
                color: "#c9852a",
                deposits: [],
                createdAt: todayStr,
              };
              reserves = [...reserves, fund];
            }
            const deposit: ReserveDeposit = {
              id: uid(),
              date: todayStr,
              amount: moved,
              note: "فوائض دورة الراتب",
            };
            reserves = reserves.map((f) =>
              f.id === fund!.id ? { ...f, deposits: [deposit, ...f.deposits] } : f
            );
          }

          // الدورة الجديدة تبدأ من اليوم (لا الغد) فيُحتسب أي صرف يسجَّل بعد
          // تأكيد الراتب في نفس اليوم. carryAdjust يمنع منح مخصّص اليوم مرتين
          // (كان ضمن الرصيد المرحّل): بعد التأكيد يصبح الرصيد صفراً بالضبط.
          let dailyBudget = s.dailyBudget;
          if (dailyBudget) {
            const spentToday = round2(
              s.transactions.filter((t) => t.date === todayStr).reduce((a, t) => a + dailyShare(t), 0)
            );
            dailyBudget = { ...dailyBudget, startDate: todayStr, carryAdjust: round2(dailyBudget.amount - spentToday) };
          }

          return {
            reserves,
            lastSalaryConfirm: todayStr,
            dailyBudget,
          };
        });
        return moved;
      },

      sweepToReserve: (fundId, amount, note) =>
        set((s) => {
          if (amount <= 0) return {};
          const todayStr = today();
          const deposit: ReserveDeposit = {
            id: uid(),
            date: todayStr,
            amount,
            note: note ?? "من فائض الميزانية اليومية",
          };
          // ما انتقل للاحتياطي يخرج من عدّاد اليومية. الدورة الجديدة تبدأ من
          // اليوم مع carryAdjust بحيث ينخفض الرصيد بمقدار المُحوَّل بالضبط
          // ويظل صرف بقية اليوم محتسَباً (بدل استثنائه بالبدء من الغد).
          let dailyBudget = s.dailyBudget;
          if (dailyBudget) {
            const oldBalance = computeDailyBudgetStatus(dailyBudget, s.transactions).balance;
            const spentToday = round2(
              s.transactions.filter((t) => t.date === todayStr).reduce((a, t) => a + dailyShare(t), 0)
            );
            dailyBudget = {
              ...dailyBudget,
              startDate: todayStr,
              carryAdjust: round2(dailyBudget.amount - spentToday - (oldBalance - amount)),
            };
          }
          return {
            reserves: s.reserves.map((f) =>
              f.id === fundId ? { ...f, deposits: [deposit, ...f.deposits] } : f
            ),
            dailyBudget,
          };
        }),

      addFutureLetter: (letter) =>
        set((s) => ({ futureLetters: [letter, ...s.futureLetters] })),

      openFutureLetter: (id) =>
        set((s) => ({
          futureLetters: s.futureLetters.map((l) =>
            l.id === id ? { ...l, opened: true, openedDate: today() } : l
          ),
        })),

      deleteFutureLetter: (id) =>
        set((s) => ({ futureLetters: s.futureLetters.filter((l) => l.id !== id) })),

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

      // Edits the log record only — the book's currentPage is left as-is
      // (it stays editable via the book form, and deleteReadingLog likewise
      // doesn't touch it), so an edit can never double-count page progress.
      updateReadingLog: (id, updates) =>
        set((s) => ({
          readingLogs: s.readingLogs.map((l) => (l.id === id ? { ...l, ...updates } : l)),
        })),

      deleteReadingLog: (id) =>
        set((s) => ({ readingLogs: s.readingLogs.filter((l) => l.id !== id) })),

      addHabit: (habit) =>
        set((s) => ({ habits: [...s.habits, habit] })),

      updateHabit: (id, updates) =>
        set((s) => ({
          habits: s.habits.map((h) => (h.id === id ? { ...h, ...updates } : h)),
        })),

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

      // Uses rawSet so the cloud's own lastUpdated is preserved (stamping a
      // fresh one here would defeat the newer-wins merge comparison).
      hydrate: (data) =>
        rawSet(() => ({
          transactions: data.transactions ?? [],
          books: data.books ?? [],
          readingLogs: data.readingLogs ?? [],
          journalEntries: data.journalEntries ?? [],
          habits: data.habits ?? [],
          recurring: data.recurring ?? [],
          budgets: data.budgets ?? [],
          categories: data.categories ?? DEFAULT_CATEGORIES,
          reserves: data.reserves ?? [],
          prayerLogs: data.prayerLogs ?? [],
          dailyBudget: data.dailyBudget ?? null,
          monthlyIncome: data.monthlyIncome ?? null,
          futureLetters: data.futureLetters ?? [],
          salaryDay: data.salaryDay ?? 27,
          lastSalaryConfirm: data.lastSalaryConfirm ?? null,
          readingGoal: data.readingGoal ?? null,
          merchantRules: data.merchantRules ?? {},
          deleted: data.deleted ?? {},
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
          categories: s.categories,
          reserves: s.reserves,
          prayerLogs: s.prayerLogs,
          dailyBudget: s.dailyBudget,
          monthlyIncome: s.monthlyIncome,
          futureLetters: s.futureLetters,
          salaryDay: s.salaryDay,
          lastSalaryConfirm: s.lastSalaryConfirm,
          readingGoal: s.readingGoal,
          merchantRules: s.merchantRules,
          deleted: s.deleted ?? {},
          lastUpdated: s.lastUpdated,
        };
      },
    };
    },
    {
      name: "my-dream-store",
      version: 9,
      storage: createJSONStorage(() => idbStorage),
      migrate: (persisted: unknown, version: number) => {
        let state = (persisted ?? {}) as Record<string, unknown>;
        const todayStr = today();

        // v2 dropped income entirely (finance is expense/budget-only) and
        // replaced the fixed شهري/أسبوعي/سنوي frequency with a flexible
        // (unit, every) interval.
        if (version < 2) {
          const oldExpenseCategories = new Set([
            "إيجار", "مواصلات", "طعام", "صحة", "تعليم", "كمالي", "سفر", "ادخار", "استثمار", "أخرى",
          ]);
          const transactions = ((state.transactions as Record<string, unknown>[]) ?? [])
            .filter((t) => t.type !== "دخل" && oldExpenseCategories.has(t.category as string))
            .map((t) => ({
              id: t.id, date: t.date, amount: t.amount,
              category: t.category, note: t.note, linkedJournalId: t.linkedJournalId,
            }));
          const recurring = ((state.recurring as Record<string, unknown>[]) ?? [])
            .filter((r) => r.type !== "دخل" && oldExpenseCategories.has(r.category as string))
            .map((r) => {
              let unit = "شهري";
              let every = 1;
              if (r.frequency === "أسبوعي") { unit = "أسبوعي"; every = 1; }
              else if (r.frequency === "سنوي") { unit = "شهري"; every = 12; }
              return {
                id: r.id, amount: r.amount, category: r.category, note: r.note,
                unit, every, dayOfMonth: (r.dayOfMonth as number) ?? 1,
                anchorDate: (r.lastGenerated as string) ?? todayStr,
                active: r.active, lastGenerated: r.lastGenerated,
              };
            });
          const budgets = ((state.budgets as Record<string, unknown>[]) ?? [])
            .filter((b) => oldExpenseCategories.has(b.category as string));
          state = { ...state, transactions, recurring, budgets, prayerLogs: state.prayerLogs ?? [] };
        }

        // v3 turns the fixed category union into user-managed categories
        // (add/rename/delete freely, like habits) seeded with 5 defaults.
        if (version < 3) {
          const CATEGORY_REMAP: Record<string, string> = {
            "إيجار": "cat-essentials", "مواصلات": "cat-essentials", "طعام": "cat-essentials",
            "صحة": "cat-essentials", "تعليم": "cat-essentials", "أخرى": "cat-essentials",
            "كمالي": "cat-luxuries", "سفر": "cat-luxuries",
            "ادخار": "cat-investment", "استثمار": "cat-investment",
          };
          const remapCategory = (cat: unknown) => CATEGORY_REMAP[cat as string] ?? (cat as string) ?? "cat-essentials";

          const transactions = ((state.transactions as Record<string, unknown>[]) ?? [])
            .map((t) => ({ ...t, category: remapCategory(t.category) })) as Transaction[];

          const recurring = ((state.recurring as Record<string, unknown>[]) ?? [])
            .map((r) => ({ ...r, category: remapCategory(r.category) })) as RecurringTransaction[];

          // Several old categories can collapse onto the same new one —
          // sum their caps instead of silently dropping any.
          const oldBudgets = (state.budgets as Record<string, unknown>[]) ?? [];
          const summed: Record<string, number> = {};
          for (const b of oldBudgets) {
            const id = remapCategory(b.category);
            summed[id] = (summed[id] ?? 0) + (b.limit as number);
          }
          const budgets: Budget[] = Object.entries(summed).map(([category, limit]) => ({ category, limit }));

          state = {
            ...state,
            transactions,
            recurring,
            budgets,
            categories: state.categories ?? DEFAULT_CATEGORIES,
            dailyBudget: state.dailyBudget ?? null,
          };
        }

        // v4 adds reserve funds (الاحتياطي) and the "auto" theme mode.
        // Everyone lands on auto once — the mode didn't exist before, so a
        // stored "light" was the old default, not a choice.
        if (version < 4) {
          state = {
            ...state,
            reserves: state.reserves ?? [],
            theme: "auto",
          };
        }

        // v5 marks which main categories take sub-categories: أساسيات
        // وكماليات فقط (the flag is what shows the sub-category UI).
        if (version < 5) {
          const subEnabled = new Set(["cat-essentials", "cat-luxuries"]);
          state = {
            ...state,
            categories: ((state.categories as FinanceCategoryDef[]) ?? DEFAULT_CATEGORIES).map((c) =>
              subEnabled.has(c.id) ? { ...c, allowSubs: true } : c
            ),
          };
        }

        // v7 adds رسائل المستقبل ودورة الراتب (يوم 27 + الفوائض).
        // lastSalaryConfirm يبدأ من اليوم حتى لا يظهر سؤال «نزل الراتب؟»
        // فور الترقية عن راتبٍ سبق نزوله — أول ظهور له في يوم الراتب القادم.
        if (version < 7) {
          state = {
            ...state,
            futureLetters: state.futureLetters ?? [],
            salaryDay: state.salaryDay ?? 27,
            lastSalaryConfirm: state.lastSalaryConfirm ?? todayStr,
          };
        }

        // v6 retires the "صرف كبير" feature: the flag is stripped and those
        // transactions count like any other expense from here on.
        if (version < 6) {
          const stripBig = (items: unknown) =>
            ((items as Record<string, unknown>[]) ?? []).map(({ big: _big, ...rest }) => rest);
          state = {
            ...state,
            transactions: stripBig(state.transactions),
            recurring: stripBig(state.recurring),
          };
        }

        // v8 retints the default categories to the app's warm palette. Only
        // categories still on their old default color are updated, so any color
        // the owner picked by hand is preserved.
        if (version < 8) {
          const RETINT: Record<string, [string, string]> = {
            // id: [old default color, new color]
            "cat-essentials": ["#e07b39", "#c1663f"],
            "cat-luxuries": ["#9b6fcd", "#c9852a"],
            "cat-investment": ["#256128", "#3d9640"],
            "cat-others": ["#4a9fbd", "#8a6fb0"],
          };
          state = {
            ...state,
            categories: ((state.categories as FinanceCategoryDef[]) ?? DEFAULT_CATEGORIES).map((c) => {
              const pair = RETINT[c.id];
              return pair && c.color === pair[0] ? { ...c, color: pair[1] } : c;
            }),
          };
        }

        // v9 adds an optional annual reading goal (عدد الكتب المُنهاة هذا العام).
        if (version < 9) {
          state = { ...state, readingGoal: state.readingGoal ?? null };
        }

        return state as unknown as AppData;
      },
    }
  )
);
