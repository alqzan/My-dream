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

export interface YearGalaxy {
  key: string; // YYYY
  year: number;
  label: string;
  count: number;
  entries: JournalEntry[];
  months: MonthCluster[];
}

export interface DayPlanet {
  key: string; // YYYY-MM-DD
  date: string;
  day: number;
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

// المستوى الأعلى من السماء: كل سنة مجرة، وداخلها نجوم الأشهر.
export function clusterByYear(entries: JournalEntry[]): YearGalaxy[] {
  const map = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const date = e.date || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const key = date.slice(0, 4);
    const arr = map.get(key);
    if (arr) arr.push(e);
    else map.set(key, [e]);
  }
  return [...map.entries()]
    .map(([key, es]) => ({
      key,
      year: Number(key),
      label: key,
      count: es.length,
      entries: es,
      months: clusterByMonth(es),
    }))
    .sort((a, b) => b.year - a.year);
}

// المستوى الأدق: كوكب واحد لكل يوم. إن وُجدت أكثر من مذكرة في اليوم نفسه
// تبقى كلُّها داخله وتظهر في بطاقة اليوم، فلا يضيع الوصول إلى أي مذكرة.
export function clusterByDay(entries: JournalEntry[]): DayPlanet[] {
  const map = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const key = e.date || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const arr = map.get(key);
    if (arr) arr.push(e);
    else map.set(key, [e]);
  }
  return [...map.entries()]
    .map(([date, es]) => ({
      key: date,
      date,
      day: Number(date.slice(8, 10)),
      count: es.length,
      entries: es,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export type SkyView =
  | { mode: "stars"; entries: JournalEntry[] }
  | { mode: "constellations"; clusters: MonthCluster[] };

// أيّ عرضٍ للسماء حسب الحجم: نجومٌ فردية أو كوكباتٌ شهرية.
export function skyView(entries: JournalEntry[], threshold = SKY_CLUSTER_THRESHOLD): SkyView {
  if (entries.length <= threshold) return { mode: "stars", entries };
  return { mode: "constellations", clusters: clusterByMonth(entries) };
}

// ===================== الأيام الصامتة ونجوم بلا كلمات =====================
// ليست كل ذكرى نصّاً: بعض المذكرات (خاصةً مستوردات Day One) صورةٌ وحدها أو
// تسجيلٌ صوتيّ بلا سطرٍ واحد، وبعض الأيام لم تُكتب أصلاً. نميّزها هنا بمنطقٍ
// نقيّ حتى ترسمها السماء بشكلٍ مختلف: نجمةٌ مصمتة للنصّ، وحلقةٌ مفرغة لِما
// بلا كلمات، ونقطةٌ خافتة لليوم الصامت. لا شيء من هذا يغيّر البيانات.

export type EntryVoice = "text" | "media" | "empty";

// هل تحمل المذكرة نصّاً حقيقياً؟ العنوان يُحتسب نصّاً أيضاً.
export function entryVoice(e: JournalEntry): EntryVoice {
  const text = `${e.title ?? ""} ${e.content ?? ""}`.replace(/\s+/g, "");
  if (text.length > 0) return "text";
  const media =
    (e.photos?.length ?? 0) > 0 || !!e.photo || (e.audios?.length ?? 0) > 0 || !!e.audio;
  return media ? "media" : "empty";
}

// أيام النطاق [from..to] التي لا مذكرة فيها إطلاقاً — الأحدث أوّلاً، ومحدودةٌ
// بـ`limit` حتى لا يُغرِق أرشيفٌ قديمٌ السماءَ بمئات النقاط.
export function silentDates(
  entries: JournalEntry[],
  from: string,
  to: string,
  limit = 60
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return [];
  const written = new Set(entries.map((e) => e.date));
  const out: string[] = [];
  // نمشي من الأحدث إلى الأقدم فيبقى ما نعرضه أقربَ إلى الآن حين نبلغ الحدّ.
  const [ty, tm, td] = to.split("-").map(Number);
  const cur = new Date(ty, tm - 1, td);
  for (;;) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    if (key < from || out.length >= limit) break;
    if (!written.has(key)) out.push(key);
    cur.setDate(cur.getDate() - 1);
  }
  return out;
}
