// Categories are fully user-managed (add/rename/delete freely), the same
// way habits are — not a fixed list. Transactions/recurring rules/budgets
// reference a category by id; DEFAULT_CATEGORIES below just seeds new
// accounts with a starting set.
// Two levels: a main category (no parentId) and its sub-categories
// (parentId = the main category's id). Totals/budgets roll up to the main.
export interface FinanceCategoryDef {
  id: string;
  label: string;
  icon: string;
  color: string;
  parentId?: string;
  // Only mains with this flag get sub-categories (per the user's setup:
  // أساسيات وكماليات فقط) — the sub row/inline-add UI hides elsewhere.
  allowSubs?: boolean;
}

// Colors drawn from the app's warm Andalusian palette (terracotta / gold /
// green / teal / soft purple) so the finance charts sit in the same theme.
export const DEFAULT_CATEGORIES: FinanceCategoryDef[] = [
  { id: "cat-essentials", label: "أساسيات", icon: "🧺", color: "#c1663f", allowSubs: true },
  { id: "cat-luxuries", label: "كماليات", icon: "✨", color: "#c9852a", allowSubs: true },
  { id: "cat-investment", label: "استثمار", icon: "📊", color: "#3d9640" },
  { id: "cat-charity", label: "صدقة", icon: "🤲", color: "#1f7a6c" },
  { id: "cat-others", label: "للآخرين", icon: "🎁", color: "#8a6fb0" },
];

// Shown for a transaction/budget whose category was since deleted, instead
// of crashing or silently dropping the entry.
export const UNKNOWN_CATEGORY: FinanceCategoryDef = { id: "", label: "غير مصنف", icon: "📌", color: "#888" };

// How an expense is funded. By default 100% comes out of the daily
// cumulative budget; `reserveSplits` moves part (or all) of it onto one or
// more reserve funds instead — e.g. a gift paid 50% from the daily budget
// and 50% from the الاحتياطي envelope. The percentages here are the reserve
// shares; whatever remains up to 100% is the daily-budget share.
export interface ReserveSplit {
  fundId: string; // ReserveFund id
  pct: number; // 1-100
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  category: string; // FinanceCategoryDef id
  note: string;
  linkedJournalId?: string;
  reserveSplits?: ReserveSplit[];
  // ختم آخر تعديل (ms). يستخدمه دمج المزامنة ليفوز التعديل الأحدث لهذا العنصر
  // بعينه، لا التعديل من الجهاز صاحب أحدث ختم على مستوى المستند كله.
  updatedAt?: number;
}

// ===================== Reserve funds (الاحتياطي) =====================

// A labeled envelope of money set aside for a purpose (rent, a trip, ...).
// Deposits top it up; expenses charged to it via reserveSplits drain it.
// Its live balance is always derived: sum(deposits) − sum(charged shares),
// so editing/deleting a transaction can never desync the fund.
export interface ReserveDeposit {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // positive = تعبئة, negative = سحب يدوي
  note?: string;
}

export interface ReserveFund {
  id: string;
  name: string; // e.g. "الإيجار", "سفرة الصيف"
  icon: string; // any emoji
  color: string;
  target?: number; // optional goal amount for the envelope
  deposits: ReserveDeposit[];
  createdAt: string; // YYYY-MM-DD
}

export interface Book {
  id: string;
  title: string;
  author: string;
  totalPages: number;
  currentPage: number;
  status: "أقرأ" | "أنهيت" | "أريد_قراءة";
  startDate?: string;
  finishDate?: string;
  coverColor?: string;
  rating?: number; // 1-5
  notes?: string;
}

export interface ReadingLog {
  id: string;
  bookId: string;
  date: string; // YYYY-MM-DD
  pagesRead: number;
  minutesRead?: number;
}

export interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  title?: string; // عنوان اليوم — يظهر فوق بخط أكبر وغامق
  time?: string; // HH:MM وقت الكتابة
  question?: string; // سؤال اليوم الذي كُتبت حوله المذكرة
  content: string;
  tags?: string[];
  photo?: string; // base64 WebP compressed — legacy single photo
  photos?: string[]; // عدة صور للمذكرة (الأحدث؛ photo يبقى للتوافق)
  audio?: string; // ملاحظة صوتية (base64 data URL) — الأولى؛ audios يحمل الكل
  audios?: string[]; // عدة ملاحظات صوتية (audio يبقى للتوافق = الأولى)
  // إشارات مقاطع فيديو مستوردة من Day One — لا يُخزَّن الملف نفسه (كبير ولا
  // يتزامن)، فقط تذكير بأن التدوينة فيها مقطع (النوع + المدة إن وُجدت).
  videoRefs?: { type?: string; duration?: number }[];
  linkedBookId?: string;
  linkedTransactionIds?: string[];
  source?: "dayOne" | "manual";
  dayOneUUID?: string;
  starred?: boolean;
  // ختم آخر تعديل (ms) — يفوز به التعديل الأحدث لهذه المذكرة بعينها في دمج
  // المزامنة، فلا يضيع تعديلٌ حديث على جهاز بسبب ختم مستندٍ أحدث على جهاز آخر.
  updatedAt?: number;
}

export interface Habit {
  id: string;
  name: string;
  icon: string;
  color: string;
  logs: string[]; // dates YYYY-MM-DD
}

// ===================== Prayers =====================

export type PrayerName = "الفجر" | "الظهر" | "العصر" | "المغرب" | "العشاء";

export const PRAYERS: PrayerName[] = ["الفجر", "الظهر", "العصر", "المغرب", "العشاء"];

// لم: لم تُصلَّ بعد · منفردة: صليت وحدك · جماعة: صليت بالمسجد/جماعة
export type PrayerStatus = "لم" | "منفردة" | "جماعة";

export interface PrayerLog {
  date: string; // YYYY-MM-DD
  prayers: Partial<Record<PrayerName, PrayerStatus>>;
}

export const PRAYER_META: Record<PrayerName, { icon: string; angle: number }> = {
  // angle: stylised position (degrees) along the dawn→night sky arc widget
  الفجر: { icon: "🌅", angle: 172 },
  الظهر: { icon: "☀️", angle: 116 },
  العصر: { icon: "🌤️", angle: 74 },
  المغرب: { icon: "🌇", angle: 36 },
  العشاء: { icon: "🌙", angle: 8 },
};

export const PRAYER_STATUS_META: Record<PrayerStatus, { label: string; short: string; color: string }> = {
  لم: { label: "لم تُصلَّ بعد", short: "لم", color: "#cbb894" },
  منفردة: { label: "صليت منفرداً", short: "منفردة", color: "#dc9f3c" },
  جماعة: { label: "صليت بالمسجد", short: "بالمسجد", color: "#1f7a6c" },
};

// Base repeat unit — "every" multiplies it, so (unit: شهري, every: 6) is a
// semi-annual expense, (every: 12) is annual, (every: 18) every year and a
// half, and so on — arbitrary spacing instead of a fixed monthly/yearly pair.
export type RecurringUnit = "أسبوعي" | "شهري";

export interface RecurringTransaction {
  id: string;
  amount: number;
  category: string; // FinanceCategoryDef id
  note: string;
  unit: RecurringUnit;
  every: number; // repeat every N units
  dayOfMonth: number; // weekday 0-6 for أسبوعي, day-of-month 1-28 for شهري
  anchorDate: string; // YYYY-MM-DD — first occurrence; interval phase is counted from here
  active: boolean;
  lastGenerated?: string; // YYYY-MM-DD of last auto-created instance
}

// Quick presets shown in the UI on top of the free "every N" input.
export const RECURRING_PRESETS: { label: string; unit: RecurringUnit; every: number }[] = [
  { label: "أسبوعي", unit: "أسبوعي", every: 1 },
  { label: "كل أسبوعين", unit: "أسبوعي", every: 2 },
  { label: "شهري", unit: "شهري", every: 1 },
  { label: "كل شهرين", unit: "شهري", every: 2 },
  { label: "ربع سنوي", unit: "شهري", every: 3 },
  { label: "كل 4 أشهر", unit: "شهري", every: 4 },
  { label: "نصف سنوي", unit: "شهري", every: 6 },
  { label: "سنوي", unit: "شهري", every: 12 },
];

// A monthly cap on a main category — either a fixed SAR amount or a
// percentage of the monthly income (pct wins when both are set, and the
// effective cap follows the income automatically if it changes).
export interface Budget {
  category: string; // FinanceCategoryDef id
  limit?: number; // fixed monthly cap in SAR
  pct?: number; // 1-100 — share of monthlyIncome
}

// A personal daily spending allowance that rolls over — under-spend one day
// and it cushions the next, overspend and it eats into it. Cumulative since
// startDate, not reset every calendar month.
export interface DailyBudget {
  amount: number; // SAR per day — always the resolved figure every calculation uses
  startDate: string; // YYYY-MM-DD — changing the amount resets this to today
  // Set when the amount was derived as a percentage of monthly income
  // (amount = monthlyIncome × incomePct / 100 / 30) — kept so the editor
  // can reopen in that mode and the card can explain where the number
  // came from. Absent for a plain fixed amount.
  monthlyIncome?: number;
  incomePct?: number;
  // Adjustment subtracted from the cumulative allowance after a سحب/ترحيل
  // (نزول الراتب / نقل الفائض للاحتياطي). Lets the new cycle start from today
  // (so same-day-after expenses still count) without re-granting the day's
  // allowance that was already settled by the sweep. Absent = plain cycle.
  carryAdjust?: number;
}

// رسالة لنفسك المستقبلية — تُقفل حتى تاريخ التسليم ثم تُفتح باحتفال.
export interface FutureLetter {
  id: string;
  writtenDate: string; // YYYY-MM-DD
  deliveryDate: string; // YYYY-MM-DD
  title?: string;
  content: string;
  opened?: boolean;
  openedDate?: string;
}

// ===================== القرآن =====================

// تأمّل على آية — نصّ حرّ يكتبه المستخدم مربوطاً باختيارٍ حرّ لأي آية أو مقطع
// (سورة + مدى آيات). reference نصّ مشتقّ للعرض والتوافق مع التأمّلات القديمة.
export interface QuranReflection {
  id: string;
  date: string; // YYYY-MM-DD
  surah?: number; // 1..114 (اختياري — قد يكون تأمّلاً حرّاً بلا مرجع)
  fromAyah?: number;
  toAyah?: number;
  reference?: string; // مرجع نصّي مشتقّ (مثل «الرعد 28») — للعرض والتوافق القديم
  text: string; // نصّ التأمّل
  createdAt: string; // YYYY-MM-DD وقت الإنشاء (للترتيب الثانوي)
}

// ===================== خطة الحفظ (متتابعة) =====================
// الحفظ متتابعٌ عبر المصحف من نقطة بداية مختارة: «جبهة الحفظ» (frontierId) هي
// آخر آية محفوظة، ويتقدّم الوردُ اليومي منها للأمام حسب الخطة. لا قفز بين السور
// — تُكمل من حيث وقفت. مع تقييم ذاتي ومراجعة دورية دوّارة لكلّ المحفوظ.

// وحدة الورد اليومي — آية، ربع وجه، نصف وجه، أو وجه كامل. مرنة «على كيفك».
export type HifzUnit = "ayah" | "quarter" | "half" | "page";

export interface HifzPlan {
  startId: number; // المعرّف العام لأوّل آية في الخطة (نقطة البداية)
  unit: HifzUnit; // وحدة الورد اليومي
  amount: number; // كم وحدة يومياً (≥ 1)
  createdAt: string; // YYYY-MM-DD
  reviewWindowPages?: number; // حجم نافذة المراجعة المتحرّكة بالأوجه (افتراضي 5)
}

// تقييم ذاتي للحفظ/المراجعة: 1 يحتاج إتقاناً · 2 جيّد · 3 متقن.
export type HifzRating = 1 | 2 | 3;

export interface HifzSession {
  id: string;
  date: string; // YYYY-MM-DD
  fromId: number; // أوّل آية حُفظت في الجلسة
  toId: number; // آخر آية
  rating?: HifzRating;
}

export interface HifzReviewLog {
  id: string;
  date: string; // YYYY-MM-DD
  fromId: number;
  toId: number;
  rating?: HifzRating;
}

// خطأ محفوظ في موضعٍ من المصحف — إمّا كلمةٌ بعينها (wordIndex) أو الآية كاملةً
// (wordIndex = null). المفتاح المنطقي هو `ayahId:wordIndex`. طول `hits` هو عدد
// مرّات تكرار الخطأ في هذا الموضع (تاريخٌ لكل مرّة)، فيُعرَف الخطأ المتكرّر.
export interface HifzMistake {
  id: string;
  ayahId: number; // معرّف الآية العام (1..6236)
  wordIndex: number | null; // فهرس الكلمة داخل الآية، أو null للآية كاملة
  word?: string; // نصّ الكلمة (للعرض دون تحميل المصحف)
  hits: string[]; // تواريخ وقوع الخطأ YYYY-MM-DD — طولها = عدد التكرار
  resolved: boolean; // أُتقن (أُغلق)
  updatedAt: string; // YYYY-MM-DD
}

export interface HifzState {
  plan: HifzPlan | null;
  frontierId: number; // آخر آية محفوظة (0 = لم يبدأ)
  sessions: HifzSession[]; // سجلّ الحفظ (تتابعي)
  reviews: HifzReviewLog[]; // سجلّ المراجعات الدورية
  reviewCursorId: number; // موضع دوران المراجعة الدورية داخل المحفوظ (0 = من البداية)
  mistakes?: HifzMistake[]; // مواضع الأخطاء المُحدَّدة أثناء المراجعة
  lastTestDate?: string; // آخر يومٍ ظهر فيه الاختبار العشوائي (لدوريّته)
}

export const EMPTY_HIFZ: HifzState = {
  plan: null,
  frontierId: 0,
  sessions: [],
  reviews: [],
  reviewCursorId: 0,
  mistakes: [],
};

// حالة الختمة الجارية + عدّاد الختمات المكتملة (يقود «مدار الختمة»).
export interface KhatmaState {
  juz: number; // 0..30 عدد الأجزاء المقروءة في الختمة الحالية
  startDate?: string; // YYYY-MM-DD بداية الختمة الحالية
  completed: number; // عدد الختمات المكتملة
  lastReadDate?: string; // YYYY-MM-DD آخر يوم سُجّل فيه جزء
}

export const EMPTY_KHATMA: KhatmaState = { juz: 0, completed: 0 };

// اسم صندوق الفوائض الذي يستقبل باقي الميزانية اليومية عند نزول الراتب.
export const SURPLUS_FUND_NAME = "الفوائض";

export interface AppData {
  transactions: Transaction[];
  books: Book[];
  readingLogs: ReadingLog[];
  journalEntries: JournalEntry[];
  habits: Habit[];
  recurring: RecurringTransaction[];
  budgets: Budget[];
  categories: FinanceCategoryDef[];
  reserves: ReserveFund[];
  prayerLogs: PrayerLog[];
  // القرآن: تأمّلات ومحفوظات (مفاتيح id تُختم عند الحذف)، أيام الوِرد اليومي
  // (تُوحَّد كسجلّات العادات)، وحالة الختمة (مفردة، الأحدث يفوز).
  quranReflections: QuranReflection[];
  quranHifz: HifzState; // خطة الحفظ المتتابعة (بديلة عن قائمة المحفوظات القديمة)
  quranWird: string[]; // dates YYYY-MM-DD أُتمّ فيها الوِرد اليومي
  quranKhatma: KhatmaState;
  dailyBudget: DailyBudget | null;
  monthlyIncome: number | null; // shared by %-based budgets and the daily budget editor
  futureLetters: FutureLetter[];
  salaryDay: number; // يوم نزول الراتب (افتراضياً 27) — يظهر بعده سؤال «نزل الراتب؟»
  lastSalaryConfirm: string | null; // YYYY-MM-DD لآخر تأكيد «نزل الراتب»
  readingGoal: number | null; // هدف عدد الكتب المُنهاة هذا العام (null = بلا هدف)
  // العادات المجمّدة مؤقتاً — مفاتيح للبطاقات الموقوفة في «عاداتي اليوم»: مفتاح
  // العادة المخصّصة هو معرّفها (id)، والعادات الأساسية بمفاتيح ثابتة
  // ("core:journal" · "core:reading" · "core:hifz" · "core:wird"). البطاقة
  // المجمّدة تختفي من قائمة اليوم ولا تُحتسب ولا تكسر السلسلة، وتُستأنف متى شئت.
  frozenHabits?: string[];
  // Learned merchant → category id map. When you categorize an expense by
  // hand, the merchant (from the note) is remembered so the next one from the
  // same place is auto-classified your way — this is what makes it تلقائي.
  merchantRules: Record<string, string>;
  // Tombstones: id → deletedAt (ms). A deleted item is recorded here so the
  // multi-device union-merge can't resurrect it from a device that still holds
  // a copy. Pruned after a wide window so the map can't grow forever.
  deleted?: Record<string, number>;
  lastUpdated: string;
}
