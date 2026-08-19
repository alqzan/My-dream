/**
 * **منحنى الدورة** — صرفُك التراكميّ فوق خطِّ خطّتك، من الراتب إلى الراتب.
 *
 * الميزانيةُ اليومية تقول رقماً واحداً: «رصيدُك اليوم كذا». والمنحنى يقول ما لا
 * يقوله الرقم: **متى** انحرفتَ. أسبوعٌ منضبطٌ ثمّ يومٌ واحدٌ أطاح بالدورة يعطي
 * نفسَ الرصيد الذي يعطيه انحرافٌ يوميٌّ صغير — وعلاجُهما مختلف.
 *
 * **يُقاس بمقاييس مدار نفسِها لا بمقاييسَ جديدة**: خطُّ الخطّة `dailyBudget.amount`
 * لكلِّ يوم، والصرفُ `dailyShare` — وهما ما تحسب بهما بطاقةُ الميزانية اليومية.
 * لو حُسب هنا بمقياسٍ آخر لأعطت الشاشةُ الواحدة رقمين متناقضين.
 *
 * **ولا يُرسم بلا ميزانية**: بلا `dailyBudget` لا خطَّ خطّةٍ أصلاً، فالدالّة
 * تُرجع `null` — ومنحنًى بخطٍّ مخترَعٍ أسوأُ من لا منحنى.
 *
 * نقيٌّ بلا DOM ولا متجر، كبقيّة `src/lib/*.ts`.
 */
import type { DailyBudget, Transaction } from "./types";
import { dailyShare, parseDate, toDateStr, round2 } from "./utils";

export interface CycleCurve {
  /** بدايةُ الدورة (YYYY-MM-DD) — يومُ الراتب أو تأكيدُه. */
  start: string;
  /** آخرُ يومٍ في الدورة (YYYY-MM-DD) — اليومُ السابق للراتب القادم. */
  end: string;
  /** طولُ الدورة بالأيام. */
  total: number;
  /** ترتيبُ اليوم في الدورة (١..total). */
  idx: number;
  /** بدلُ اليوم الواحد كما حدّده المالك. */
  perDay: number;
  /** مصروفُ كلِّ يومٍ منقضٍ (طولُها `idx`). */
  dayVals: number[];
  /** المصروفُ التراكميّ عند كلِّ يوم. */
  cums: number[];
  /** مجموعُ ما صُرف حتى اليوم. */
  spent: number;
  /** ما كانت الخطّةُ تسمح به حتى اليوم. */
  expectedNow: number;
  /** فوق الخطّ؟ */
  over: boolean;
  /** الفرقُ بين الصرف والخطّة (موجبٌ دائماً). */
  diff: number;
  /** كاملُ ما تسمح به الدورة. */
  spendable: number;
}

/** عددُ الأيام بين مفتاحَي تاريخٍ (b − a). */
function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

/**
 * يبني المنحنى من نافذة الدورة وسجلِّ المعاملات. `cycleStart` هو ما تُرجعه
 * `budgetCycleStart`/`spendWindow`، و`nextSalary` ما تُرجعه `nextSalaryDate`.
 * يُرجع `null` بلا ميزانيةٍ يومية أو ببدلٍ غير صالح.
 */
export function buildCycleCurve(
  dailyBudget: DailyBudget | null | undefined,
  transactions: Transaction[],
  cycleStart: string,
  nextSalary: string,
  todayStr: string
): CycleCurve | null {
  const perDay = Number.isFinite(dailyBudget?.amount) ? (dailyBudget as DailyBudget).amount : 0;
  if (!dailyBudget || perDay <= 0) return null;
  // نافذةُ الشهر الميلادي («YYYY-MM») ليست دورةً لها بدايةٌ ونهاية — لا تُرسم.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cycleStart)) return null;

  const total = Math.max(1, daysBetween(cycleStart, nextSalary));
  const end = toDateStr(new Date(parseDate(cycleStart).getTime() + (total - 1) * 86400000));
  // اليومُ خارج الدورة (تأكيدُ راتبٍ قديمٌ لم يُضغط) يُثبَّت عند آخرها بدل أن
  // يخرج المنحنى عن إطاره — ولا يُخترع يومٌ لم يأتِ.
  const idx = Math.min(total, Math.max(1, daysBetween(cycleStart, todayStr) + 1));

  const perDayMap = new Map<string, number>();
  for (const t of transactions) {
    if (t.date < cycleStart || t.date > end) continue;
    perDayMap.set(t.date, (perDayMap.get(t.date) ?? 0) + dailyShare(t));
  }

  const dayVals: number[] = [];
  const cums: number[] = [];
  let cum = 0;
  for (let i = 0; i < idx; i++) {
    const key = toDateStr(new Date(parseDate(cycleStart).getTime() + i * 86400000));
    const v = round2(perDayMap.get(key) ?? 0);
    dayVals.push(v);
    cum = round2(cum + v);
    cums.push(cum);
  }

  const expectedNow = round2(perDay * idx);
  const spent = cum;
  return {
    start: cycleStart, end, total, idx, perDay, dayVals, cums, spent, expectedNow,
    over: spent > expectedNow,
    diff: round2(Math.abs(spent - expectedNow)),
    spendable: round2(perDay * total),
  };
}

// ===================== هندسةُ الرسم =====================
// إحداثيّاتُ التصميم كما هي: لوحةٌ ٣٠٠×١١٦ وخطُّ الأرض عند ١٠٤.

export const CURVE_W = 300;
export const CURVE_BASE = 104;
const CURVE_H = 96;

export interface CurveGeometry {
  /** خطُّ الخطّة المتقطّع. */
  allowD: string;
  /** منحنى الصرف التراكميّ. */
  spendD: string;
  /** مساحةُ ما تحته (تظليلٌ خفيف). */
  areaD: string;
  /** موضعُ «الآن» أفقيّاً. */
  nowX: number;
}

/**
 * مسارات الـSVG. المقياسُ الرأسيّ **أعلى الخطّين معاً** ×١٫٠٤ — فلو تجاوزتَ
 * خطّةَ الدورة كلَّها بقي المنحنى داخل الإطار ورأيتَ التجاوز، لا خطّاً مبتوراً
 * عند الحافّة.
 *
 * **والزمنُ يجري من اليمين إلى اليسار**: يومُ الراتب عند الحافّة اليمنى تحت
 * تسميته، والراتبُ القادم عند اليسرى تحت تسميته. رسمٌ يجري يساراً في شاشةٍ
 * عربية يضع كلَّ تسميةٍ فوق الطرف المعاكس لها — فيُقرأ المنحنى مقلوباً.
 */
export function curveGeometry(c: CycleCurve): CurveGeometry {
  const max = Math.max(c.spendable, c.spent, 1) * 1.04;
  const X = (i: number) => +(CURVE_W - (i / c.total) * CURVE_W).toFixed(2);
  const Y = (v: number) => +(CURVE_BASE - (v / max) * CURVE_H).toFixed(2);
  const pts = c.cums.map((v, i) => `${X(i + 1)} ${Y(v)}`);
  return {
    allowD: `M${CURVE_W} ${CURVE_BASE} L${X(c.total)} ${Y(c.spendable)}`,
    spendD: `M${CURVE_W} ${CURVE_BASE} L${pts.join(" L")}`,
    areaD: `M${CURVE_W} ${CURVE_BASE} L${pts.join(" L")} L${X(c.idx)} ${CURVE_BASE} Z`,
    nowX: X(c.idx),
  };
}

// ===================== انضباطُ الأيام =====================

export interface DisciplineDay {
  /** ارتفاعُ العمود بالبكسل (٣ فأكثر — اليومُ الخالي يبقى خطّاً مرئيّاً). */
  height: number;
  /** تجاوز بدلَ يومه؟ */
  over: boolean;
  /** مصروفُ اليوم. */
  value: number;
  /** ترتيبُ اليوم في الدورة (١..). */
  day: number;
}

const BAR_MAX = 34;

/** عمودٌ لكلِّ يومٍ منقضٍ — ذهبيٌّ إن بقي داخل بدلِه، طينيٌّ إن تجاوزه. */
export function disciplineDays(c: CycleCurve): DisciplineDay[] {
  const max = Math.max(c.perDay, ...c.dayVals, 1);
  return c.dayVals.map((v, i) => ({
    height: Math.max(3, Math.round((v / max) * BAR_MAX)),
    over: v > c.perDay,
    value: v,
    day: i + 1,
  }));
}

/** كم يوماً بقي داخل بدلِه، ونسبتُها من الأيام المنقضية (٠..١). */
export function disciplineScore(c: CycleCurve): { within: number; of: number; ratio: number } {
  const within = c.dayVals.filter((v) => v <= c.perDay).length;
  const of = Math.max(1, c.idx);
  return { within, of, ratio: within / of };
}
