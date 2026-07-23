// دقّة الختمة بالصفحة: يسجّل المستخدم الصفحة التي بلغها فتُشتَقّ منها الأجزاء
// والنسبة (بدل زيادة جزءٍ كامل)، مع تقديرٍ لموعد الإتمام على *الوتيرة الأخيرة*
// (آخر 14 ثمّ 30 يوماً) لا الوتيرة منذ البداية. منطقٌ نقيٌّ قابل للاختبار.
// تبقى الحلقة ذات الثلاثين قوساً كما هي.
import { pageRange, idToJuz, TOTAL_PAGES, TOTAL_JUZ } from "./meta";
import { parseDate, toDateStr } from "../utils";

function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

function daysAgoStr(todayStr: string, n: number): string {
  const d = parseDate(todayStr);
  d.setDate(d.getDate() - n);
  return toDateStr(d);
}

// الهدف الافتراضي: 20 صفحة/يوم (جزءٌ تقريباً) ≈ ختمة في شهر.
export const DEFAULT_KHATMA_GOAL = 20;

// عدد الأجزاء التي يُضيئها بلوغُ صفحةٍ ما (1..30) — جزءُ آخر آيةٍ في الصفحة.
export function khatmaJuzForPage(page: number): number {
  if (!page || page <= 0) return 0;
  const p = Math.min(Math.max(Math.round(page), 1), TOTAL_PAGES);
  return idToJuz(pageRange(p).end);
}

export function khatmaPct(page: number): number {
  const p = Math.min(Math.max(page || 0, 0), TOTAL_PAGES);
  return Math.round((p / TOTAL_PAGES) * 100);
}

export interface PageLogEntry { date: string; page: number }

export interface KhatmaEta {
  perDay: number; // صفحات/يوم على الوتيرة المستعملة
  daysLeft: number | null; // على الوتيرة (null إن لم تكفِ البيانات)
  enough: boolean;
  window: number | null; // نافذة الوتيرة بالأيام (14 أو 30) أو null إن حُسبت منذ البداية
}

// الوتيرة على نافذةٍ من الأيام: أقدم نقطةٍ داخلها هي الأساس، والوتيرة = فرق
// الصفحات ÷ الأيام المنقضية فعلاً. تُرجع null إن لم تكفِ نقاطٌ أو أيام.
function paceFromLog(
  log: PageLogEntry[] | undefined, page: number, todayStr: string, windowDays: number, minDays: number
): { perDay: number; days: number } | null {
  if (!log || !log.length) return null;
  const cutoff = daysAgoStr(todayStr, windowDays);
  const within = log
    .filter((p) => p.date >= cutoff && p.date <= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!within.length) return null;
  const base = within[0]; // أقدم نقطة داخل النافذة
  const days = daysBetween(base.date, todayStr);
  const delta = page - base.page;
  if (days < minDays || delta <= 0) return null;
  return { perDay: delta / days, days };
}

// تقدير موعد الإتمام على الوتيرة الأخيرة: يُفضَّل آخر 14 يوماً، ثمّ 30، وإلا
// يُرجع للوتيرة منذ البداية (توافقاً مع السلوك القديم عند شحّ السجلّ).
export function khatmaEta(
  page: number, startDate: string | undefined, todayStr: string, pageLog?: PageLogEntry[]
): KhatmaEta {
  if (!page || page <= 0) return { perDay: 0, daysLeft: null, enough: false, window: null };

  let perDay = 0;
  let windowUsed: number | null = null;

  const p14 = paceFromLog(pageLog, page, todayStr, 14, 3);
  const p30 = paceFromLog(pageLog, page, todayStr, 30, 5);
  if (p14) {
    perDay = p14.perDay;
    windowUsed = 14;
  } else if (p30) {
    perDay = p30.perDay;
    windowUsed = 30;
  } else if (startDate) {
    const days = Math.max(1, daysBetween(startDate, todayStr) + 1);
    if (days >= 3 && page >= 10) perDay = page / days; // منذ البداية (احتياط)
  }

  const enough = perDay > 0 && page >= 10;
  const remaining = TOTAL_PAGES - Math.min(page, TOTAL_PAGES);
  const daysLeft = enough && remaining > 0 ? Math.ceil(remaining / perDay) : null;
  return { perDay, daysLeft, enough, window: windowUsed };
}

// كم يوماً لختمةٍ كاملة على هدفٍ يومي (لعرض «ختمة خلال ~N يوماً»).
export function khatmaDaysForGoal(goalPerDay: number): number {
  const g = Math.max(1, Math.round(goalPerDay) || DEFAULT_KHATMA_GOAL);
  return Math.ceil(TOTAL_PAGES / g);
}

// كم صفحةً قُرئت في يومٍ ما: الفرق بين صفحة اليوم وصفحة بداية اليوم (آخر نقطةٍ
// سُجّلت قبله). تُستعمل لعرض التقدّم مقابل الهدف اليومي.
export function pagesReadOn(log: PageLogEntry[] | undefined, date: string, currentPage: number): number {
  const prior = (log ?? [])
    .filter((p) => p.date < date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .pop();
  const start = prior?.page ?? 0;
  return Math.max(0, currentPage - start);
}

export { TOTAL_PAGES, TOTAL_JUZ };
