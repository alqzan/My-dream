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

export const DEFAULT_CATEGORIES: FinanceCategoryDef[] = [
  { id: "cat-essentials", label: "أساسيات", icon: "🧺", color: "#e07b39", allowSubs: true },
  { id: "cat-luxuries", label: "كماليات", icon: "✨", color: "#9b6fcd", allowSubs: true },
  { id: "cat-investment", label: "استثمار", icon: "📊", color: "#256128" },
  { id: "cat-charity", label: "صدقة", icon: "🤲", color: "#1f7a6c" },
  { id: "cat-others", label: "للآخرين", icon: "🎁", color: "#4a9fbd" },
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
  mood?: "ممتاز" | "جيد" | "محايد" | "سيء" | "سيء_جداً";
  tags?: string[];
  photo?: string; // base64 WebP compressed — legacy single photo
  photos?: string[]; // عدة صور للمذكرة (الأحدث؛ photo يبقى للتوافق)
  audio?: string; // ملاحظة صوتية (base64 data URL) — تُزامَن كمستند وسائط مستقل
  linkedBookId?: string;
  linkedTransactionIds?: string[];
  source?: "dayOne" | "manual";
  dayOneUUID?: string;
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
  dailyBudget: DailyBudget | null;
  monthlyIncome: number | null; // shared by %-based budgets and the daily budget editor
  futureLetters: FutureLetter[];
  salaryDay: number; // يوم نزول الراتب (افتراضياً 27) — يظهر بعده سؤال «نزل الراتب؟»
  lastSalaryConfirm: string | null; // YYYY-MM-DD لآخر تأكيد «نزل الراتب»
  // Learned merchant → category id map. When you categorize an expense by
  // hand, the merchant (from the note) is remembered so the next one from the
  // same place is auto-classified your way — this is what makes it تلقائي.
  merchantRules: Record<string, string>;
  lastUpdated: string;
}

export const MOOD_LABELS = {
  ممتاز: { label: "ممتاز", icon: "😄" },
  جيد: { label: "جيد", icon: "😊" },
  محايد: { label: "محايد", icon: "😐" },
  سيء: { label: "سيء", icon: "😔" },
  سيء_جداً: { label: "سيء جداً", icon: "😞" },
};
