/**
 * ما أضافته شاشةُ الصلاة المنقولة من التصميم فوق الفروض الخمسة:
 * **السننُ الرواتب · قيامُ الليل والوتر · الفوائتُ والقضاء**.
 *
 * نقيٌّ عمداً (بلا `window` ولا متجر) كبقيّة `src/lib/*.ts`: يعبر إلى غلاف
 * Capacitor بلا تعديل، ويُختبر وحدةً — وهذه الحسابات بالذات تستحقّ الاختبار
 * لأنّ «كم عليك من الفوائت» رقمٌ يخصّ ذمّةَ المالك، لا زينةَ واجهة.
 */
import type { PrayerLog, PrayerName, QiyamNight } from "./types";
import { PRAYERS, isPrayedStatus } from "./types";
import { toDateStr, parseDate } from "./utils";

/** الحدُّ الأعلى لركعات القيام، والخطوةُ ركعتان — كما في التصميم. */
export const QIYAM_MAX = 21;
export const QIYAM_STEP = 2;

/**
 * هل تُحتسب هذه الحالةُ صلاةً أُدِّيت؟ إعادةُ تصديرٍ للبوّابة الوحيدة في
 * `types.ts` — لا نسخةَ ثانيةَ من التعريف هنا، فالمعنى واحدٌ في التطبيق كلِّه.
 */
export const isPrayed = isPrayedStatus;

/** عددُ ما أُدِّي من الخمس في يومٍ ما (٠..٥). */
export function prayedCount(log: PrayerLog | undefined): number {
  if (!log) return 0;
  return PRAYERS.filter((p) => isPrayed(log.prayers[p])).length;
}

/** عددُ ما صُلّي في جماعةٍ في يومٍ ما — يقود حلقةَ السنة. */
export function jamaahCount(log: PrayerLog | undefined): number {
  if (!log) return 0;
  return PRAYERS.filter((p) => log.prayers[p] === "جماعة").length;
}

/* ─────────────────────── الفوائت والقضاء ─────────────────────── */

/**
 * ما عليك من الفوائت = «فائتة» المسجّلةُ في الأيام + دَينٌ سابقٌ لتسجيلك
 * (`backlog`) — فرائضُ فاتتك قبل أن تستعمل مدار ولا يوجد لها يومٌ مسجَّل.
 */
export function qadaOwed(logs: PrayerLog[], backlog = 0): number {
  let n = Math.max(0, backlog);
  for (const log of logs) for (const p of PRAYERS) if (log.prayers[p] === "فائتة") n++;
  return n;
}

/** كم فائتةً قُضِيَت في يومٍ بعينه — «قضيتَ اليومَ ٢». */
export function qadaDoneOn(logs: PrayerLog[], date: string): number {
  const log = logs.find((l) => l.date === date);
  if (!log) return 0;
  return PRAYERS.filter((p) => log.prayers[p] === "قضاء").length;
}

/**
 * أقدمُ فائتةٍ لم تُقضَ — هي التي تقلبها «اقضِ واحدة» إلى «قضاء».
 * تُرجع `null` حين لا فائتةَ مسجّلة (فيُخصَم حينئذٍ من الدَّين السابق).
 */
export function oldestMissed(logs: PrayerLog[]): { date: string; prayer: PrayerName } | null {
  const days = logs.filter((l) => PRAYERS.some((p) => l.prayers[p] === "فائتة"))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const day = days[0];
  if (!day) return null;
  // داخل اليوم الواحد: الترتيبُ ترتيبُ الفروض لا ترتيبُ التسجيل.
  const prayer = PRAYERS.find((p) => day.prayers[p] === "فائتة")!;
  return { date: day.date, prayer };
}

/* ─────────────────────── قيام الليل ─────────────────────── */

const EMPTY_NIGHT: QiyamNight = { rakaat: 0, witr: false };

export function qiyamOf(log: PrayerLog | undefined): QiyamNight {
  return log?.qiyam ? { ...EMPTY_NIGHT, ...log.qiyam } : EMPTY_NIGHT;
}

/** الركعاتُ بعد زيادةٍ أو نقصٍ بخطوةٍ واحدة، محصورةً في [٠، ٢١]. */
export function stepRakaat(current: number, dir: 1 | -1): number {
  const next = (current || 0) + dir * QIYAM_STEP;
  return Math.min(QIYAM_MAX, Math.max(0, next));
}

/**
 * سلسلةُ آخر `nights` ليلة منتهيةً بـ`endDate` — يقرأها الشريطُ المرصوف تحت
 * «قيام الليل». الأقدمُ أوّلاً كما يُرسم من اليمين في التخطيط العربي.
 */
export function qiyamChain(
  logs: PrayerLog[],
  endDate: string,
  nights = 30
): { date: string; rakaat: number; witr: boolean }[] {
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const end = parseDate(endDate);
  const out: { date: string; rakaat: number; witr: boolean }[] = [];
  for (let i = nights - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const key = toDateStr(d);
    const q = qiyamOf(byDate.get(key));
    out.push({ date: key, rakaat: q.rakaat, witr: q.witr });
  }
  return out;
}

/* ─────────────────────── السنن الرواتب ─────────────────────── */

/** السننُ الرواتب المؤكَّدة في اليوم — سقفُ العدّاد. */
export const SUNAN_MAX = 12;

export function sunanOf(log: PrayerLog | undefined): number {
  return Math.max(0, log?.sunan ?? 0);
}

export function stepSunan(current: number, dir: 1 | -1): number {
  return Math.min(SUNAN_MAX, Math.max(0, (current || 0) + dir));
}

/* ─────────────────────── حلقةُ السنة ─────────────────────── */

/**
 * ثلاثٌ وسبعون شعبةً حول السنة — شعبةٌ لكلّ خمسةِ أيام.
 *
 * التصميمُ المصدر يرسمها ببياناتٍ عشوائية (نموذجٌ بصريّ)؛ هنا تُشتقّ من
 * سجلّك: نسبةُ ما أُدِّي إلى ما وجب في أيام الشعبة المنقضية. الشعبةُ «موفّاة»
 * عند ‎٠٫٨ فأعلى — أي أربعٌ من خمسٍ في المتوسّط، لا الكمالُ المطلق، وإلّا لم
 * تُضِئ شعبةٌ أبداً فصارت الحلقةُ توبيخاً لا مرآة.
 */
export const YEAR_SPOKES = 73;
const SPOKE_DAYS = 5;
export const SPOKE_MET_RATIO = 0.8;

export interface YearSpoke {
  index: number;
  /** نسبةُ الوفاء في هذه الشعبة (٠..١) — صفرٌ لما لم يأتِ بعد. */
  ratio: number;
  met: boolean;
  past: boolean;
  /** الشعبةُ التي يقع فيها اليوم. */
  now: boolean;
}

export function yearRingSpokes(logs: PrayerLog[], year: number, todayStr: string): YearSpoke[] {
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const startOfYear = new Date(year, 0, 1);
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const todayDate = new Date(ty, tm - 1, td);
  // اليومُ من السنة (١ = أوّلُ يناير)؛ سالبٌ إن كانت السنةُ المعروضة قادمة.
  const doyNow =
    year === ty ? Math.floor((todayDate.getTime() - startOfYear.getTime()) / 864e5) + 1
      : year < ty ? 366 : 0;

  return Array.from({ length: YEAR_SPOKES }, (_, i) => {
    const firstDay = i * SPOKE_DAYS + 1;
    let prayed = 0;
    let elapsed = 0;
    for (let k = 0; k < SPOKE_DAYS; k++) {
      const doy = firstDay + k;
      if (doy > doyNow) break;
      const d = new Date(year, 0, doy);
      if (d.getFullYear() !== year) break; // تجاوزَ آخرَ السنة (الشعبةُ ٧٣ ناقصة)
      elapsed++;
      prayed += prayedCount(byDate.get(toDateStr(d)));
    }
    const ratio = elapsed ? prayed / (elapsed * SPOKE_DAYS) : 0;
    return {
      index: i,
      ratio,
      met: elapsed > 0 && ratio >= SPOKE_MET_RATIO,
      past: elapsed > 0,
      now: doyNow >= firstDay && doyNow < firstDay + SPOKE_DAYS,
    };
  });
}
