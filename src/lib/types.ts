export type FinanceCategory =
  | "إيجار"
  | "مواصلات"
  | "طعام"
  | "صحة"
  | "تعليم"
  | "كمالي"
  | "سفر"
  | "ادخار"
  | "استثمار"
  | "أخرى";

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  category: FinanceCategory;
  note: string;
  linkedJournalId?: string;
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
  content: string;
  mood?: "ممتاز" | "جيد" | "محايد" | "سيء" | "سيء_جداً";
  tags?: string[];
  photo?: string; // base64 WebP compressed
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
  category: FinanceCategory;
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

export interface Budget {
  category: FinanceCategory;
  limit: number; // monthly cap in SAR
}

export interface AppData {
  transactions: Transaction[];
  books: Book[];
  readingLogs: ReadingLog[];
  journalEntries: JournalEntry[];
  habits: Habit[];
  recurring: RecurringTransaction[];
  budgets: Budget[];
  prayerLogs: PrayerLog[];
  lastUpdated: string;
}

export const CATEGORY_LABELS: Record<FinanceCategory, { label: string; icon: string; color: string }> = {
  إيجار: { label: "إيجار", icon: "🏠", color: "#e07b39" },
  مواصلات: { label: "مواصلات", icon: "🚗", color: "#7c6fcd" },
  طعام: { label: "طعام", icon: "🍽️", color: "#e07b39" },
  صحة: { label: "صحة", icon: "❤️", color: "#e05555" },
  تعليم: { label: "تعليم", icon: "📚", color: "#3d9640" },
  كمالي: { label: "كمالي", icon: "✨", color: "#9b6fcd" },
  سفر: { label: "سفر", icon: "✈️", color: "#4a9fbd" },
  ادخار: { label: "ادخار", icon: "🏦", color: "#2d7a30" },
  استثمار: { label: "استثمار", icon: "📊", color: "#256128" },
  أخرى: { label: "أخرى", icon: "📌", color: "#888" },
};

export const MOOD_LABELS = {
  ممتاز: { label: "ممتاز", icon: "😄" },
  جيد: { label: "جيد", icon: "😊" },
  محايد: { label: "محايد", icon: "😐" },
  سيء: { label: "سيء", icon: "😔" },
  سيء_جداً: { label: "سيء جداً", icon: "😞" },
};
