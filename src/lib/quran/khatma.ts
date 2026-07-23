// دقّة الختمة بالصفحة: يسجّل المستخدم الصفحة التي بلغها فتُشتَقّ منها الأجزاء
// والنسبة (بدل زيادة جزءٍ كامل)، مع تقديرٍ لموعد الإتمام على وتيرة القراءة.
// منطقٌ نقيٌّ قابل للاختبار. تبقى الحلقة ذات الثلاثين قوساً كما هي.
import { pageRange, idToJuz, TOTAL_PAGES, TOTAL_JUZ } from "./meta";
import { parseDate } from "../utils";

function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

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

export interface KhatmaEta {
  perDay: number; // صفحات/يوم منذ بداية الختمة
  daysLeft: number | null; // على الوتيرة (null إن لم تكفِ البيانات)
  enough: boolean;
}

// تقدير موعد الإتمام من وتيرة القراءة منذ بداية الختمة (تقريبٌ بسيط مفهوم).
export function khatmaEta(page: number, startDate: string | undefined, todayStr: string): KhatmaEta {
  if (!startDate || !page || page <= 0) return { perDay: 0, daysLeft: null, enough: false };
  const days = Math.max(1, daysBetween(startDate, todayStr) + 1);
  const perDay = page / days;
  const enough = days >= 3 && page >= 10;
  const remaining = TOTAL_PAGES - Math.min(page, TOTAL_PAGES);
  const daysLeft = enough && perDay > 0 && remaining > 0 ? Math.ceil(remaining / perDay) : null;
  return { perDay, daysLeft, enough };
}

export { TOTAL_PAGES, TOTAL_JUZ };
