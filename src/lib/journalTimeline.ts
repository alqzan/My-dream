// ===================== تجميع المذكرات لعرض الخطّ الزمني =====================
// القائمة كانت بطاقاتٍ متساوية تحت عنوان شهر، فيضيع «اليوم» تماماً: مذكرتان
// في يومٍ واحد تبدوان كيومين. هنا يُجمَّع الأرشيف مرّتين — شهراً ثمّ يوماً —
// فيرسم العرض حبّة يومٍ واحدة تتفرّع منها مذكرات ذلك اليوم على مسارٍ رأسيّ.
//
// نقيّ: لا React ولا DOM (راجع docs/APP-STORE-PLAN.md).

import type { JournalEntry } from "./types";
import { arabicMonthName } from "./utils";

export interface DayGroup {
  /** YYYY-MM-DD */
  date: string;
  entries: JournalEntry[];
}

export interface MonthGroup {
  /** YYYY-MM */
  key: string;
  /** «أغسطس 2025» */
  label: string;
  /** مجموع مذكرات الشهر (لا عدد أيامه). */
  count: number;
  days: DayGroup[];
}

/** «09:30» → 570 دقيقة. الوقت الغائب يهبط لآخر اليوم فلا يتصدّر المؤقّتات. */
function minutesOf(e: JournalEntry): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(e.time ?? "");
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * يجمّع مذكراتٍ **مرتّبةً مسبقاً بالأحدث أولاً** إلى أشهرٍ ثمّ أيام، ويرتّب
 * مذكرات اليوم الواحد بالأحدث وقتاً أولاً (وما لا وقت له في الذيل).
 * لا يعيد الترتيب على مستوى التواريخ: ترتيب المصدر هو المعتمد، فيبقى فلترُ
 * الصفحة وحده صاحبَ قرار الترتيب.
 */
export function groupJournalByDay(entries: JournalEntry[]): MonthGroup[] {
  const months: MonthGroup[] = [];
  for (const entry of entries) {
    const monthKey = entry.date.slice(0, 7);
    let month = months[months.length - 1];
    if (!month || month.key !== monthKey) {
      const [y, m] = monthKey.split("-").map(Number);
      month = { key: monthKey, label: `${arabicMonthName(m - 1)} ${y}`, count: 0, days: [] };
      months.push(month);
    }
    let day = month.days[month.days.length - 1];
    if (!day || day.date !== entry.date) {
      day = { date: entry.date, entries: [] };
      month.days.push(day);
    }
    day.entries.push(entry);
    month.count++;
  }
  for (const month of months) {
    for (const day of month.days) {
      day.entries.sort((a, b) => minutesOf(b) - minutesOf(a));
    }
  }
  return months;
}
