/**
 * **الحصيلة** — قراءةُ آخر ثلاثين يوماً وسنةِ الالتزام.
 *
 * التصميمُ المصدر يرسم بتلاتِ السنة وأعمدةَ المال **ببياناتٍ عشوائية** لأنّه
 * نموذجٌ بصريّ. هنا تُشتقّ كلُّها من سجلّك — ورقمٌ مخترَعٌ في شاشةِ محاسبةٍ
 * أسوأُ من لا رقم.
 *
 * نقيٌّ بلا DOM ولا متجر، كبقيّة `src/lib/*.ts`.
 */
import type { Book, Habit, JournalEntry, PrayerLog, ReadingLog, Transaction } from "./types";
import { PRAYERS } from "./types";
import { prayedCount, jamaahCount } from "./prayerExtras";
import { toDateStr, parseDate, cashOut } from "./utils";

export const WINDOW_DAYS = 30;

/** مفاتيحُ آخر `days` يوماً منتهيةً بـ`endDate` — الأقدمُ أوّلاً. */
export function lastDays(endDate: string, days = WINDOW_DAYS): string[] {
  const end = parseDate(endDate);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    out.push(toDateStr(d));
  }
  return out;
}

export interface WindowStats {
  days: string[];
  /** فروضٌ أُدِّيت في كلّ يوم (٠..٥). */
  prayed: number[];
  jamaah: number;
  prayedTotal: number;
  /** ١ لليوم الذي كُتبت فيه مذكرة. */
  wrote: number[];
  wroteDays: number;
  /** صفحاتُ قراءةٍ في كلّ يوم. */
  pages: number[];
  pagesTotal: number;
  /** عددُ العادات المنجَزة في كلّ يوم. */
  habits: number[];
  habitsTotal: number;
  /** أقصى ما كان يمكن إنجازُه من العادات في النافذة. */
  habitsCap: number;
  /** صرفٌ نقديٌّ في كلّ يوم. */
  spend: number[];
  spendTotal: number;
}

export function windowStats(
  endDate: string,
  src: {
    prayerLogs: PrayerLog[];
    journalEntries: JournalEntry[];
    readingLogs: ReadingLog[];
    habits: Habit[];
    transactions: Transaction[];
  },
  days = WINDOW_DAYS
): WindowStats {
  const keys = lastDays(endDate, days);
  const prayerBy = new Map(src.prayerLogs.map((l) => [l.date, l]));
  const wroteSet = new Set(src.journalEntries.map((e) => e.date));

  const pagesBy = new Map<string, number>();
  for (const l of src.readingLogs) pagesBy.set(l.date, (pagesBy.get(l.date) ?? 0) + l.pagesRead);

  const spendBy = new Map<string, number>();
  // كلُّ تجميعٍ للصرف يمرّ بـ`cashOut` — المؤجّلُ صفرٌ لأنّه لم يُدفع.
  for (const t of src.transactions) spendBy.set(t.date, (spendBy.get(t.date) ?? 0) + cashOut(t));

  const habitDates = src.habits.map((h) => new Set(h.logs ?? []));

  const prayed: number[] = [];
  const wrote: number[] = [];
  const pages: number[] = [];
  const habits: number[] = [];
  const spend: number[] = [];
  let jamaah = 0;

  for (const k of keys) {
    const log = prayerBy.get(k);
    prayed.push(prayedCount(log));
    jamaah += jamaahCount(log);
    wrote.push(wroteSet.has(k) ? 1 : 0);
    pages.push(pagesBy.get(k) ?? 0);
    habits.push(habitDates.reduce((n, set) => n + (set.has(k) ? 1 : 0), 0));
    spend.push(spendBy.get(k) ?? 0);
  }

  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  return {
    days: keys,
    prayed,
    jamaah,
    prayedTotal: sum(prayed),
    wrote,
    wroteDays: sum(wrote),
    pages,
    pagesTotal: sum(pages),
    habits,
    habitsTotal: sum(habits),
    habitsCap: src.habits.length * keys.length,
    spend,
    spendTotal: sum(spend),
  };
}

/** نسبةٌ مئويةٌ صحيحة، والمقامُ صفرٌ يُقرأ صفراً لا `NaN`. */
export function pctOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/**
 * ارتفاعاتُ أعمدةٍ نسبيّة. أدنى عمودٍ **٣٪ لا صفر**: اليومُ الخالي يبقى
 * مرئياً خطّاً رفيعاً، وإلّا اختفى من الرسم فبدت النافذةُ أقصرَ ممّا هي.
 */
export function barHeights(values: number[]): string[] {
  const top = Math.max(1, ...values);
  return values.map((v) => `${Math.max(3, Math.round((v / top) * 100))}%`);
}

/* ─────────────────────── سنةُ الالتزام ─────────────────────── */

export interface MonthPetal {
  key: string; // YYYY-MM
  label: string;
  /** نسبةُ الصلوات المؤدّاة في ذلك الشهر (٠..١٠٠). */
  value: number;
  /** هل مضى هذا الشهرُ أصلاً (فيه أيامٌ منقضية)؟ */
  past: boolean;
  now: boolean;
}

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/**
 * اثنا عشر شهراً منتهيةً بالشهر الجاري — بتلةٌ لكلّ شهر وطولُها التزامُه.
 *
 * المقياسُ الصلاة: هي الشيءُ الوحيد الذي له سقفٌ يوميٌّ ثابت (خمسٌ) فتصحّ
 * المقارنةُ بين شهرٍ وشهر. والشهرُ الذي لم يأتِ بعدُ ليس صفراً — هو **غيرُ
 * ماضٍ**، ولا يدخل في المعدَّل، وإلّا بدت سنتُك فاشلةً في يناير.
 */
export function yearPetals(prayerLogs: PrayerLog[], todayStr: string): MonthPetal[] {
  const [ty, tm] = todayStr.split("-").map(Number);
  const todayDay = Number(todayStr.slice(8));
  const byDate = new Map(prayerLogs.map((l) => [l.date, l]));

  const out: MonthPetal[] = [];
  for (let back = 11; back >= 0; back--) {
    const d = new Date(ty, tm - 1 - back, 1);
    const y = d.getFullYear();
    const m = d.getMonth(); // 0..11
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    const isNow = y === ty && m === tm - 1;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const elapsed = isNow ? todayDay : daysInMonth;

    let prayed = 0;
    for (let day = 1; day <= elapsed; day++) {
      prayed += prayedCount(byDate.get(`${key}-${String(day).padStart(2, "0")}`));
    }
    out.push({
      key,
      label: AR_MONTHS[m],
      value: pctOf(prayed, elapsed * PRAYERS.length),
      past: elapsed > 0,
      now: isNow,
    });
  }
  return out;
}

/** معدَّلُ السنة — متوسّطُ الأشهر الماضية وحدَها. */
export function yearAverage(petals: MonthPetal[]): number {
  const past = petals.filter((p) => p.past);
  if (!past.length) return 0;
  return Math.round(past.reduce((a, p) => a + p.value, 0) / past.length);
}

/* ─────────────────────── جَردُ السنة ─────────────────────── */

export interface InventoryRow {
  label: string;
  value: number;
  unit: string;
}

/** ستّةُ أرقامٍ تلخّص سنتك — «ماذا بقي منها؟» لا «كم أنجزت؟». */
export function yearInventory(
  year: number,
  src: {
    journalEntries: JournalEntry[];
    readingLogs: ReadingLog[];
    books: Book[];
    prayerLogs: PrayerLog[];
    benefits: { createdAt: string; applied?: boolean }[];
  }
): InventoryRow[] {
  const inYear = (d: string) => d.startsWith(String(year));
  const days = new Set(src.journalEntries.filter((e) => inYear(e.date)).map((e) => e.date));
  const pages = src.readingLogs.filter((l) => inYear(l.date)).reduce((a, l) => a + l.pagesRead, 0);
  const minutes = src.readingLogs.filter((l) => inYear(l.date)).reduce((a, l) => a + (l.minutesRead ?? 0), 0);
  const finished = src.books.filter((b) => b.status === "أنهيت" && inYear(b.finishDate || "")).length;
  const jamaah = src.prayerLogs
    .filter((l) => inYear(l.date))
    .reduce((a, l) => a + jamaahCount(l), 0);
  const applied = src.benefits.filter((b) => inYear(b.createdAt) && b.applied).length;

  return [
    { label: "يومًا لها أثرٌ مكتوب", value: days.size, unit: "يوم" },
    { label: "صفحةً قرأت", value: pages, unit: "صفحة" },
    { label: "دقيقةً في القراءة", value: minutes, unit: "دقيقة" },
    { label: "كتابًا خُتِم", value: finished, unit: "كتاب" },
    { label: "فرضًا في جماعة", value: jamaah, unit: "فرض" },
    { label: "فائدةً دخلت في عمل", value: applied, unit: "فائدة" },
  ];
}
