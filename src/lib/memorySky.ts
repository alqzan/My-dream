// تجميع «سماء الذكريات» تكيّفياً: عند عددٍ قليل تبقى كلُّ مذكرةٍ نجمةً؛ وعند
// تجاوز حدٍّ مناسب تُجمَّع النجومُ في كوكباتٍ شهرية (اسم الشهر + عدد الذكريات)،
// فلا تُرسَم مئات النجوم القابلة للتركيز دفعةً واحدة. منطقٌ نقيٌّ قابل للاختبار
// بأرشيفٍ كبير (334 و1000). راجع MemorySky.tsx.
import type { JournalEntry } from "./types";

// فوق هذا العدد نتحوّل من النجوم الفردية إلى الكوكبات الشهرية.
export const SKY_CLUSTER_THRESHOLD = 120;

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export interface MonthCluster {
  key: string; // YYYY-MM
  year: number;
  month: number; // 1..12
  label: string; // «سبتمبر 2026»
  count: number;
  entries: JournalEntry[];
}

// تجميع المذكرات في كوكباتٍ شهرية (الأحدث أوّلاً). التواريخ المشوّهة تُتجاهَل.
export function clusterByMonth(entries: JournalEntry[]): MonthCluster[] {
  const map = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const key = (e.date || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    const arr = map.get(key);
    if (arr) arr.push(e);
    else map.set(key, [e]);
  }
  return [...map.entries()]
    .map(([key, es]) => {
      const [y, m] = key.split("-").map(Number);
      return { key, year: y, month: m, label: `${AR_MONTHS[m - 1] ?? ""} ${y}`, count: es.length, entries: es };
    })
    .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0)); // الأحدث أوّلاً
}

export type SkyView =
  | { mode: "stars"; entries: JournalEntry[] }
  | { mode: "constellations"; clusters: MonthCluster[] };

// أيّ عرضٍ للسماء حسب الحجم: نجومٌ فردية أو كوكباتٌ شهرية.
export function skyView(entries: JournalEntry[], threshold = SKY_CLUSTER_THRESHOLD): SkyView {
  if (entries.length <= threshold) return { mode: "stars", entries };
  return { mode: "constellations", clusters: clusterByMonth(entries) };
}
