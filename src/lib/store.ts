import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AppData, Transaction, Book, ReadingLog, JournalEntry, Habit,
  RecurringTransaction, Budget, FinanceCategoryDef, PrayerName, PrayerStatus, DailyBudget,
  ReserveFund, ReserveDeposit, FutureLetter,
  QuranReflection, HifzUnit, HifzRating, HifzMistake, HifzState,
} from "./types";
import { DEFAULT_CATEGORIES, SURPLUS_FUND_NAME, EMPTY_KHATMA, EMPTY_HIFZ } from "./types";
import { TOTAL_AYAT } from "./quran/meta";
import { nextReviewCursor } from "./quran/hifz";
import { uid, today, toDateStr, parseDate, mostRecentDueDate, computeDailyBudgetStatus, dailyShare, round2, dedupeJournalEntries, entryPhotos, entryAudios } from "./utils";
import { mediaHashOf, mediaTombKey, type MediaKindTag } from "./mediaHash";
import { budgetTombKey, depositTombKey, habitLogTombKey, wirdTombKey, legacyHifzGen } from "./merge";
import { normalizeMerchant } from "./bankParser";
import { idbStorage } from "./idbStorage";

// Id-keyed collections whose deletions must be tombstoned (see the `set`
// wrapper) so cloud sync can't resurrect a removed item from another device.
const ID_COLLECTIONS = [
  "transactions", "books", "readingLogs", "journalEntries",
  "recurring", "reserves", "habits", "futureLetters", "categories",
  "quranReflections",
] as const;

// Single-value settings that carry a per-field edit stamp (see `set` wrapper
// and mergeAppData). Stamping lets the merge pick the value from whichever
// device set it last — so clearing one to null propagates instead of losing to
// the other device's stale non-null copy.
const SINGLETON_FIELDS = [
  "dailyBudget", "monthlyIncome", "readingGoal", "salaryDay",
  "lastSalaryConfirm", "frozenHabits",
] as const;

// Undo of a delete re-adds the item with its original id — but the delete left
// a tombstone in `deleted` (id → ts), and the cloud merge's `alive()` drops any
// id that carries a live tombstone. So re-adding must also lift the tombstone,
// or the restored item silently vanishes on the next sync. Returns a partial to
// spread into the set() patch — empty (no churn) when there's nothing to clear.
function clearTombstone(
  deleted: Record<string, number> | undefined,
  id: string
): { deleted?: Record<string, number> } {
  if (!deleted || !(id in deleted)) return {};
  const next = { ...deleted };
  delete next[id];
  return { deleted: next };
}

// Outcome of a Day One import: `added` = new entries, `completed` = existing
// entries whose partially-missing media was filled, and how many of the touched
// entries carry photos/audio (for an honest summary — not a slice() guess).
export interface ImportResult {
  added: number;
  completed: number;
  photos: number;
  audio: number;
}

interface AppStore extends AppData {
  // Journal
  addJournalEntry: (entry: JournalEntry) => void;
  updateJournalEntry: (id: string, updates: Partial<JournalEntry>) => void;
  deleteJournalEntry: (id: string) => void;
  // Returns an accurate breakdown: entries newly added, existing entries whose
  // missing media was completed, and how many of those carry photos/audio — so
  // the import summary never has to guess which of the parsed entries changed.
  importDayOneEntries: (entries: JournalEntry[]) => ImportResult;
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
  // تجميد/استئناف بطاقة عادة (أساسية أو مخصّصة) بمفتاحها في «عاداتي اليوم»
  toggleFreezeHabit: (key: string) => void;

  // Prayers
  setPrayerStatus: (date: string, prayer: PrayerName, status: PrayerStatus) => void;
  cyclePrayerStatus: (date: string, prayer: PrayerName) => void;

  // Quran — reflections (تدبّر), memorization (حفظ + مراجعة متباعدة),
  // daily wird, and the running khatma (مدار الختمة).
  addReflection: (r: QuranReflection) => void;
  updateReflection: (id: string, updates: Partial<QuranReflection>) => void;
  deleteReflection: (id: string) => void;
  // خطة الحفظ المتتابعة
  startHifzPlan: (startId: number, unit: HifzUnit, amount: number) => void; // fresh plan
  updateHifzPlan: (patch: { unit?: HifzUnit; amount?: number }) => void; // tune without reset
  clearHifz: () => void; // delete plan + all progress
  recordHifzSession: (toId: number, rating?: HifzRating) => void; // memorize up to toId
  setFrontier: (id: number) => void; // move position manually (0..6236)
  recordReview: (fromId: number, toId: number, rating?: HifzRating, advance?: boolean) => void; // periodic review
  skipReview: (toId: number) => void; // move the review cursor on without logging
  setReviewWindow: (pages: number) => void; // حجم نافذة المراجعة المتحرّكة (أوجه)
  recordRandomTest: (fromId: number, toId: number, rating?: HifzRating) => void; // اختبار مفاجئ
  toggleMistakeWord: (ayahId: number, wordIndex: number | null, word?: string) => void; // تحديد/إلغاء خطأ
  resolveMistake: (id: string) => void; // أُتقن الموضع (أُغلق)
  reopenMistake: (id: string) => void; // إعادة فتح خطأٍ مُتقن
  deleteMistake: (id: string) => void; // حذف الخطأ نهائياً
  toggleWird: (date: string) => void; // mark/unmark today's daily wird
  addKhatmaJuz: () => void; // read one juz (caps at 30 — the full ring)
  setKhatmaJuz: (juz: number) => void; // set progress directly (0..30)
  completeKhatma: () => void; // seal a finished khatma (completed++, ring → 0)
  resetKhatma: () => void; // abandon current progress (juz → 0, completed kept)

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

      // Stamp any single-value setting this change touches, so the merge can
      // pick it by recency (and a clear-to-null wins over a stale value).
      let stamped: Record<string, number> | undefined;
      for (const f of SINGLETON_FIELDS) {
        if (f in next) (stamped ??= {})[f] = Date.now();
      }

      const patch: Record<string, unknown> = { ...next, lastUpdated: new Date().toISOString() };
      if (removed) patch.deleted = { ...prev.deleted, ...removed };
      if (stamped) patch.fieldUpdatedAt = { ...prev.fieldUpdatedAt, ...stamped };
      rawSet(patch as Partial<AppStore>, replace as false);
    }) as typeof rawSet;

    // Record/lift media tombstones when a single photo/voice note is removed
    // (or re-added) within an entry. Async because content hashing is async —
    // the hash MUST equal the ref hash sync uses (both go through mediaHashOf),
    // or the tombstone would never match and the deleted photo would ride back
    // in via the media-ref union on the next merge. Keyed by ENTRY+kind+hash, so
    // deleting a photo from one entry never touches the same photo in another.
    // A key that's simultaneously re-added is never tombstoned; a re-added key
    // lifts any prior tombstone.
    type MediaChange = { item: string; kind: MediaKindTag };
    const applyMediaTombstones = async (entryId: string, removed: MediaChange[], added: MediaChange[]) => {
      const keysOf = async (list: MediaChange[]) =>
        (await Promise.all(list.map(async (c) => {
          const h = await mediaHashOf(c.item);
          return h ? mediaTombKey(entryId, c.kind, h) : null;
        }))).filter(Boolean) as string[];
      const [remKeys, addKeys] = await Promise.all([keysOf(removed), keysOf(added)]);
      const add = new Set(addKeys);
      const toTomb = remKeys.filter((k) => !add.has(k));
      if (!toTomb.length && !add.size) return;
      set((s) => {
        const dm = { ...(s.deletedMedia ?? {}) };
        let changed = false;
        const t = Date.now();
        for (const k of toTomb) if (dm[k] !== t) { dm[k] = t; changed = true; }
        for (const k of add) if (k in dm) { delete dm[k]; changed = true; }
        return changed ? { deletedMedia: dm } : {};
      });
    };

    // Diff an entry's media before/after an edit and feed the change to the
    // tombstone recorder. `after` uses the incoming update when it set the field,
    // else the entry's current media (untouched fields aren't removals).
    const trackMediaChange = (before: JournalEntry, updates: Partial<JournalEntry>) => {
      const removed: MediaChange[] = [];
      const added: MediaChange[] = [];
      const diff = (was: string[], now: string[], kind: MediaKindTag) => {
        const wasSet = new Set(was);
        const nowSet = new Set(now);
        for (const it of was) if (!nowSet.has(it)) removed.push({ item: it, kind });
        for (const it of now) if (!wasSet.has(it)) added.push({ item: it, kind });
      };
      if (updates.photos !== undefined || updates.photo !== undefined) {
        diff(entryPhotos(before), entryPhotos({ ...before, ...updates }), "photos");
      }
      if (updates.audios !== undefined || updates.audio !== undefined) {
        diff(entryAudios(before), entryAudios({ ...before, ...updates }), "audios");
      }
      if (removed.length || added.length) void applyMediaTombstones(before.id, removed, added);
    };

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
      quranReflections: [],
      quranHifz: EMPTY_HIFZ,
      quranWird: [],
      quranKhatma: EMPTY_KHATMA,
      dailyBudget: null,
      monthlyIncome: null,
      futureLetters: [],
      salaryDay: 27,
      lastSalaryConfirm: null,
      readingGoal: null,
      frozenHabits: [],
      merchantRules: {},
      deleted: {},
      deletedMedia: {},
      fieldUpdatedAt: {},
      theme: "auto",
      lastUpdated: new Date().toISOString(),

      // Cycles auto → light → dark → auto. Uses rawSet: the theme is a
      // device-local preference and must not bump lastUpdated / push to cloud.
      toggleTheme: () =>
        rawSet((s) => ({
          theme: s.theme === "auto" ? "light" : s.theme === "light" ? "dark" : "auto",
        })),

      addJournalEntry: (entry) =>
        set((s) => ({
          journalEntries: [{ ...entry, updatedAt: Date.now() }, ...s.journalEntries],
          // Re-adding an id that was just deleted (Undo) must lift its tombstone,
          // else the next cloud merge's `alive()` filter deletes it right back.
          ...clearTombstone(s.deleted, entry.id),
        })),

      updateJournalEntry: (id, updates) => {
        // Tombstone any photo/voice note this edit removed (kept the rest), so a
        // later merge can't resurrect it from a copy that still references it.
        const before = get().journalEntries.find((e) => e.id === id);
        if (before) trackMediaChange(before, updates);
        set((s) => ({
          journalEntries: s.journalEntries.map((e) =>
            e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e
          ),
        }));
      },

      deleteJournalEntry: (id) =>
        set((s) => ({
          journalEntries: s.journalEntries.filter((e) => e.id !== id),
        })),

      importDayOneEntries: (entries) => {
        let result: ImportResult = { added: 0, completed: 0, photos: 0, audio: 0 };
        set((s) => {
          const byUuid = new Map(
            s.journalEntries
              .filter((e) => e.dayOneUUID)
              .map((e) => [e.dayOneUUID as string, e] as const)
          );
          const toAdd: JournalEntry[] = [];
          const patches = new Map<string, Partial<JournalEntry>>();
          // Ids we add or complete — their tombstones (if any) MUST be lifted,
          // or the cloud merge's alive() drops them right back on the next sync.
          const touchedIds: string[] = [];
          for (const e of entries) {
            const existing = e.dayOneUUID ? byUuid.get(e.dayOneUUID) : undefined;
            if (!existing) {
              toAdd.push(e);
              touchedIds.push(e.id);
              continue;
            }
            // إعادة الاستيراد تُكمّل النقص الجزئي: إن حمل الاستيراد صوراً/أصواتاً
            // أكثر مما لدى المذكرة (سقط بعضها سابقاً قبل دعم HEIC مثلاً)، نعتمد
            // المجموعة الأكمل بدل تخطّيها لمجرّد أنها «تحتوي صوراً».
            const patch: Partial<JournalEntry> = {};
            const existingPhotos = existing.photos?.length ?? (existing.photo ? 1 : 0);
            const incomingPhotos = e.photos?.length ?? (e.photo ? 1 : 0);
            if (incomingPhotos > existingPhotos) { patch.photos = e.photos; patch.photo = e.photo; }
            const existingAudios = existing.audios?.length ?? (existing.audio ? 1 : 0);
            const incomingAudios = e.audios?.length ?? (e.audio ? 1 : 0);
            if (incomingAudios > existingAudios) { patch.audios = e.audios; patch.audio = e.audio; }
            if (Object.keys(patch).length) {
              patches.set(existing.id, patch);
              touchedIds.push(existing.id);
            }
          }
          if (!toAdd.length && !patches.size) return {}; // مطابق تماماً — لا بصمة
          // Media counts across the entries that actually changed (added or
          // completed) — no ordering assumption, so the summary is exact.
          let photos = 0, audio = 0;
          for (const e of toAdd) {
            if (e.photos?.length || e.photo) photos++;
            if (e.audios?.length || e.audio) audio++;
          }
          for (const p of patches.values()) {
            if (p.photos?.length || p.photo) photos++;
            if (p.audios?.length || p.audio) audio++;
          }
          result = { added: toAdd.length, completed: patches.size, photos, audio };
          const updated = s.journalEntries.map((en) =>
            patches.has(en.id) ? { ...en, ...patches.get(en.id) } : en
          );
          // ارفع شواهد الحذف عن كل معرّفٍ أُعيد استيراده — وإلا اعتبره الدمج محذوفاً
          // فيظهر محلياً ثم يختفي بعد المزامنة (خلل «حذف ثم إعادة استيراد»).
          let deleted = s.deleted;
          if (deleted && touchedIds.some((id) => id in deleted!)) {
            deleted = { ...deleted };
            for (const id of touchedIds) delete deleted[id];
          }
          return {
            journalEntries: [...toAdd, ...updated],
            ...(deleted !== s.deleted ? { deleted } : {}),
          };
        });
        return result;
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
        set((s) => ({
          transactions: [{ ...tx, updatedAt: Date.now() }, ...s.transactions],
          // Re-adding a just-deleted id (Undo) must lift its tombstone (see above).
          ...clearTombstone(s.deleted, tx.id),
        })),

      updateTransaction: (id, updates) =>
        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
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
                // Deterministic id from the rule + occurrence date so two devices
                // that each generate the same due occurrence produce the SAME id —
                // the sync merge (byId) then collapses them into one instead of
                // leaving a duplicate rent/subscription. Manual transactions keep
                // their random uid(); only auto-generated recurring ones are keyed.
                id: `rec_${r.id}_${dueStr}`,
                date: dueStr,
                amount: r.amount,
                category: r.category,
                note: r.note ? `${r.note} (تلقائي)` : "معاملة متكررة",
                updatedAt: Date.now(),
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
          const budgets = existing
            ? s.budgets.map((b) => (b.category === category ? entry : b))
            : [...s.budgets, entry];
          // (Re-)setting a cap lifts any tombstone so the merge keeps it.
          return { budgets, ...clearTombstone(s.deleted, budgetTombKey(category)) };
        }),

      setMonthlyIncome: (amount) =>
        set(() => ({ monthlyIncome: amount && amount > 0 ? amount : null })),

      removeBudget: (category) =>
        set((s) => ({
          budgets: s.budgets.filter((b) => b.category !== category),
          // Budgets are keyed by category, not a top-level id, so the auto-
          // tombstoner doesn't see this delete — record it explicitly so a
          // second device can't re-add the cap through the merge union.
          deleted: { ...s.deleted, [budgetTombKey(category)]: Date.now() },
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
          // Re-adding a deposit (undo) lifts its tombstone so it isn't re-dropped.
          ...clearTombstone(s.deleted, depositTombKey(deposit.id)),
        })),

      deleteReserveDeposit: (fundId, depositId) =>
        set((s) => ({
          reserves: s.reserves.map((f) =>
            f.id === fundId
              ? { ...f, deposits: f.deposits.filter((d) => d.id !== depositId) }
              : f
          ),
          // Deposits are nested inside a fund, so the auto-tombstoner (which only
          // watches top-level ids) doesn't see this delete — record it explicitly
          // so the deposit union in mergeAppData can't pull it back.
          deleted: { ...s.deleted, [depositTombKey(depositId)]: Date.now() },
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
        set((s) => {
          const uncompleting = s.habits.find((h) => h.id === habitId)?.logs.includes(date) ?? false;
          const habits = s.habits.map((h) => {
            if (h.id !== habitId) return h;
            const logs = h.logs.includes(date)
              ? h.logs.filter((d) => d !== date)
              : [...h.logs, date];
            return { ...h, logs };
          });
          // Un-checking a day is a real edit: tombstone habitlog:<id>:<date> so
          // the log-union merge can't re-check it from another device. Checking
          // it lifts the tombstone.
          const key = habitLogTombKey(habitId, date);
          return uncompleting
            ? { habits, deleted: { ...s.deleted, [key]: Date.now() } }
            : { habits, ...clearTombstone(s.deleted, key) };
        }),

      deleteHabit: (id) =>
        set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),

      toggleFreezeHabit: (key) =>
        set((s) => {
          const frozen = s.frozenHabits ?? [];
          return {
            frozenHabits: frozen.includes(key)
              ? frozen.filter((k) => k !== key)
              : [...frozen, key],
          };
        }),

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

      // ---------- Quran ----------
      addReflection: (r) =>
        set((s) => ({ quranReflections: [r, ...s.quranReflections] })),

      updateReflection: (id, updates) =>
        set((s) => ({
          quranReflections: s.quranReflections.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        })),

      deleteReflection: (id) =>
        set((s) => ({ quranReflections: s.quranReflections.filter((r) => r.id !== id) })),

      // Fresh plan: sets the start point and daily target, and resets the
      // frontier to just before the start (so the first daily portion begins at
      // startId) along with all sessions/reviews.
      // Fresh plan: جيلٌ جديد (planId) بطابعٍ حديث — فيفوز على أيّ خطةٍ قديمة على
      // جهازٍ آخر ولا تُعيده نسخة سابقة عند الدمج (راجع mergeHifz).
      startHifzPlan: (startId, unit, amount) =>
        set(() => {
          const now = Date.now();
          return {
            quranHifz: {
              plan: { startId, unit, amount: Math.max(1, Math.round(amount) || 1), createdAt: today() },
              frontierId: Math.max(0, startId - 1),
              sessions: [],
              reviews: [],
              reviewCursorId: 0,
              mistakes: [],
              lastTestDate: undefined,
              planId: uid(),
              planUpdatedAt: now,
              frontierUpdatedAt: now,
            },
          };
        }),

      // Tune the daily target/unit without touching memorized progress. يبقى
      // الجيل نفسه؛ نُحدِّث planUpdatedAt فقط لينتشر تعديلُ المقدار عبر الأجهزة.
      updateHifzPlan: (patch) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          if (!h.plan) return {};
          const plan = { ...h.plan, ...patch };
          if (patch.amount != null) plan.amount = Math.max(1, Math.round(patch.amount) || 1);
          return { quranHifz: { ...h, plan, planUpdatedAt: Date.now() } };
        }),

      // مسح الخطة: جيلٌ جديد (planId) بطابعٍ حديث حتى يفوز على الخطة القديمة عند
      // الدمج — فلا تُعيدها نسخةٌ قديمة ولا استعادةُ نسخةٍ احتياطية سابقة.
      clearHifz: () =>
        set(() => {
          const now = Date.now();
          return {
            quranHifz: {
              plan: null, frontierId: 0, sessions: [], reviews: [], reviewCursorId: 0,
              mistakes: [], lastTestDate: undefined,
              planId: uid(), planUpdatedAt: now, frontierUpdatedAt: now,
            },
          };
        }),

      // Memorize forward: advance the frontier to toId and log the session. نختم
      // الجلسة بطابع `at` ليميّزها الدمجُ عن التصحيح اليدوي (تقدّم الجلسات لا
      // يُلغى، والتصحيح اليدويّ الأحدث منها يفوز).
      recordHifzSession: (toId, rating) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          const from = h.frontierId + 1;
          const to = Math.min(Math.max(toId, from), TOTAL_AYAT);
          if (to < from) return {};
          const session = { id: uid(), date: today(), fromId: from, toId: to, rating, at: Date.now() };
          return { quranHifz: { ...h, frontierId: to, sessions: [session, ...h.sessions] } };
        }),

      // Move the memorization position by hand (correction) without a session.
      // نختمه بـfrontierUpdatedAt حتى ينتشر التصحيح (ولو للخلف) ولا يُلغيه اتّحادٌ
      // أعمى مع جبهةٍ قديمة أعلى على جهازٍ آخر.
      setFrontier: (id) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          return { quranHifz: { ...h, frontierId: Math.min(Math.max(Math.round(id) || 0, 0), TOTAL_AYAT), frontierUpdatedAt: Date.now() } };
        }),

      // Log a periodic review of a memorized portion and advance the review
      // cursor (loops back to the start once it passes the frontier).
      // advance=true moves the cyclic review cursor forward (سياق المراجعة
      // الدورية). Weak-spot reviews pass advance=false so they don't disturb it.
      recordReview: (fromId, toId, rating, advance = true) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          const log = { id: uid(), date: today(), fromId, toId, rating };
          return {
            quranHifz: {
              ...h,
              reviews: [log, ...h.reviews],
              reviewCursorId: advance ? nextReviewCursor(h, toId) : h.reviewCursorId,
            },
          };
        }),

      skipReview: (toId) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          return { quranHifz: { ...h, reviewCursorId: nextReviewCursor(h, toId) } };
        }),

      // حجم نافذة المراجعة المتحرّكة «آخر N وجه» (مقيّد 1..15).
      setReviewWindow: (pages) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          if (!h.plan) return {};
          const p = Math.min(Math.max(Math.round(pages) || 1, 1), 15);
          return { quranHifz: { ...h, plan: { ...h.plan, reviewWindowPages: p } } };
        }),

      // اختبار مفاجئ: يُسجَّل كمراجعةٍ (بلا تحريك مؤشّر الدورة) ويضبط تاريخ آخر
      // اختبارٍ حتى تُحسب دوريّته.
      recordRandomTest: (fromId, toId, rating) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          const log = { id: uid(), date: today(), fromId, toId, rating };
          return { quranHifz: { ...h, reviews: [log, ...h.reviews], lastTestDate: today() } };
        }),

      // تحديد خطأٍ في موضعٍ (كلمة أو آية كاملة) بمنطق التبديل: أوّل مرّة يُنشئ
      // سجلّاً بضربةٍ اليوم؛ الضغط ثانيةً في نفس اليوم يتراجع (يُزيل ضربة اليوم،
      // ويحذف السجلّ إن فرغ)؛ إن كان آخر خطأٍ في يومٍ سابق فالضغط يُضيف ضربةً
      // اليوم (تكرارٌ يزيد العدّاد) ويُعيد فتح السجلّ.
      toggleMistakeWord: (ayahId, wordIndex, word) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          const list = h.mistakes ?? [];
          const t = today();
          const idx = list.findIndex(
            (m) => m.ayahId === ayahId && (m.wordIndex ?? null) === (wordIndex ?? null),
          );
          if (idx < 0) {
            const created: HifzMistake = {
              id: uid(), ayahId, wordIndex: wordIndex ?? null, word,
              hits: [t], resolved: false, updatedAt: t,
            };
            return { quranHifz: { ...h, mistakes: [created, ...list] } };
          }
          const cur = list[idx];
          const next = [...list];
          if (cur.hits[cur.hits.length - 1] === t) {
            // تراجُع في نفس اليوم — أزِل ضربة اليوم، واحذف السجلّ إن فرغ.
            const hits = cur.hits.slice(0, -1);
            if (hits.length === 0) next.splice(idx, 1);
            else next[idx] = { ...cur, hits, resolved: false, updatedAt: t };
          } else {
            // تكرارٌ في يومٍ جديد — أضِف ضربةً وأعِد الفتح.
            next[idx] = { ...cur, hits: [...cur.hits, t], word: word ?? cur.word, resolved: false, updatedAt: t };
          }
          return { quranHifz: { ...h, mistakes: next } };
        }),

      resolveMistake: (id) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          const list = h.mistakes ?? [];
          return { quranHifz: { ...h, mistakes: list.map((m) => (m.id === id ? { ...m, resolved: true, updatedAt: today() } : m)) } };
        }),

      reopenMistake: (id) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          const list = h.mistakes ?? [];
          return { quranHifz: { ...h, mistakes: list.map((m) => (m.id === id ? { ...m, resolved: false, updatedAt: today() } : m)) } };
        }),

      deleteMistake: (id) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          const list = h.mistakes ?? [];
          return { quranHifz: { ...h, mistakes: list.filter((m) => m.id !== id) } };
        }),

      toggleWird: (date) =>
        set((s) => {
          const uncompleting = s.quranWird.includes(date);
          const quranWird = uncompleting
            ? s.quranWird.filter((d) => d !== date)
            : [...s.quranWird, date];
          // Same as habit logs: un-marking a wird day tombstones wird:<date> so
          // the date-union merge can't restore it; re-marking lifts it.
          const key = wirdTombKey(date);
          return uncompleting
            ? { quranWird, deleted: { ...s.deleted, [key]: Date.now() } }
            : { quranWird, ...clearTombstone(s.deleted, key) };
        }),

      // Read a juz — fill one more segment of the ring, up to the full 30.
      // Sealing the finished ring into a completed khatma is an explicit step
      // (completeKhatma) so the full ring gets its celebratory moment.
      addKhatmaJuz: () =>
        set((s) => {
          const k = s.quranKhatma ?? EMPTY_KHATMA;
          if (k.juz >= 30) return {};
          const todayStr = today();
          return {
            quranKhatma: {
              ...k,
              juz: k.juz + 1,
              startDate: k.startDate ?? todayStr,
              lastReadDate: todayStr,
            },
          };
        }),

      setKhatmaJuz: (juz) =>
        set((s) => {
          const k = s.quranKhatma ?? EMPTY_KHATMA;
          const clamped = Math.min(Math.max(Math.round(juz) || 0, 0), 30);
          return {
            quranKhatma: {
              ...k,
              juz: clamped,
              startDate: clamped > 0 ? (k.startDate ?? today()) : undefined,
              lastReadDate: clamped > 0 ? today() : k.lastReadDate,
            },
          };
        }),

      completeKhatma: () =>
        set((s) => {
          const k = s.quranKhatma ?? EMPTY_KHATMA;
          return { quranKhatma: { juz: 0, completed: k.completed + 1, startDate: today(), lastReadDate: today() } };
        }),

      resetKhatma: () =>
        set((s) => ({ quranKhatma: { juz: 0, completed: (s.quranKhatma ?? EMPTY_KHATMA).completed } })),

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
          quranReflections: data.quranReflections ?? [],
          quranHifz: data.quranHifz ?? EMPTY_HIFZ,
          quranWird: data.quranWird ?? [],
          quranKhatma: data.quranKhatma ?? EMPTY_KHATMA,
          dailyBudget: data.dailyBudget ?? null,
          monthlyIncome: data.monthlyIncome ?? null,
          futureLetters: data.futureLetters ?? [],
          salaryDay: data.salaryDay ?? 27,
          lastSalaryConfirm: data.lastSalaryConfirm ?? null,
          readingGoal: data.readingGoal ?? null,
          frozenHabits: data.frozenHabits ?? [],
          merchantRules: data.merchantRules ?? {},
          deleted: data.deleted ?? {},
          deletedMedia: data.deletedMedia ?? {},
          fieldUpdatedAt: data.fieldUpdatedAt ?? {},
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
          quranReflections: s.quranReflections,
          quranHifz: s.quranHifz ?? EMPTY_HIFZ,
          quranWird: s.quranWird,
          quranKhatma: s.quranKhatma ?? EMPTY_KHATMA,
          dailyBudget: s.dailyBudget,
          monthlyIncome: s.monthlyIncome,
          futureLetters: s.futureLetters,
          salaryDay: s.salaryDay,
          lastSalaryConfirm: s.lastSalaryConfirm,
          readingGoal: s.readingGoal,
          frozenHabits: s.frozenHabits ?? [],
          merchantRules: s.merchantRules,
          deleted: s.deleted ?? {},
          deletedMedia: s.deletedMedia ?? {},
          fieldUpdatedAt: s.fieldUpdatedAt ?? {},
          lastUpdated: s.lastUpdated,
        };
      },
    };
    },
    {
      name: "my-dream-store",
      version: 13,
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

        // v10 adds the قرآن section: تأمّلات، محفوظات، وِرد يومي، وحالة الختمة.
        if (version < 10) {
          state = {
            ...state,
            quranReflections: state.quranReflections ?? [],
            quranWird: state.quranWird ?? [],
            quranKhatma: state.quranKhatma ?? { juz: 0, completed: 0 },
          };
        }

        // v11 replaces the old memorization list (quranMemorized) with the
        // sequential حفظ plan (quranHifz). The old experimental list is dropped.
        if (version < 11) {
          const st = state as Record<string, unknown>;
          delete st.quranMemorized;
          state = {
            ...st,
            quranHifz: st.quranHifz ?? { plan: null, frontierId: 0, sessions: [], reviews: [], reviewCursorId: 0 },
          };
        }

        // v12 يُثبّت هوية مذكرات Day One: كانت تأخذ uid عشوائياً كل استيراد، فنفس
        // المذكرة على الجوال والآيباد صارت بمعرّفين مختلفين — يتكرّر عرضها،
        // وحذفها على جهاز لا ينتشر للآخر. الآن معرّفها مشتقّ من UUID الثابت
        // (`do-<uuid>`)، فتتلاقى النسخ في عنصرٍ واحد ويصبح الحذف قابلاً للانتشار.
        // dedupeJournalEntries يعيد كتابة المعرّفات ويدمج المكرّرات (مع وسائطها).
        if (version < 12) {
          const je = (state.journalEntries as JournalEntry[]) ?? [];
          state = { ...state, journalEntries: dedupeJournalEntries(je) };
        }

        // v13 يُثبّت «جيل خطة الحفظ» (planId) لبيانات quranHifz القديمة التي لا
        // تحمله: معرّفٌ مشتقٌّ ثابت (legacyHifzGen) يُنتج القيمةَ نفسها على كلّ
        // جهاز — فتتلاقى الخطة القديمة في جيلٍ واحد وتتّحد سجلّاتها بلا فقد، بينما
        // أيّ بدءٍ/مسحٍ لاحق (planId عشوائي بطابعٍ حديث) يفوز عليها. الطوابع صفر
        // كي يفوز عليها أيّ إجراءٍ حقيقيّ لاحق. راجع mergeHifz في merge.ts.
        if (version < 13) {
          const h = state.quranHifz as HifzState | undefined;
          if (h && h.planId == null) {
            state = {
              ...state,
              quranHifz: {
                ...h,
                mistakes: h.mistakes ?? [],
                planId: legacyHifzGen(h),
                planUpdatedAt: 0,
                frontierUpdatedAt: 0,
              },
            };
          }
        }

        return state as unknown as AppData;
      },
    }
  )
);
