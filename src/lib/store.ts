import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AppData, Transaction, Book, ReadingLog, JournalEntry, Habit,
  RecurringTransaction, Budget, FinanceCategoryDef, PrayerName, PrayerStatus, PrayerLog, DailyBudget,
  ReserveFund, ReserveDeposit, FutureLetter, CountdownEvent, InstallmentPlan, InstallmentRole, Asset,
  QuranReflection, HifzUnit, HifzRating, HifzIntensity, HifzMistake, HifzState, HifzSession, HifzReviewLog,
  BudgetWindowMode,
} from "./types";
import { DEFAULT_CATEGORIES, SURPLUS_FUND_NAME, EMPTY_KHATMA, EMPTY_HIFZ } from "./types";
import { TOTAL_AYAT } from "./quran/meta";
import { MISTAKE_MASTERY } from "./quran/hifz";
import { khatmaJuzForPage } from "./quran/khatma";
import { uid, today, toDateStr, parseDate, mostRecentDueDate, computeDailyBudgetStatus, dailyShare, round2, reserveBalance, dedupeJournalEntries, entryPhotos, entryAudios, generationModeOf, unionRefs } from "./utils";
import { mediaHashOf, mediaTombKey, type MediaKindTag } from "./mediaHash";
import { mergeDayEntries } from "./mergeDay";
import { budgetTombKey, depositTombKey, habitLogTombKey, wirdTombKey, legacyHifzGen, merchantStampKey, CATEGORY_ORDER_FIELD, KHATMA_GOAL_FIELD } from "./merge";
import { normalizeMerchant } from "./bankParser";
import { persistedIdbStorage } from "./idbStorage";
import { planSummary, rowRemaining, isValidDateKey, MAX_INSTALLMENT_COUNT, suggestPlanLink } from "./installments";

// Id-keyed collections whose deletions must be tombstoned (see the `set`
// wrapper) so cloud sync can't resurrect a removed item from another device.
const ID_COLLECTIONS = [
  "transactions", "books", "readingLogs", "journalEntries",
  "recurring", "reserves", "habits", "futureLetters", "categories",
  "quranReflections", "installmentPlans", "assets", "countdownEvents",
] as const;

// Single-value settings that carry a per-field edit stamp (see `set` wrapper
// and mergeAppData). Stamping lets the merge pick the value from whichever
// device set it last — so clearing one to null propagates instead of losing to
// the other device's stale non-null copy.
const SINGLETON_FIELDS = [
  "dailyBudget", "monthlyIncome", "readingGoal", "salaryDay",
  "lastSalaryConfirm", "frozenHabits", "budgetWindow", "quranKhatma",
] as const;

// حقول تقدّم الختمة (قراءةُ اليوم) — يقابلها `dailyPageGoal` وحده كتفضيلٍ شخصيّ
// له طابعه المستقل، فضبطُ الهدف لا يُلغي تقدّماً سُجّل على الجهاز الآخر ولا العكس.
const KHATMA_PROGRESS_FIELDS = ["juz", "page", "startDate", "lastReadDate", "completed", "pageLog"] as const;

// Id-keyed collections whose items carry their own `updatedAt` edit stamp, so
// the merge resolves a per-item conflict by which COPY was edited last instead
// of which DOCUMENT was saved last. Same list as ID_COLLECTIONS: every id-keyed
// item is editable, and a stamp on one that never changes costs nothing.
const STAMPED_COLLECTIONS = ID_COLLECTIONS;
type StampedItem = { id: string; updatedAt?: number };

// Fields that must NOT count as "the owner edited this item", per collection.
// Two kinds live here:
//  • آليّة: `lastGenerated` يتحرّك مع كلّ runRecurring، وختمُه يجعل مجرّد فتح
//    التطبيق يطغى على تعديلٍ حقيقيّ من الجهاز الآخر.
//  • **مركّبة لها دمجُها المستقل**: سجلّات العادة وإيداعات الصندوق تتّحد عنصراً
//    عنصراً ولها شواهد حذفٍ خاصّة (habitlog:/deposit:)، ووسائط المذكرة تتّحد
//    بالاتحاد وتُحذف بشاهد (deletedMedia). لو رفع تغييرُها طابع العنصر لصار
//    تسجيلُ يومٍ — أو استكمالُ صور Day One — «تعديلاً» يفوز على إعادة تسمية
//    العادة أو تحرير نصّ المذكرة على الجهاز الآخر، وهو ما لا يريده أحد.
const UNSTAMPED_FIELDS: Partial<Record<(typeof STAMPED_COLLECTIONS)[number], readonly string[]>> = {
  recurring: ["lastGenerated"],
  habits: ["logs"],
  reserves: ["deposits"],
  journalEntries: [
    "photo", "photos", "audio", "audios", "videoRefs", "photoRefs", "audioRefs",
    "attachmentRefs", "audioMetadataRefs",
  ],
};

// Did this item actually change? Identity first (the common case: an action
// rebuilds the array but keeps untouched items), then by value with the stamp
// itself — and any machine-maintained field — excluded.
function changedItem(before: unknown, after: unknown, ignore: readonly string[] = []): boolean {
  if (before === after) return false;
  if (!before) return true;
  const strip = (x: unknown) => {
    const rest = { ...(x as Record<string, unknown>) };
    delete rest.updatedAt;
    for (const f of ignore) delete rest[f];
    return JSON.stringify(rest);
  };
  return strip(before) !== strip(after);
}

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

// شواهد حذف سجلّات الحفظ (جلسات/مراجعات/أخطاء) تعيش داخل HifzState نفسها فتبقى
// خاصّةً بالجيل ويحملها الدمج. الحذف يكتب الشاهد، والتراجع يرفعه.
function addRecordTomb(h: HifzState, id: string): Record<string, number> {
  return { ...(h.deletedRecords ?? {}), [id]: Date.now() };
}
function liftRecordTomb(h: HifzState, id: string): Record<string, number> | undefined {
  if (!h.deletedRecords || !(id in h.deletedRecords)) return h.deletedRecords;
  const next = { ...h.deletedRecords };
  delete next[id];
  return Object.keys(next).length ? next : undefined;
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
  // يدمج مذكراتِ يومٍ واحد في مذكرةٍ واحدة (المنطق النقيّ في `mergeDay.ts`).
  // يُرجع المذكرات الأصلية كما كانت — يمرّرها المستدعي إلى `restoreJournalEntries`
  // للتراجع. `undefined` حين لا يصحّ الدمج (أقلّ من اثنتين أو تواريخ مختلفة).
  mergeJournalDay: (ids: string[]) => JournalEntry[] | undefined;
  // يعيد مذكراتٍ إلى ما كانت عليه حرفياً (تراجعُ الدمج): تُستبدل الموجودة بها
  // وتُضاف الغائبة، وتُرفع شواهدُ حذفها فلا يعيد الدمجُ السحابيّ حذفها.
  restoreJournalEntries: (entries: JournalEntry[]) => void;
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

  // الأقساط — الخطة وصفٌ للاتفاق، والدفع معاملةٌ حقيقية مربوطة بها
  addInstallmentPlan: (plan: InstallmentPlan) => void;
  updateInstallmentPlan: (id: string, updates: Partial<InstallmentPlan>) => void;
  // الإلغاء **لا يحذف** أيّ معاملةٍ سُجّلت — يوقف المطالبة فقط.
  cancelInstallmentPlan: (id: string) => void;
  reopenInstallmentPlan: (id: string) => void;
  deleteInstallmentPlan: (id: string) => void; // شاهدُ حذفٍ فقط (المعاملات تبقى)
  // يسجّل دفعةً بدورٍ واحد ويربطها بالخطة؛ يرجع معرّف المعاملة (أو "" إن رُفضت).
  recordInstallmentPayment: (
    planId: string,
    p: { role: InstallmentRole; amount: number; date?: string; installmentNo?: number; note?: string; category?: string }
  ) => string;
  // **سجّل القسط القادم بضغطةٍ واحدة** (الطريق اليوميّ): يدفع أقدم قسطٍ غير مكتمل
  // بمبلغه اليوم. يرجع معرّف المعاملة، أو "" إن لم يبقَ قسط.
  payNextInstallment: (planId: string, opts?: { amount?: number; date?: string }) => string;
  // **قسّط مصروفاً مسجَّلاً**: الشراء لم يكن كاش (مؤجّل) — تُنشأ خطةٌ إجماليّها مبلغ
  // المعاملة، وتصير المعاملة «الأصل المؤجّل» فلا تُحتسب صرفاً (الأقساط هي الصرف).
  convertTransactionToPlan: (
    txId: string,
    plan: { provider: string; name?: string; installmentAmount: number; count: number; firstDueDate: string; downPayment?: number; fees?: number; finalPayment?: number; note?: string }
  ) => string;
  // ربط/فكّ معاملةٍ قائمة بخطة — للطريق اليوميّ: سجّل المصروف كالعادة ثمّ اربطه.
  linkTransactionToPlan: (
    txId: string,
    link: { planId: string; role: InstallmentRole; installmentNo?: number }
  ) => void;
  unlinkTransactionFromPlan: (txId: string) => void;
  // سدادٌ مبكر: يسجّل **المبلغ الفعليّ وحده** ويقفل الخطة. لا مصروف وهمي للفرق.
  settleInstallmentPlan: (planId: string, amount: number, date?: string) => string;
  // تذكيرٌ متكرّر للخطة (generationMode: "reminder" — لا يولّد معاملات أبداً).
  linkInstallmentReminder: (planId: string) => void;
  // **إنشاء خطةٍ كاملة بخطوةٍ واحدة** (المسار الأساسي للأقساط): تُنشَأ الخطة،
  // وتُسجَّل الدفعة الأولى مصروفاً حقيقياً بتاريخها (لأنها خرجت فعلاً)، ويُربط
  // تذكيرٌ شهريّ — كل ذلك تلقائياً. لا تُنشأ معاملةٌ لأيّ قسطٍ قادم أبداً.
  createInstallmentPlan: (draft: {
    provider?: string; name: string;
    downPayment: number; downDate?: string;
    installmentAmount: number; count: number; firstDueDate: string;
    finalPayment?: number; category?: string; note?: string;
    recordDown?: boolean; // سجّل الدفعة الأولى مصروفاً (افتراضياً نعم)
    reminder?: boolean; // اربط تذكيراً شهرياً (افتراضياً نعم)
  }) => string;
  // **الربط التلقائي**: يربط معاملةً بقسطٍ يطابقها حين لا يحتمل غير خطةٍ واحدة.
  // يرجع اسم الخطة عند الربط، أو "" إن لم يكن هناك مرشّحٌ محسوم.
  autoLinkTransaction: (txId: string) => string;

  // الأصول الغالية وإهلاكها اليوميّ — عرضٌ محاسبيّ محض: لا معاملة، ولا أثر على
  // الميزانية اليومية ولا السقوف ولا الإحصائيات.
  addAsset: (asset: Asset) => void;
  updateAsset: (id: string, updates: Partial<Asset>) => void;
  deleteAsset: (id: string) => void;

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
  setBudgetWindow: (mode: BudgetWindowMode) => void;
  confirmSalary: () => number; // ينقل الفائض لصندوق الفوائض ويصفّر العداد؛ يرجع المبلغ
  // نقل مبلغ من فائض الميزانية اليومية إلى احتياطي محدد (ويصفّر عداد اليومية)
  sweepToReserve: (fundId: string, amount: number, note?: string) => void;
  // الاتجاه المعاكس: سحب مبلغ من احتياطي (صندوق الفوائض عادةً) وإضافته لرصيد
  // الميزانية اليومية. يرجع المبلغ المُضاف فعلاً (مقصوصاً على رصيد الصندوق).
  pullFromReserve: (fundId: string, amount: number, note?: string) => number;

  // رسائل لنفسك المستقبلية
  // الأحداث المهمّة (العدّ التنازلي) — إضافة/تعديل/حذف كبقيّة العناصر
  // المعرّفة بـid: غلاف `set` يختم `updatedAt` ويكتب شاهد الحذف تلقائياً.
  addCountdownEvent: (event: CountdownEvent) => void;
  updateCountdownEvent: (id: string, updates: Partial<CountdownEvent>) => void;
  deleteCountdownEvent: (id: string) => void;
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
  recordReview: (fromId: number, toId: number, rating?: HifzRating) => void; // مراجعة مسجّلة
  setHifzIntensity: (v: HifzIntensity) => void; // شدّة التمرين — الإعداد الوحيد
  recordRandomTest: (fromId: number, toId: number, rating?: HifzRating) => void; // اختبار مفاجئ
  // سجل الحفظ والمراجعة: تعديل التقييم أو حذف قيدٍ (مع إعادة حساب الجبهة من
  // الجلسات) والتراجع بإعادة الإضافة.
  updateHifzSession: (id: string, patch: { rating?: HifzRating }) => void;
  deleteHifzSession: (id: string) => void;
  restoreHifzSession: (session: HifzSession) => void;
  updateHifzReview: (id: string, patch: { rating?: HifzRating }) => void;
  deleteHifzReview: (id: string) => void;
  restoreHifzReview: (review: HifzReviewLog) => void;
  toggleMistakeWord: (ayahId: number, wordIndex: number | null, word?: string) => void; // تحديد/إلغاء خطأ
  recordMistakeDrill: (id: string, ok: boolean) => void; // نتيجة اختبار الموضع (طمس الكلمة)
  resolveMistake: (id: string) => void; // أُتقن الموضع (أُغلق)
  reopenMistake: (id: string) => void; // إعادة فتح خطأٍ مُتقن
  deleteMistake: (id: string) => void; // حذف الخطأ نهائياً
  toggleWird: (date: string) => void; // mark/unmark today's daily wird
  addKhatmaJuz: () => void; // read one juz (caps at 30 — the full ring)
  setKhatmaJuz: (juz: number) => void; // set progress directly (0..30)
  setKhatmaPage: (page: number) => void; // «قرأت حتى الصفحة…» (0..604) — أدقّ من الجزء
  setKhatmaPageGoal: (goal: number) => void; // هدف الصفحات اليومي (يبقى عبر الختمات)
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
        if (f !== "quranKhatma" && f in next) (stamped ??= {})[f] = Date.now();
      }
      // الختمة قيمتان مختلفتا الطبيعة في كائنٍ واحد: تقدّمُ القراءة، وهدفُ
      // الصفحات اليومي (تفضيلٌ يبقى عبر الختمات). كلٌّ بطابعه، فلا يُلغي أحدهما
      // الآخر عند الدمج.
      if (next && "quranKhatma" in next) {
        const before = prev.quranKhatma ?? EMPTY_KHATMA;
        const after = (next as Partial<AppStore>).quranKhatma ?? EMPTY_KHATMA;
        if (KHATMA_PROGRESS_FIELDS.some((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f]))) {
          (stamped ??= {}).quranKhatma = Date.now();
        }
        if (before.dailyPageGoal !== after.dailyPageGoal) {
          (stamped ??= {})[KHATMA_GOAL_FIELD] = Date.now();
        }
      }

      const patch: Record<string, unknown> = { ...next, lastUpdated: new Date().toISOString() };

      // Per-item edit stamps: every id-keyed item this change ADDED or MODIFIED
      // gets `updatedAt = now`. Without it the merge could only compare the
      // document-level `lastUpdated`, so editing an existing item on one device
      // lost to an unrelated (but later) edit on the other — a book's page
      // progress rolling back after the iPad synced. Applied centrally here so
      // no action can forget it; items that didn't change keep their old stamp
      // (compared by identity first, then by value ignoring the stamp itself).
      for (const key of STAMPED_COLLECTIONS) {
        if (!(key in patch)) continue;
        const before = prev[key] as StampedItem[] | undefined;
        const after = patch[key] as StampedItem[] | undefined;
        if (!Array.isArray(after)) continue;
        const beforeById = new Map((Array.isArray(before) ? before : []).map((x) => [x?.id, x]));
        patch[key] = after.map((item) =>
          item && changedItem(beforeById.get(item.id), item, UNSTAMPED_FIELDS[key])
            ? { ...item, updatedAt: Date.now() }
            : item
        );
      }
      // Prayer days are keyed by date, and a day is FIVE independent values —
      // so the stamp is per (date, prayer), not per day. With a whole-day stamp,
      // logging العشاء on the phone would outrank a correction to الفجر made on
      // the iPad for the same day; now each prayer carries its own stamp and the
      // merge resolves them one by one.
      if (Array.isArray(patch.prayerLogs)) {
        const before = new Map((prev.prayerLogs ?? []).map((p) => [p.date, p]));
        patch.prayerLogs = (patch.prayerLogs as PrayerLog[]).map((p) => {
          const was = before.get(p.date);
          if (was === p) return p;
          let stamps = p.prayerUpdatedAt;
          let touched = false;
          for (const name of Object.keys(p.prayers ?? {}) as PrayerName[]) {
            if (was?.prayers?.[name] === p.prayers[name]) continue;
            if (!touched) { stamps = { ...(p.prayerUpdatedAt ?? {}) }; touched = true; }
            stamps![name] = Date.now();
          }
          // A prayer CLEARED on this day is a change too — its stamp must move
          // or the other device's stale value wins it back on merge.
          for (const name of Object.keys(was?.prayers ?? {}) as PrayerName[]) {
            if (name in (p.prayers ?? {})) continue;
            if (!touched) { stamps = { ...(p.prayerUpdatedAt ?? {}) }; touched = true; }
            stamps![name] = Date.now();
          }
          return touched ? { ...p, prayerUpdatedAt: stamps } : p;
        });
      }
      // Budgets are keyed by category — likewise.
      if (Array.isArray(patch.budgets)) {
        const before = new Map((prev.budgets ?? []).map((b) => [b.category, b]));
        patch.budgets = (patch.budgets as Budget[]).map((b) =>
          changedItem(before.get(b.category), b) ? { ...b, updatedAt: Date.now() } : b
        );
      }
      // Merchant rules are a plain map — stamp the keys whose value changed
      // (namespaced in fieldUpdatedAt) so relearning a merchant on one device
      // isn't undone by the other's stale copy.
      if (patch.merchantRules) {
        const before = prev.merchantRules ?? {};
        for (const [k, v] of Object.entries(patch.merchantRules as Record<string, string>)) {
          if (before[k] !== v) (stamped ??= {})[merchantStampKey(k)] = Date.now();
        }
      }
      // Category ORDER is a property of the array, not of any item — moveCategory
      // reorders it, so it needs its own stamp for the merge to honour.
      if (Array.isArray(patch.categories) && Array.isArray(prev.categories)) {
        const ids = (xs: FinanceCategoryDef[]) => xs.map((c) => c.id).join(",");
        const nextIds = ids(patch.categories as FinanceCategoryDef[]);
        const prevIds = ids(prev.categories);
        // A pure reorder (same set, different sequence) — adds/deletes carry
        // their own item stamps/tombstones and mustn't claim ownership of order.
        if (nextIds !== prevIds &&
            [...nextIds.split(",")].sort().join() === [...prevIds.split(",")].sort().join()) {
          (stamped ??= {})[CATEGORY_ORDER_FIELD] = Date.now();
        }
      }

      if (removed) patch.deleted = { ...prev.deleted, ...removed };
      if (stamped) patch.fieldUpdatedAt = { ...prev.fieldUpdatedAt, ...stamped };
      rawSet(patch as Partial<AppStore>, replace as false);
    }) as typeof rawSet;

    // Record/lift media tombstones when a single photo/voice note/PDF is removed
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
      if (updates.attachmentRefs !== undefined) {
        const attachmentItems = (entry: JournalEntry): string[] =>
          (entry.attachmentRefs ?? [])
            .map((a) => a.hash ?? a.localData)
            .filter((value): value is string => Boolean(value));
        diff(attachmentItems(before), attachmentItems({ ...before, ...updates }), "attachments");
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
      installmentPlans: [],
      assets: [],
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
      countdownEvents: [],
      salaryDay: 27,
      budgetWindow: "salary",
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
        // بلا ختمٍ يدويّ: غلاف `set` يختم ما تغيّر فعلاً، وهو وحده الذي يعرف أنّ
        // تغييراً في الوسائط لا يُعدّ تعديلاً لمحتوى المذكرة (الوسائط تتّحد وتُحذف
        // بشواهدها). ختمٌ هنا كان يجعل إضافةَ صورةٍ — أو استكمال صور Day One —
        // يطغى على تحرير النصّ على الجهاز الآخر.
        set((s) => ({
          journalEntries: s.journalEntries.map((e) => (e.id === id ? { ...e, ...updates } : e)),
        }));
      },

      deleteJournalEntry: (id) =>
        set((s) => ({
          journalEntries: s.journalEntries.filter((e) => e.id !== id),
        })),

      mergeJournalDay: (ids) => {
        const wanted = new Set(ids);
        const originals = get().journalEntries.filter((e) => wanted.has(e.id));
        const merged = mergeDayEntries(originals);
        if (!merged) return undefined;
        // **لا شواهدَ وسائط هنا**: شواهدُ الوسائط مفتاحُها `معرّف المذكرة + هاش`
        // (راجع `applyMediaTombstones`)، والدمج لا يحذف وسيطاً — بل ينقله إلى
        // معرّف الناجية. فتمريرُه عبر `trackMediaChange` كان سيشهد على صور
        // المصادر بأنّها محذوفةٌ من مذكراتها، فتختفي عند أوّل مزامنة.
        set((s) => {
          const dropped = new Set(originals.map((e) => e.id).filter((id) => id !== merged.id));
          return {
            journalEntries: s.journalEntries
              .filter((e) => !dropped.has(e.id))
              .map((e) => (e.id === merged.id ? merged : e)),
          };
        });
        return originals;
      },

      restoreJournalEntries: (entries) =>
        set((s) => {
          const byId = new Map(entries.map((e) => [e.id, { ...e, updatedAt: Date.now() }]));
          const kept = s.journalEntries.map((e) => byId.get(e.id) ?? e);
          const present = new Set(s.journalEntries.map((e) => e.id));
          const added = entries.filter((e) => !present.has(e.id)).map((e) => byId.get(e.id)!);
          // رفعُ شاهد الحذف عن كلّ مُعاد — وإلّا أعاد `alive()` في الدمج
          // السحابيّ حذفَه فوراً (نفس علّة «التراجع عن الحذف» في addJournalEntry).
          let deleted = s.deleted;
          for (const e of entries) {
            if (deleted && e.id in deleted) {
              deleted = { ...deleted };
              delete deleted[e.id];
            }
          }
          return {
            journalEntries: [...added, ...kept],
            ...(deleted === s.deleted ? {} : { deleted }),
          };
        }),

      importDayOneEntries: (entries) => {
        let result: ImportResult = { added: 0, completed: 0, photos: 0, audio: 0 };
        set((s) => {
          const byUuid = new Map(
            s.journalEntries
              .filter((e) => e.dayOneUUID)
              .map((e) => [e.dayOneUUID as string, e] as const)
          );
          // معرّفات Day One التي ابتلعها **دمجُ يوم**: مذكرتُها لم تعد قائمة
          // بذاتها، فلا `dayOneUUID` لها في القائمة أعلاه. بلا هذه المجموعة
          // تُعيد إعادةُ الاستيراد إضافتَها مذكرةً جديدة، فيعود اليوم متشظّياً
          // بعد أن دُمج — وينسخ نصَّها مرّتين (مرّةً داخل المدموجة ومرّةً وحدها).
          const mergedUuids = new Set(
            s.journalEntries.flatMap((e) =>
              (e.mergedFrom ?? []).map((m) => m.dayOneUUID).filter(Boolean) as string[]
            )
          );
          const toAdd: JournalEntry[] = [];
          const patches = new Map<string, Partial<JournalEntry>>();
          // Ids we add or complete — their tombstones (if any) MUST be lifted,
          // or the cloud merge's alive() drops them right back on the next sync.
          const touchedIds: string[] = [];
          for (const e of entries) {
            // دُمجت سابقاً ⇒ تُتخطّى تماماً: لا تُضاف ولا تُرقَّع. ترقيعُ
            // وسائطها كان سيستبدل وسائطَ المدموجة كلَّها بوسائط مصدرٍ واحد.
            if (e.dayOneUUID && mergedUuids.has(e.dayOneUUID)) continue;
            const existing = e.dayOneUUID ? byUuid.get(e.dayOneUUID) : undefined;
            if (!existing) {
              toAdd.push(e);
              touchedIds.push(e.id);
              continue;
            }
            // إعادة الاستيراد تُكمّل النقص الجزئي: إن حمل الاستيراد صوراً/أصواتاً
            // أكثر مما لدى المذكرة (سقط بعضها سابقاً قبل دعم HEIC مثلاً)، نعتمد
            // المجموعة الأكمل بدل تخطّيها لمجرّد أنها «تحتوي صوراً». مطلقاً لا
            // يمسّ هذا content/title أو أي تعديلٍ كتبه المستخدم — التحديث
            // الوحيد الممكن هنا وسائط، أبداً نصّاً.
            const patch: Partial<JournalEntry> = {};
            const existingPhotos = existing.photos?.length ?? (existing.photo ? 1 : 0);
            const incomingPhotos = e.photos?.length ?? (e.photo ? 1 : 0);
            if (incomingPhotos > existingPhotos) { patch.photos = e.photos; patch.photo = e.photo; }
            const existingAudios = existing.audios?.length ?? (existing.audio ? 1 : 0);
            const incomingAudios = e.audios?.length ?? (e.audio ? 1 : 0);
            if (incomingAudios > existingAudios) { patch.audios = e.audios; patch.audio = e.audio; }
            // photoRefs/audioRefs (مراجع هاش من مصدرٍ رفع الوسائط إلى R2
            // مسبقاً — مستورد الذكريات) تُوحَّد لا تُستبدل: مذكرةٌ نصّية
            // موجودة (أو مستوردة سابقاً بصورةٍ واحدة) قد تكتسب مرجع صورةٍ لم
            // تحمله من قبل. هاشاتُ محتوى فتوحيدها آمنٌ دائماً (unionRefs في
            // utils.ts — نفس الدالة التي يعتمدها mergeEntryMedia عبر الأجهزة)،
            // ولا يُسقط مرجعاً موجوداً أبداً.
            const photoRefs = unionRefs(existing.photoRefs, e.photoRefs);
            if (photoRefs && photoRefs.length !== (existing.photoRefs?.length ?? 0)) {
              patch.photoRefs = photoRefs;
            }
            const audioRefs = unionRefs(existing.audioRefs, e.audioRefs);
            if (audioRefs && audioRefs.length !== (existing.audioRefs?.length ?? 0)) {
              patch.audioRefs = audioRefs;
            }
            if (Object.keys(patch).length) {
              patches.set(existing.id, patch);
              touchedIds.push(existing.id);
            }
          }
          if (!toAdd.length && !patches.size) return {}; // مطابق تماماً — لا بصمة
          // Media counts across the entries that actually changed (added or
          // completed) — تشمل الآن photoRefs/audioRefs أيضاً (مذكرة
          // .madarimport تحمل مراجع هاش لا بايتات محلية بعد)، لا الصور/الصوت
          // المحلية وحدها، وإلا بدت مذكرةٌ فيها صورة كأنها بلا صور.
          let photos = 0, audio = 0;
          for (const e of toAdd) {
            if (e.photos?.length || e.photo || e.photoRefs?.length) photos++;
            if (e.audios?.length || e.audio || e.audioRefs?.length) audio++;
          }
          for (const p of patches.values()) {
            if (p.photos?.length || p.photo || p.photoRefs?.length) photos++;
            if (p.audios?.length || p.audio || p.audioRefs?.length) audio++;
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

      // نختم updatedAt على الإضافة/التعديل فيفوز آخر تعديلٍ حقيقيٍّ عند الدمج.
      addRecurring: (r) =>
        set((s) => ({
          recurring: [...s.recurring, { ...r, updatedAt: Date.now() }],
          ...clearTombstone(s.deleted, r.id),
        })),

      updateRecurring: (id, updates) =>
        set((s) => ({
          recurring: s.recurring.map((r) =>
            r.id === id ? { ...r, ...updates, updatedAt: Date.now() } : r
          ),
        })),

      deleteRecurring: (id) =>
        set((s) => ({ recurring: s.recurring.filter((r) => r.id !== id) })),

      runRecurring: () => {
        let generated = 0;
        set((s) => {
          const now = parseDate(today());
          const newTx: Transaction[] = [];
          // كل المعرّفات الموجودة أصلاً — الحارس الذي يجعل التشغيل idempotent:
          // المعرّف الحتميّ (`rec_<rule>_<date>`) إن كان موجوداً (تشغيلٌ سابق، أو
          // وصل من جهازٍ آخر بالمزامنة) فلا تُضاف نسختُه ثانيةً. بدونه كان تراجعُ
          // `lastGenerated` (دمجٌ قديم) أو تشغيلان متتاليان يُنتِجان صفّاً مكرّراً
          // يُصلحه الدمج لاحقاً فقط — أمّا محلياً فيظهر مصروفان.
          const existingIds = new Set(s.transactions.map((t) => t.id));
          let rulesChanged = false;
          const updatedRecurring = s.recurring.map((r) => {
            if (!r.active) return r;
            // «تذكير» لا يولّد معاملةً أبداً (خطط الأقساط) — والغياب = auto.
            if (generationModeOf(r) !== "auto") return r;
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
              // Deterministic id from the rule + occurrence date so two devices
              // that each generate the same due occurrence produce the SAME id —
              // the sync merge (byId) then collapses them into one instead of
              // leaving a duplicate rent/subscription. Manual transactions keep
              // their random uid(); only auto-generated recurring ones are keyed.
              const id = `rec_${r.id}_${dueStr}`;
              if (existingIds.has(id)) continue; // موجودة سلفاً — لا تكرار
              existingIds.add(id);
              newTx.push({
                id,
                date: dueStr,
                amount: r.amount,
                category: r.category,
                note: r.note ? `${r.note} (تلقائي)` : "معاملة متكررة",
                updatedAt: Date.now(),
              });
              generated++;
            }
            // `lastGenerated` لا يرجع للخلف أبداً (حتى لو أعطت مرساةٌ معدّلة موعداً
            // أقدم)، ويتقدّم حتى لو تُخطّيت كل المواعيد كمكرّرة — فلا يُعاد فحصها.
            const last = dueDates[dueDates.length - 1];
            const nextLast = r.lastGenerated && r.lastGenerated > last ? r.lastGenerated : last;
            if (nextLast === r.lastGenerated) return r;
            rulesChanged = true;
            // بلا ختم updatedAt: التوليد إجراءٌ آليّ، وختمُه يجعله يطغى على تعديلٍ
            // حقيقيٍّ من الجهاز الآخر عند الدمج. lastGenerated يُدمج بأخذ الأحدث.
            return { ...r, lastGenerated: nextLast };
          });
          if (!newTx.length && !rulesChanged) return {};
          return {
            ...(newTx.length ? { transactions: [...newTx, ...s.transactions] } : {}),
            ...(rulesChanged ? { recurring: updatedRecurring } : {}),
          };
        });
        return generated;
      },

      // ---------- الأقساط ----------
      addInstallmentPlan: (plan) =>
        set((s) => ({
          installmentPlans: [
            { ...plan, updatedAt: Date.now() },
            ...(s.installmentPlans ?? []),
          ],
          // إعادة إضافة معرّفٍ مُحذوف (تراجع) ترفع شاهد الحذف وإلا أسقطه الدمج.
          ...clearTombstone(s.deleted, plan.id),
        })),

      updateInstallmentPlan: (id, updates) =>
        set((s) => ({
          installmentPlans: (s.installmentPlans ?? []).map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
          ),
        })),

      // الإلغاء يوقف المطالبة ويُبقي كل معاملةٍ سُجّلت (تاريخُ الصرف لا يُمسّ).
      cancelInstallmentPlan: (id) =>
        set((s) => ({
          installmentPlans: (s.installmentPlans ?? []).map((p) =>
            p.id === id ? { ...p, status: "cancelled" as const, updatedAt: Date.now() } : p
          ),
        })),

      reopenInstallmentPlan: (id) =>
        set((s) => ({
          installmentPlans: (s.installmentPlans ?? []).map((p) =>
            p.id === id ? { ...p, status: "active" as const, updatedAt: Date.now() } : p
          ),
        })),

      // حذف الخطة = شاهدُ حذفٍ (يكتبه غلاف set تلقائياً) والمعاملات تبقى كما هي:
      // ما دُفع فعلاً مصروفٌ حقيقيّ، وحذف الخطة قرارُ تنظيمٍ لا محوُ تاريخ.
      deleteInstallmentPlan: (id) =>
        set((s) => ({
          installmentPlans: (s.installmentPlans ?? []).filter((p) => p.id !== id),
        })),

      recordInstallmentPayment: (planId, p) => {
        const st = get();
        const plan = (st.installmentPlans ?? []).find((x) => x.id === planId);
        if (!plan) return "";
        const amount = round2(p.amount);
        if (!Number.isFinite(amount) || amount <= 0) return "";
        const date = p.date || today();
        // معرّفٌ عشوائيّ (لا حتميّ): الدفعة حدثٌ يدويّ يجوز تكراره بمبالغ مختلفة،
        // والحتميّة هنا كانت تدمج دفعتين حقيقيتين في واحدة.
        const id = uid();
        const roleLabel = p.role === "installment" && p.installmentNo
          ? `قسط ${p.installmentNo}`
          : p.role === "down" ? "دفعة أولى"
          : p.role === "final" ? "دفعة أخيرة"
          : p.role === "settlement" ? "سداد مبكر" : "قسط";
        const tx: Transaction = {
          id,
          date,
          amount,
          category: p.category ?? plan.category ?? st.categories[0]?.id ?? "",
          note: p.note ?? `${plan.name || plan.provider} — ${roleLabel}`,
          // دورٌ واحد فقط: الحقل مفردٌ، فلا تمثّل معاملةٌ دورين معاً.
          planId,
          planRole: p.role,
          ...(p.role === "installment" || p.role === "final"
            ? { planInstallmentNo: p.installmentNo }
            : {}),
          planLinkedAt: Date.now(),
        };
        set((s) => ({
          transactions: [{ ...tx, updatedAt: Date.now() }, ...s.transactions],
          ...clearTombstone(s.deleted, id),
        }));
        return id;
      },

      // الطريق اليوميّ #1: ضغطةٌ واحدة تسجّل القسط القادم بمبلغه في تاريخ اليوم.
      // لا اختيارَ رقمٍ ولا تاريخٍ ولا تصنيف — كلّها مشتقّة من الخطة والجدول.
      payNextInstallment: (planId, opts) => {
        const st = get();
        const plan = (st.installmentPlans ?? []).find((x) => x.id === planId);
        if (!plan) return "";
        const next = planSummary(plan, st.transactions, today()).next;
        if (!next) return "";
        // قسطٌ مدفوعٌ جزئياً (تحويلٌ ناقص سابقاً): نسجّل **الباقي عليه وحده**، وإلا
        // ضاعفنا المدفوع وأظهرنا الخطة أقرب للإتمام من حقيقتها.
        const due = rowRemaining(next);
        return get().recordInstallmentPayment(planId, {
          role: next.isFinal ? "final" : "installment",
          amount: opts?.amount ?? due,
          installmentNo: next.no,
          // تاريخ الدفع هو **يوم الدفع الفعليّ** (اليوم)، لا موعد الاستحقاق الفائت:
          // المعاملة سجلٌّ لخروج النقد، وموعدُ الاستحقاق يبقى في جدول الخطة. لو
          // كُتب التاريخ القديم لتغيّر صرفُ شهرٍ مضى وميزانيتُه المرحّلة بلا سبب.
          date: opts?.date,
        });
      },

      // «قسّط هذا المصروف»: الشراء كان **مؤجّلاً لا كاش**. المعاملة القائمة تصير
      // «الأصل المؤجّل» (deferred + planRole: "principal") فتخرج من كل حسابات
      // الصرف وتبقى في السجل كسجلٍّ للشراء، والخطة إجماليّها مبلغُها بالضبط.
      // هكذا لا يُحتسب الشراء مرّتين: الأقساط وحدها هي الصرف الفعليّ.
      convertTransactionToPlan: (txId, draft) => {
        const st = get();
        const tx = st.transactions.find((t) => t.id === txId);
        if (!tx) return "";
        const total = round2(tx.amount);
        if (!(total > 0)) return "";
        // نفس حرّاس النموذج الرئيسي تماماً — هذا طريقٌ ثانٍ لإنشاء خطة، فلا يجوز
        // أن يقبل ما يرفضه الأول: تاريخٌ صالح، وعددٌ داخل الحدّ (وإلا جدولٌ لا معنى
        // له وقائمةٌ لا تنتهي). القيمة السالبة/الصفرية للقسط مرفوضة كذلك.
        if (!isValidDateKey(draft.firstDueDate)) return "";
        if (!(draft.installmentAmount > 0)) return "";
        const rawCount = Math.floor(draft.count) || 0;
        if (rawCount < 1 || rawCount > MAX_INSTALLMENT_COUNT) return "";
        const count = rawCount;
        const planId = uid();
        const plan: InstallmentPlan = {
          id: planId,
          provider: draft.provider.trim(),
          name: (draft.name?.trim() || tx.note.trim() || draft.provider.trim()),
          totalPrice: total,
          downPayment: round2(draft.downPayment ?? 0),
          installmentAmount: round2(draft.installmentAmount),
          count,
          firstDueDate: draft.firstDueDate,
          fees: draft.fees,
          finalPayment: draft.finalPayment,
          status: "active",
          category: tx.category || undefined,
          note: draft.note,
          principalTxId: txId,
          createdAt: today(),
          updatedAt: Date.now(),
        };
        set((s) => ({
          installmentPlans: [plan, ...(s.installmentPlans ?? [])],
          transactions: s.transactions.map((t) =>
            t.id === txId
              ? {
                  ...t,
                  deferred: true,
                  planId,
                  planRole: "principal" as const,
                  planInstallmentNo: undefined,
                  planLinkedAt: Date.now(),
                  updatedAt: Date.now(),
                }
              : t
          ),
          ...clearTombstone(s.deleted, planId),
        }));
        return planId;
      },

      // الطريق اليوميّ #2: سجّل المصروف كما تفعل دائماً، ثمّ اربطه بالخطة بضغطة —
      // فلا إدخالٌ مزدوج ولا مبلغٌ يُحتسب مرّتين. الدور مفردٌ دائماً.
      linkTransactionToPlan: (txId, link) =>
        set((s) => {
          if (!(s.installmentPlans ?? []).some((p) => p.id === link.planId)) return {};
          return {
            transactions: s.transactions.map((t) =>
              t.id === txId
                ? {
                    ...t,
                    planId: link.planId,
                    planRole: link.role,
                    planInstallmentNo:
                      link.role === "installment" || link.role === "final" ? link.installmentNo : undefined,
                    // الأصل وحده مؤجّل؛ أيّ دورٍ آخر دفعةٌ نقدية فعلية.
                    deferred: link.role === "principal" ? true : undefined,
                    planLinkedAt: Date.now(),
                    updatedAt: Date.now(),
                  }
                : t
            ),
          };
        }),

      // فكّ الربط يُرجع المعاملة مصروفاً عادياً — ويرفع «التأجيل» فتُحتسب من جديد.
      unlinkTransactionFromPlan: (txId) =>
        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === txId
              ? {
                  ...t,
                  planId: undefined, planRole: undefined, planInstallmentNo: undefined,
                  planLinkedAt: undefined, deferred: undefined, updatedAt: Date.now(),
                }
              : t
          ),
          installmentPlans: (s.installmentPlans ?? []).map((p) =>
            p.principalTxId === txId ? { ...p, principalTxId: undefined, updatedAt: Date.now() } : p
          ),
        })),

      // سدادٌ مبكر: معاملةٌ واحدة بالمبلغ **الفعليّ** + إغلاق الخطة. الفرق بين ما
      // كان واجباً وما دُفع يُعرَض «موفَّراً» (planSummary.saved) ولا يُخلَق له
      // مصروفٌ ولا إيرادٌ وهميّ — لا نلوّث سجلّ الصرف بأرقامٍ لم تُنقَل.
      settleInstallmentPlan: (planId, amount, date) => {
        const st = get();
        const plan = (st.installmentPlans ?? []).find((x) => x.id === planId);
        if (!plan) return "";
        const paid = round2(amount);
        if (!Number.isFinite(paid) || paid <= 0) return "";
        const id = uid();
        const tx: Transaction = {
          id,
          date: date || today(),
          amount: paid,
          category: plan.category ?? st.categories[0]?.id ?? "",
          note: `${plan.name || plan.provider} — سداد مبكر`,
          planId,
          planRole: "settlement",
          planLinkedAt: Date.now(),
        };
        set((s) => ({
          transactions: [{ ...tx, updatedAt: Date.now() }, ...s.transactions],
          installmentPlans: (s.installmentPlans ?? []).map((x) =>
            x.id === planId ? { ...x, status: "settled" as const, updatedAt: Date.now() } : x
          ),
          ...clearTombstone(s.deleted, id),
        }));
        return id;
      },

      // تذكيرٌ متكرّر مربوطٌ بالخطة: يظهر في «القادم قريباً» و«أقرب التزام» ولا
      // يولّد معاملةً أبداً (generationMode: "reminder")، فلا يتضاعف القسط.
      linkInstallmentReminder: (planId) => {
        const st = get();
        const plan = (st.installmentPlans ?? []).find((x) => x.id === planId);
        if (!plan) return;
        if (plan.recurringId && st.recurring.some((r) => r.id === plan.recurringId)) return;
        const rid = uid();
        const day = Math.min(28, Math.max(1, parseDate(plan.firstDueDate).getDate() || 1));
        const rule: RecurringTransaction = {
          id: rid,
          amount: plan.installmentAmount,
          category: plan.category ?? st.categories[0]?.id ?? "",
          note: `${plan.name || plan.provider} (قسط)`,
          unit: "شهري",
          every: 1,
          dayOfMonth: day,
          anchorDate: plan.firstDueDate,
          active: true,
          generationMode: "reminder",
          planId,
          updatedAt: Date.now(),
        };
        set((s) => ({
          recurring: [...s.recurring, rule],
          installmentPlans: (s.installmentPlans ?? []).map((p) =>
            p.id === planId ? { ...p, recurringId: rid, updatedAt: Date.now() } : p
          ),
        }));
      },

      // **المسار الأساسي**: «اشتريتُ شيئاً بالتقسيط» في خطوةٍ واحدة. الحالة التي
      // بُني عليها: دفعةٌ أولى ١٥٠٠ ثمّ ٧٨٠ × ٦ شهور. الإجمالي يُحسب من البنود
      // (لا يُطالَب المالك بجمعه)، والدفعة الأولى تُسجَّل مصروفاً حقيقياً بتاريخها
      // لأنها **خرجت فعلاً**، والتذكير الشهري يُربط تلقائياً. الأقساط القادمة لا
      // تُنشأ لها معاملات — تبقى جدولاً حتى تُدفع (المبدأ الحاكم للأقساط).
      createInstallmentPlan: (draft) => {
        const st = get();
        const name = draft.name.trim() || (draft.provider ?? "").trim();
        const count = Math.floor(draft.count) || 0;
        if (!name) return "";
        if (!(draft.installmentAmount > 0)) return "";
        if (count < 1 || count > MAX_INSTALLMENT_COUNT) return "";
        if (!isValidDateKey(draft.firstDueDate)) return "";
        const down = round2(Math.max(0, draft.downPayment || 0));
        const downDate = draft.downDate && isValidDateKey(draft.downDate) ? draft.downDate : today();
        const finalPayment = draft.finalPayment && draft.finalPayment > 0 ? round2(draft.finalPayment) : undefined;
        const regular = finalPayment ? count - 1 : count;
        const planId = uid();
        const plan: InstallmentPlan = {
          id: planId,
          provider: (draft.provider ?? "").trim(),
          name,
          totalPrice: round2(down + regular * round2(draft.installmentAmount) + (finalPayment ?? 0)),
          downPayment: down,
          downDate,
          installmentAmount: round2(draft.installmentAmount),
          count,
          firstDueDate: draft.firstDueDate,
          finalPayment,
          status: "active",
          category: draft.category || undefined,
          note: draft.note?.trim() || undefined,
          createdAt: today(),
          updatedAt: Date.now(),
        };
        set((s) => ({
          installmentPlans: [plan, ...(s.installmentPlans ?? [])],
          ...clearTombstone(s.deleted, planId),
        }));
        // دفعةٌ أولى حقيقية = مصروفٌ حقيقيّ بتاريخه. الإيقاف متاحٌ لمن سجّلها
        // بنفسه قبل قليل، فلا تُحتسب مرّتين.
        if (down > 0 && draft.recordDown !== false) {
          get().recordInstallmentPayment(planId, { role: "down", amount: down, date: downDate });
        }
        if (draft.reminder !== false) get().linkInstallmentReminder(planId);
        return planId;
      },

      // يربط معاملةً قائمة بالقسط الذي يطابقها — بلا أن يبحث المالك عن الخطة.
      // لا يربط إلا حين يكون المرشّح وحيداً (راجع suggestPlanLink)، فلا يُنسب
      // ريالٌ لخطةٍ بالخطأ.
      autoLinkTransaction: (txId) => {
        const st = get();
        const tx = st.transactions.find((t) => t.id === txId);
        if (!tx) return "";
        const hit = suggestPlanLink(tx, st.installmentPlans ?? [], st.transactions, today());
        if (!hit) return "";
        get().linkTransactionToPlan(txId, {
          planId: hit.plan.id,
          role: hit.role,
          installmentNo: hit.row.no,
        });
        return hit.plan.name || hit.plan.provider;
      },

      // ---------- الأصول (الإهلاك) ----------
      // لا شيء هنا يلمس المعاملات: الأصل سجلُّ ملكيةٍ وقيمة، والمصروف سُجّل يوم
      // الشراء (أو في أقساطه). الإهلاك يُحسب عند العرض ولا يُخزَّن.
      addAsset: (asset) =>
        set((s) => ({
          assets: [{ ...asset, updatedAt: Date.now() }, ...(s.assets ?? [])],
          ...clearTombstone(s.deleted, asset.id),
        })),

      updateAsset: (id, updates) =>
        set((s) => ({
          assets: (s.assets ?? []).map((a) =>
            a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a
          ),
        })),

      deleteAsset: (id) =>
        set((s) => ({ assets: (s.assets ?? []).filter((a) => a.id !== id) })),

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

      // نافذة حساب السقوف: دورة الراتب (افتراضياً) أو الشهر الميلادي.
      setBudgetWindow: (mode) => set(() => ({ budgetWindow: mode })),

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

      // عكس `sweepToReserve` بالضبط: يخرج المبلغ من الصندوق (سحبٌ بقيمة سالبة،
      // نفس نموذج السحب اليدوي في بطاقة الاحتياطي) ويدخل رصيد الميزانية اليومية.
      // الإضافة تتمّ بخفض `carryAdjust` بمقدار المبلغ لا بتحريك `startDate`: المتاح
      // = amount × days − carryAdjust، فخفضُها يرفع الرصيد بالمقدار نفسه تماماً
      // دون المساس بالدورة الجارية ولا بحساب ما صُرف فيها. قيمةٌ سالبة لـ
      // carryAdjust مقصودة هنا (فوائض مضافة) ويقرؤها `computeDailyBudgetStatus`
      // كما هي. لا تُنشأ معاملةٌ: هذا تحريك رصيدٍ بين وعاءين لا صرفٌ نقديّ.
      pullFromReserve: (fundId, amount, note) => {
        let added = 0;
        set((s) => {
          const fund = s.reserves.find((f) => f.id === fundId);
          // بلا ميزانية يومية لا وعاء يستقبل المبلغ — لا نسحب من الصندوق عبثاً.
          if (!fund || !s.dailyBudget || !Number.isFinite(amount) || amount <= 0) return {};
          // لا يخرج من الصندوق أكثر مما فيه (نفس حارس السحب اليدوي).
          const balance = reserveBalance(fund, s.transactions);
          if (balance <= 0) return {};
          added = round2(Math.min(amount, balance));
          if (added <= 0) return {};
          const deposit: ReserveDeposit = {
            id: uid(),
            date: today(),
            amount: -added,
            note: note ?? "إلى الميزانية اليومية",
          };
          const carryAdjust = Number.isFinite(s.dailyBudget.carryAdjust) ? s.dailyBudget.carryAdjust! : 0;
          return {
            reserves: s.reserves.map((f) =>
              f.id === fundId ? { ...f, deposits: [deposit, ...f.deposits] } : f
            ),
            dailyBudget: { ...s.dailyBudget, carryAdjust: round2(carryAdjust - added) },
          };
        });
        return added;
      },

      addCountdownEvent: (event) =>
        set((s) => ({ countdownEvents: [event, ...(s.countdownEvents ?? [])] })),

      updateCountdownEvent: (id, updates) =>
        set((s) => ({
          countdownEvents: (s.countdownEvents ?? []).map((e) =>
            e.id === id ? { ...e, ...updates } : e
          ),
        })),

      deleteCountdownEvent: (id) =>
        set((s) => ({
          countdownEvents: (s.countdownEvents ?? []).filter((e) => e.id !== id),
        })),

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
              plan: null, frontierId: 0, sessions: [], reviews: [],
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
          const now = Date.now();
          const session = { id: uid(), date: today(), fromId: from, toId: to, rating, at: now, updatedAt: now };
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

      // تسجيل مراجعة مقطعٍ محفوظ. جدول المباعدة كلُّه مُشتقٌّ من هذا السجلّ
      // (راجع pageSchedules) — لا مؤشّر دورةٍ ولا حالةَ جدولةٍ منفصلة تُحفظ.
      recordReview: (fromId, toId, rating) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          const now = Date.now();
          const log = { id: uid(), date: today(), fromId, toId, rating, at: now, updatedAt: now };
          return { quranHifz: { ...h, reviews: [log, ...h.reviews] } };
        }),

      // شدّة التمرين — الإعداد الوحيد في القسم. يعيش داخل الخطة فيُزامَن، ونختم
      // planUpdatedAt فيفوز آخر تغييرٍ عند الدمج بين جهازين.
      setHifzIntensity: (v) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          if (!h.plan) return {};
          return { quranHifz: { ...h, plan: { ...h.plan, intensity: v }, planUpdatedAt: Date.now() } };
        }),

      // اختبار مفاجئ: يُسجَّل كمراجعةٍ (بلا تحريك مؤشّر الدورة) ويضبط تاريخ آخر
      // اختبارٍ حتى تُحسب دوريّته.
      recordRandomTest: (fromId, toId, rating) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          const now = Date.now();
          const log = { id: uid(), date: today(), fromId, toId, rating, at: now, updatedAt: now };
          return { quranHifz: { ...h, reviews: [log, ...h.reviews], lastTestDate: today() } };
        }),

      // ---- سجل الحفظ: تعديل/حذف/تراجع مع إعادة حساب الجبهة من الجلسات ----
      // الجبهة = أبعد آيةٍ في الجلسات الباقية (وإلا ما قبل البداية)؛ نختم
      // frontierUpdatedAt فينتشر التصحيح ويبقى الرسمُ والسجلّ متّسقَين (لا رقمٌ
      // يخالف السجلّ). التقييم تحريرٌ محضٌ لا يمسّ الجبهة.
      updateHifzSession: (id, patch) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          // نختم updatedAt فيفوز آخر تعديلِ تقييمٍ عند الدمج بين جهازين.
          return { quranHifz: { ...h, sessions: h.sessions.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: Date.now() } : x)) } };
        }),

      deleteHifzSession: (id) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          const sessions = h.sessions.filter((x) => x.id !== id);
          const floor = Math.max(0, (h.plan?.startId ?? 1) - 1);
          const frontierId = sessions.reduce((mx, x) => Math.max(mx, x.toId), floor);
          // شاهدُ حذفٍ حتى لا يُعيد اتّحادُ المزامنة الجلسةَ من جهازٍ قديم.
          return { quranHifz: { ...h, sessions, frontierId, frontierUpdatedAt: Date.now(), deletedRecords: addRecordTomb(h, id) } };
        }),

      restoreHifzSession: (session) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          if (h.sessions.some((x) => x.id === session.id)) return {};
          const sessions = [session, ...h.sessions];
          const floor = Math.max(0, (h.plan?.startId ?? 1) - 1);
          const frontierId = sessions.reduce((mx, x) => Math.max(mx, x.toId), floor);
          // التراجع يرفع الشاهد فتعود الجلسة وتصمد أمام الدمج.
          return { quranHifz: { ...h, sessions, frontierId, frontierUpdatedAt: Date.now(), deletedRecords: liftRecordTomb(h, session.id) } };
        }),

      updateHifzReview: (id, patch) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          return { quranHifz: { ...h, reviews: h.reviews.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: Date.now() } : x)) } };
        }),

      deleteHifzReview: (id) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          return { quranHifz: { ...h, reviews: h.reviews.filter((x) => x.id !== id), deletedRecords: addRecordTomb(h, id) } };
        }),

      restoreHifzReview: (review) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          if (h.reviews.some((x) => x.id === review.id)) return {};
          return { quranHifz: { ...h, reviews: [review, ...h.reviews], deletedRecords: liftRecordTomb(h, review.id) } };
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
            if (hits.length === 0) {
              next.splice(idx, 1);
              // شاهدُ حذفٍ: بلا شاهدٍ كان اتّحادُ الدمج يُعيد الوسمَ الملغى من
              // السحابة إن كان قد زامَن قبل التراجع، فيبدو أنّه لا يُزال أبداً.
              return { quranHifz: { ...h, mistakes: next, deletedRecords: addRecordTomb(h, cur.id) } };
            }
            next[idx] = { ...cur, hits, resolved: false, updatedAt: t };
          } else {
            // تكرارٌ في يومٍ جديد — أضِف ضربةً وأعِد الفتح.
            next[idx] = { ...cur, hits: [...cur.hits, t], word: word ?? cur.word, resolved: false, updatedAt: t };
          }
          return { quranHifz: { ...h, mistakes: next } };
        }),

      // نتيجة اختبار موضع الخطأ (المُختبِر يطمس الكلمة ثمّ تكشف): النجاح يرفع
      // السلسلة، وبلوغُها MISTAKE_MASTERY يُغلق الموضع تلقائياً بلا سؤال. الخطأ
      // يُضيف ضربةً (فيرتفع العدّاد) ويصفّر السلسلة فيعود الموضع لاختبار الغد.
      recordMistakeDrill: (id, ok) =>
        set((s) => {
          const h = s.quranHifz ?? EMPTY_HIFZ;
          const t = today();
          const mistakes = (h.mistakes ?? []).map((m) => {
            if (m.id !== id) return m;
            if (ok) {
              const okStreak = (m.okStreak ?? 0) + 1;
              return { ...m, okStreak, lastDrill: t, resolved: okStreak >= MISTAKE_MASTERY, updatedAt: t };
            }
            // ضربةٌ واحدة لليوم مهما تكرّر الاختبار فيه (العدّاد تاريخُ أيامٍ لا نقرات).
            const hits = m.hits[m.hits.length - 1] === t ? m.hits : [...m.hits, t];
            return { ...m, hits, okStreak: 0, lastDrill: t, resolved: false, updatedAt: t };
          });
          return { quranHifz: { ...h, mistakes } };
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
          // شاهدُ حذفٍ نهائيّ فلا يُعيد اتّحادُ الدمج الخطأَ من جهازٍ قديم.
          return { quranHifz: { ...h, mistakes: list.filter((m) => m.id !== id), deletedRecords: addRecordTomb(h, id) } };
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
              page: undefined, // العدّ بالجزء يُلغي تتبّع الصفحة (وضعان لا يختلطان)
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
              page: undefined, // تعديل الأجزاء يدوياً يُلغي التتبّع بالصفحة
              startDate: clamped > 0 ? (k.startDate ?? today()) : undefined,
              lastReadDate: clamped > 0 ? today() : k.lastReadDate,
            },
          };
        }),

      // تسجيل الصفحة التي بلغها (أدقّ من جزءٍ كامل): تُشتَقّ منها الأجزاء التي
      // تُضيء الحلقة والنسبة، ويُقدَّر موعد الإتمام على الوتيرة الأخيرة. نُضيف
      // نقطةً لسجلّ التقدّم (نقطة لكلّ تاريخ، الأحدث تفوز، محدود بآخر ~45 يوماً).
      setKhatmaPage: (page) =>
        set((s) => {
          const k = s.quranKhatma ?? EMPTY_KHATMA;
          const p = Math.min(Math.max(Math.round(page) || 0, 0), 604);
          const todayStr = today();
          let pageLog = k.pageLog;
          if (p > 0) {
            const cutoff = toDateStr(new Date(Date.now() - 45 * 86400000));
            pageLog = [
              ...(k.pageLog ?? []).filter((e) => e.date !== todayStr && e.date >= cutoff),
              { date: todayStr, page: p },
            ].sort((a, b) => a.date.localeCompare(b.date));
          }
          return {
            quranKhatma: {
              ...k,
              page: p,
              juz: khatmaJuzForPage(p),
              pageLog,
              startDate: p > 0 ? (k.startDate ?? todayStr) : k.startDate,
              lastReadDate: p > 0 ? todayStr : k.lastReadDate,
            },
          };
        }),

      // هدف الصفحات اليومي — تفضيلٌ شخصي يبقى عبر الختمات (لا يُمسح عند الختم/الإعادة).
      setKhatmaPageGoal: (goal) =>
        set((s) => {
          const k = s.quranKhatma ?? EMPTY_KHATMA;
          return { quranKhatma: { ...k, dailyPageGoal: Math.min(Math.max(Math.round(goal) || 0, 1), 100) } };
        }),

      // الختم/الإعادة يبدآن ختمةً جديدة: يُمسح سجلّ التقدّم (وتيرةٌ جديدة) ويبقى
      // هدف الصفحات اليومي كتفضيلٍ شخصي.
      completeKhatma: () =>
        set((s) => {
          const k = s.quranKhatma ?? EMPTY_KHATMA;
          return { quranKhatma: { juz: 0, page: 0, completed: k.completed + 1, startDate: today(), lastReadDate: today(), dailyPageGoal: k.dailyPageGoal } };
        }),

      resetKhatma: () =>
        set((s) => {
          const k = s.quranKhatma ?? EMPTY_KHATMA;
          return { quranKhatma: { juz: 0, page: 0, completed: k.completed, dailyPageGoal: k.dailyPageGoal } };
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
          installmentPlans: data.installmentPlans ?? [],
          // الأصول كانت غائبةً هنا رغم وجودها في snapshot والدمج والنسخة
          // الاحتياطية: فكان أصلٌ قادمٌ من السحابة (أو من ملفٍ مُستعاد) لا يدخل
          // المتجر أبداً. أيّ حقلٍ في AppData يجب أن يُغطّى في الستة كلّها
          // (snapshot · hydrate · normalizeBackup · mergeAppData · hasData ·
          // cloudHasUnseen) — راجع CLAUDE.md.
          assets: data.assets ?? [],
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
          countdownEvents: data.countdownEvents ?? [],
          salaryDay: data.salaryDay ?? 27,
          budgetWindow: data.budgetWindow ?? "salary",
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
          assets: s.assets ?? [],
          books: s.books,
          readingLogs: s.readingLogs,
          journalEntries: s.journalEntries,
          habits: s.habits,
          recurring: s.recurring,
          installmentPlans: s.installmentPlans ?? [],
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
          countdownEvents: s.countdownEvents ?? [],
          salaryDay: s.salaryDay,
          budgetWindow: s.budgetWindow ?? "salary",
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
      version: 15,
      // التخزين المؤجَّل لا الخام: كلّ تعديلٍ كان يُسلسل المتجر كاملاً ويكتبه
      // (~153ms على جوّالٍ متوسّط ببيانات سنوات). التفصيل والقياس في
      // `persistScheduler.ts`، والإفراغ عند إخفاء الصفحة في `idbStorage.ts`.
      storage: createJSONStorage(() => persistedIdbStorage),
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
            quranHifz: st.quranHifz ?? { plan: null, frontierId: 0, sessions: [], reviews: [] },
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

        // v14 يُضيف الأقساط (`installmentPlans`) ويُصرّح بدلالة الالتزامات المتكرّرة
        // القديمة: كلّها كانت تولّد معاملاتٍ تلقائياً، فتُختم `generationMode:
        // "auto"` صراحةً (والغياب يبقى مقروءاً auto عبر generationModeOf، فالبيانات
        // القادمة من جهازٍ لم يُرقَّ بعد تعمل كما كانت). `updatedAt: 0` كي يفوز
        // عليها أيّ تعديلٍ حقيقيٍّ لاحق في الدمج، ولا تطغى ترقيةٌ على تعديلٍ حديث
        // من الجهاز الآخر. لا معاملةً تُنشأ ولا تُحذف في هذه المهاجرة.
        if (version < 14) {
          const rec = ((state.recurring as RecurringTransaction[]) ?? []).map((r) => ({
            ...r,
            generationMode: r.generationMode ?? ("auto" as const),
            updatedAt: r.updatedAt ?? 0,
          }));
          state = {
            ...state,
            recurring: rec,
            installmentPlans: state.installmentPlans ?? [],
          };
        }

        // v15 يفتح «الأصول»: مجموعةٌ جديدة فارغة لا تمسّ أيّ بياناتٍ قائمة.
        // كلّ قارئٍ يستعمل `assets ?? []` أصلاً، فالمهاجرة هنا للوضوح لا للإنقاذ.
        if (version < 15) {
          state = { ...state, assets: state.assets ?? [] };
        }

        return state as unknown as AppData;
      },
    }
  )
);
