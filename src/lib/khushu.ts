/**
 * طبقةُ الخشوع — حسابُ ما تقوله إجاباتُك عن حضور قلبك.
 *
 * نقيٌّ عمداً (بلا `window` ولا متجر) كبقيّة `src/lib/*.ts`: يعبر إلى غلاف
 * Capacitor بلا تعديل، ويُختبر وحدةً. والاختبارُ هنا ليس ترفاً: هذه أرقامٌ
 * يقرأها المالك عن نفسه، فخطأٌ في المتوسّط أسوأ من غيابه.
 *
 * **قاعدةٌ واحدة تحكم الملفّ كلَّه**: لا تُحتسب درجةٌ إلّا لصلاةٍ أُدِّيت فعلاً
 * (`isPrayedStatus`). درجةٌ باقيةٌ على فرضٍ مُسِح أو صار «فائتة» بقايا تسجيلٍ
 * قديم، لا خبرَ عن قلب — والمتجر يمسحها عند تغيير الحالة، وهذا حارسُها الثاني.
 */
import type { KhushuLevel, PrayerLog, PrayerName, PrayerStatus } from "./types";
import { PRAYERS, isPrayedStatus } from "./types";
import { toDateStr, parseDate } from "./utils";

/** «حالُ الصلاة» في المقارنة: مع الناس أو وحدك. القضاءُ خارجهما فلا يُنسب. */
export type PrayerCompany = "جماعة" | "منفردة";

export interface KhushuTally {
  /** عددُ الإجابات المحتسَبة. */
  n: number;
  /** متوسّطُ الدرجة (١..٣)، وصفرٌ حين لا إجابة. */
  avg: number;
  /** كم إجابةً في كلّ درجة — الفهرسُ ٠ للدرجة ١. */
  counts: [number, number, number];
}

const EMPTY: KhushuTally = { n: 0, avg: 0, counts: [0, 0, 0] };

function tally(levels: KhushuLevel[]): KhushuTally {
  if (!levels.length) return EMPTY;
  const counts: [number, number, number] = [0, 0, 0];
  let sum = 0;
  for (const l of levels) {
    counts[l - 1]++;
    sum += l;
  }
  return { n: levels.length, avg: sum / levels.length, counts };
}

/** درجةُ فرضٍ بعينه في يومٍ بعينه — أو `undefined` إن لم يُسأل أو تُخطّي. */
export function khushuOf(log: PrayerLog | undefined, prayer: PrayerName): KhushuLevel | undefined {
  if (!log) return undefined;
  if (!isPrayedStatus(log.prayers[prayer])) return undefined;
  const v = log.khushu?.[prayer];
  return v === 1 || v === 2 || v === 3 ? v : undefined;
}

/** هل بقي في هذا اليوم فرضٌ أُدِّي ولم يُجب عن خشوعه؟ — يقود «تبقى سؤال». */
export function unansweredOn(log: PrayerLog | undefined): PrayerName[] {
  if (!log) return [];
  return PRAYERS.filter((p) => isPrayedStatus(log.prayers[p]) && khushuOf(log, p) === undefined);
}

/* ─────────────────────── نافذةُ القراءة ─────────────────────── */

/**
 * سجلّاتُ آخر `days` يومًا المنتهيةِ بـ`endDate` — نافذةُ كلّ إحصاءٍ في الصفحة.
 *
 * النافذةُ لا الأبدُ عن قصد: «أخشعُ صلواتك» عن سنةٍ مضت خبرٌ عن رجلٍ آخر، وما
 * يُرجى من البطاقة أن تقول ما أنت عليه **الآن** فيمكن تغييرُه.
 */
export function windowLogs(logs: PrayerLog[], endDate: string, days = 30): PrayerLog[] {
  const end = parseDate(endDate);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const from = toDateStr(start);
  return logs.filter((l) => l.date >= from && l.date <= endDate);
}

/* ─────────────────────── التجميعات ─────────────────────── */

/** الحصيلةُ الكليّة على مجموعةِ أيام. */
export function khushuOverall(logs: PrayerLog[]): KhushuTally {
  const levels: KhushuLevel[] = [];
  for (const log of logs) for (const p of PRAYERS) {
    const v = khushuOf(log, p);
    if (v) levels.push(v);
  }
  return tally(levels);
}

/**
 * جماعةً أم وحدك؟ — المقارنةُ التي طلبها المالك أوّلاً.
 *
 * القضاءُ مستثنى: صلاةٌ خارج وقتها حالٌ ثالثةٌ لا تُنسب لأيٍّ من الطرفين،
 * وإلحاقُها بـ«وحدك» يُثقلها بما ليس منها فيكذب الفرق.
 */
export function khushuByCompany(logs: PrayerLog[]): Record<PrayerCompany, KhushuTally> {
  const buckets: Record<PrayerCompany, KhushuLevel[]> = { جماعة: [], منفردة: [] };
  for (const log of logs) for (const p of PRAYERS) {
    const status = log.prayers[p] as PrayerStatus | undefined;
    if (status !== "جماعة" && status !== "منفردة") continue;
    const v = khushuOf(log, p);
    if (v) buckets[status].push(v);
  }
  return { جماعة: tally(buckets["جماعة"]), منفردة: tally(buckets["منفردة"]) };
}

/** الحصيلةُ لكلّ فرضٍ من الخمس — عمودُ «أخشعُ صلواتك». */
export function khushuByPrayer(logs: PrayerLog[]): Record<PrayerName, KhushuTally> {
  const buckets = {} as Record<PrayerName, KhushuLevel[]>;
  for (const p of PRAYERS) buckets[p] = [];
  for (const log of logs) for (const p of PRAYERS) {
    const v = khushuOf(log, p);
    if (v) buckets[p].push(v);
  }
  const out = {} as Record<PrayerName, KhushuTally>;
  for (const p of PRAYERS) out[p] = tally(buckets[p]);
  return out;
}

/**
 * الحدُّ الأدنى من الإجابات قبل أن يُنطق برأي.
 *
 * تحته لا تُعرض مقارنةٌ ولا «أخشع»: متوسّطُ إجابتين ليس نمطاً بل صدفة، وبطاقةٌ
 * تُعلن نمطاً من صدفةٍ تُعلّم المالكَ ألّا يصدّقها.
 */
export const MIN_SAMPLE = 6;
/** وحدُّ الطرف الواحد في المقارنة — لا يُقارن طرفٌ بثلاث إجاباتٍ بطرفٍ بثلاثين. */
export const MIN_SIDE = 4;
/** فرقٌ أصغر من هذا في المتوسّط ضجيجٌ لا خبر. */
export const MEANINGFUL_GAP = 0.25;

export interface KhushuHighlight {
  /** مفتاحٌ ثابتٌ للقراءة الآلية والاختبار — لا يُعرض. */
  key: "company" | "best" | "worst";
  text: string;
}

/**
 * الجُمَلُ التي تُكتب في البطاقة. تُرجع مصفوفةً قد تكون فارغة — والفراغُ جوابٌ
 * صحيح: حين لا تكفي العيّنة **لا نخترع جملة**، تعرض البطاقةُ دعوةً للاستمرار.
 */
export function khushuHighlights(logs: PrayerLog[]): KhushuHighlight[] {
  const overall = khushuOverall(logs);
  if (overall.n < MIN_SAMPLE) return [];
  const out: KhushuHighlight[] = [];

  const company = khushuByCompany(logs);
  const jam = company["جماعة"];
  const alone = company["منفردة"];
  if (jam.n >= MIN_SIDE && alone.n >= MIN_SIDE) {
    const gap = jam.avg - alone.avg;
    if (Math.abs(gap) >= MEANINGFUL_GAP) {
      out.push({
        key: "company",
        text: gap > 0
          ? "قلبُك أحضرُ حين تصلّي مع الناس."
          : "قلبُك أحضرُ حين تصلّي وحدك.",
      });
    } else {
      out.push({ key: "company", text: "جماعةً كنتَ أو وحدك، حضورُك واحد." });
    }
  }

  const byPrayer = khushuByPrayer(logs);
  const ranked = PRAYERS.map((p) => ({ p, t: byPrayer[p] }))
    .filter((x) => x.t.n >= MIN_SIDE)
    .sort((a, b) => b.t.avg - a.t.avg);
  if (ranked.length >= 2) {
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    if (best.t.avg - worst.t.avg >= MEANINGFUL_GAP) {
      out.push({ key: "best", text: `أخشعُ صلواتك ${best.p}.` });
      out.push({ key: "worst", text: `وأشردُها ${worst.p} — موضعُ عنايتك.` });
    }
  }

  return out;
}

/**
 * منحنى آخر `days` يومًا: متوسّطُ اليوم الواحد، و`null` ليومٍ بلا إجابة.
 * `null` لا صفر: يومٌ لم تُسأل فيه ليس يوماً شرد فيه قلبُك، ورسمُه صفراً يحفر
 * في المنحنى وادياً لم يقع.
 */
export function khushuTrend(
  logs: PrayerLog[],
  endDate: string,
  days = 14
): { date: string; avg: number | null }[] {
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const end = parseDate(endDate);
  const out: { date: string; avg: number | null }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const key = toDateStr(d);
    const t = khushuOverall(byDate.get(key) ? [byDate.get(key)!] : []);
    out.push({ date: key, avg: t.n ? t.avg : null });
  }
  return out;
}
