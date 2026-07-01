export type FinanceCategory =
  | "راتب"
  | "استثمارات_دخل"
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

export type FinanceType = "دخل" | "مصروف";

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  type: FinanceType;
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

export type RecurringFrequency = "شهري" | "أسبوعي" | "سنوي";

export interface RecurringTransaction {
  id: string;
  amount: number;
  type: FinanceType;
  category: FinanceCategory;
  note: string;
  frequency: RecurringFrequency;
  dayOfMonth: number; // 1-31 for monthly, day index for weekly
  active: boolean;
  lastGenerated?: string; // YYYY-MM-DD of last auto-created instance
}

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

export const CATEGORY_LABELS: Record<FinanceCategory, { label: string; icon: string; type: FinanceType; color: string }> = {
  راتب: { label: "راتب", icon: "💼", type: "دخل", color: "#3d9640" },
  استثمارات_دخل: { label: "عوائد استثمار", icon: "📈", type: "دخل", color: "#3d9640" },
  إيجار: { label: "إيجار", icon: "🏠", type: "مصروف", color: "#e07b39" },
  مواصلات: { label: "مواصلات", icon: "🚗", type: "مصروف", color: "#7c6fcd" },
  طعام: { label: "طعام", icon: "🍽️", type: "مصروف", color: "#e07b39" },
  صحة: { label: "صحة", icon: "❤️", type: "مصروف", color: "#e05555" },
  تعليم: { label: "تعليم", icon: "📚", type: "مصروف", color: "#3d9640" },
  كمالي: { label: "كمالي", icon: "✨", type: "مصروف", color: "#9b6fcd" },
  سفر: { label: "سفر", icon: "✈️", type: "مصروف", color: "#4a9fbd" },
  ادخار: { label: "ادخار", icon: "🏦", type: "مصروف", color: "#2d7a30" },
  استثمار: { label: "استثمار", icon: "📊", type: "مصروف", color: "#256128" },
  أخرى: { label: "أخرى", icon: "📌", type: "مصروف", color: "#888" },
};

export const MOOD_LABELS = {
  ممتاز: { label: "ممتاز", icon: "😄" },
  جيد: { label: "جيد", icon: "😊" },
  محايد: { label: "محايد", icon: "😐" },
  سيء: { label: "سيء", icon: "😔" },
  سيء_جداً: { label: "سيء جداً", icon: "😞" },
};
