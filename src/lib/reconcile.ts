// ===================== المطابقةُ الربعية — الحسابُ النقيّ =====================
// **السؤال الذي لم يكن للتطبيق جوابٌ عليه: هل هذا المال موجودٌ فعلاً؟**
//
// كلُّ رقمٍ في «مدار» مشتقٌّ من معاملاتٍ سجّلها المالك بيده. والمعاملاتُ ناقصةٌ
// دائماً: عمليةٌ نُسيت، كاش‌باك رجع ولم يُسجَّل، تحويلٌ لمحفظةٍ ادّخارية، رسمٌ
// اقتُطع بلا رسالة. فيرتفع «الفائض» الحسابيّ فوق ما في الحساب فعلاً، ويُرحَّل
// كلَّ دورةٍ إلى المظاريف، وتُبنى عليه قراراتٌ (مقاصةٌ تلقائية، تمويلُ مظروف)
// — وهو مالٌ لا وجود له. هذه بعينها شكوى المالك: «ما أبغى يعطيني فائض وما
// عندي فايض».
//
// والعلاجُ ليس حساباً أذكى — لا يوجد حسابٌ يعرف ما لم يُسجَّل. العلاجُ **وقفةٌ
// كلّ ثلاثة أشهر**: يفتح المالك كشوفَ حساباته، ويكتب رقماً واحداً، ويُسجَّل
// الفرقُ تسويةً على «الفوائض». عشرُ دقائق تُعيد ضبط النظام كلِّه.
//
// **ولماذا رقمٌ واحد لا مظروفاً مظروفاً؟** لأنّ الكشفَ البنكيّ وعاءٌ واحد ولا
// يعرف مظاريفنا. مقابلةُ مظروفٍ بمظروف كانت ستطلب من المالك أن يقسم رصيده
// بيده كلَّ مرّة — وهو عملُ عشر دقائقَ يصير ساعة، فلا يُفعل أصلاً. (قرارُ
// المالك ٠٫١٫٤٣٠.)
//
// **ولماذا الفرقُ كلُّه على «الفوائض»؟** لأنّها الوعاءُ الذي لا يصف شيئاً
// بعينه: المظاريفُ الأخرى لكلٍّ منها غايةٌ وخطّةٌ يعرفها المالك، أمّا الفوائض
// فهي «ما بقي» — وتصحيحُ «ما بقي» هو بعينه ما يريده. وقد تنزل تحت الصفر، وهذا
// **خبرٌ صحيح لا عطل**: صرفتَ من مالٍ لم يُسجَّل، ويمكن أن تُوضع عليه خطّةُ
// سدادٍ كأيّ عجز (`fundPlan.ts`, `stop: "zero"`).
//
// منطقٌ نقيّ بلا حالة ولا DOM، مختبَرٌ في `reconcile.test.ts`.
// النوعُ `Reconcile` في `types.ts` لا هنا: `AppData` يحمله، ولو عُرّف هنا
// لصارت دورةُ استيرادٍ بين الملفّين.
import type { DailyBudget, Reconcile, ReserveFund, Transaction } from "./types";
import { computeDailyBudgetStatus, parseDate, reserveTotals, round2 } from "./utils";

/** كلُّ كم يومٍ تُطلب المطابقة. ثلاثةُ أشهرَ بطلب المالك: أقصرُ منها يجعلها
 *  عادةً ثقيلة تُؤجَّل ثمّ تُتجاهَل، وأطولُ منها يجعل الفرقَ كبيراً بما يصعب
 *  تفسيره فيُقبَل بلا فهم. */
export const RECONCILE_DAYS = 90;

/** ما دون الريال فرقُ تقريبٍ لا اختلافُ حساب — يُقرأ «مطابق» ولا يُسجَّل تسويةً
 *  تُزحم السجلّ بحركاتٍ بلا معنى. */
export const RECONCILE_TOLERANCE = 1;

/** نصُّ إيداعِ التسوية في «الفوائض» — ثابتٌ واحد فتُعرف حركاتُها في سجلّ
 *  الصندوق ولا تختلط بترحيلِ راتبٍ ولا بسحبٍ يدويّ (كـ`OFFSET_NOTE` تماماً). */
export const RECONCILE_NOTE = "تسوية المطابقة الربعية";

/* ===================== متى تُطلب؟ ===================== */

export interface ReconcileStatus {
  /** تاريخُ آخر مطابقة — `null` لم تقع قطّ. */
  last: string | null;
  /** التاريخُ الذي يُعدّ منه: آخرُ مطابقة، وإلّا أوّلُ معاملةٍ في السجل. */
  anchor: string | null;
  /** الأيامُ منذ المرساة — `null` حين لا مرساة (تطبيقٌ بلا بياناتٍ بعد). */
  daysSince: number | null;
  /** كم بقي حتى تُطلب (صفرٌ = حان وقتُها). */
  daysLeft: number;
  due: boolean;
}

/** أحدثُ مطابقةٍ مسجَّلة (التواريخُ نصّيّةٌ تُقارن كما هي). */
export function lastReconcile(reconciles: Reconcile[] | undefined): Reconcile | null {
  let best: Reconcile | null = null;
  for (const r of reconciles ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date ?? "")) continue;
    if (!best || r.date > best.date) best = r;
  }
  return best;
}

function earliest(transactions: Transaction[]): string | null {
  let best: string | null = null;
  for (const t of transactions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date ?? "")) continue;
    if (!best || t.date < best) best = t.date;
  }
  return best;
}

/**
 * **المرساةُ أوّلُ معاملةٍ لا يومُ التثبيت**: بلا ذلك يُطالَب مَن ثبّت التطبيق
 * أمسِ بمطابقةِ كشوفٍ لا شيء فيها ليُطابَق — فيتعلّم أن يُغلق البطاقة، وحين
 * تصير المطابقةُ ذاتَ معنى بعد ثلاثة أشهر تكون قد صارت أثاثاً.
 */
export function reconcileStatus(
  reconciles: Reconcile[] | undefined,
  transactions: Transaction[],
  todayStr: string,
  everyDays: number = RECONCILE_DAYS
): ReconcileStatus {
  const last = lastReconcile(reconciles);
  const anchor = last?.date ?? earliest(transactions);
  const every = Math.max(1, Math.round(Number.isFinite(everyDays) ? everyDays : RECONCILE_DAYS));
  if (!anchor) return { last: last?.date ?? null, anchor: null, daysSince: null, daysLeft: every, due: false };
  const daysSince = Math.max(
    0,
    Math.round((parseDate(todayStr).getTime() - parseDate(anchor).getTime()) / 86400000)
  );
  const daysLeft = Math.max(0, every - daysSince);
  return { last: last?.date ?? null, anchor, daysSince, daysLeft, due: daysLeft === 0 };
}

/* ===================== ما يظنّه التطبيق أنّك تملك ===================== */

export interface HoldingRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  balance: number;
}

export interface Holdings {
  envelopes: HoldingRow[];
  envelopesTotal: number;
  /** رصيدُ الدورة الجاري: مصروفٌ رُصد لك ولم يُصرَف بعد — مالٌ في حسابك أيضاً. */
  cycleBalance: number;
  /** المجموعُ الذي يُقابَل بالواقع. */
  expected: number;
}

/**
 * **ولماذا يدخل رصيدُ الدورة في المجموع؟** لأنّ المطابقةَ تقابل ما في الحساب
 * البنكيّ، وما رُصد لك اليومَ ولم تصرفه ما زال في الحساب. إسقاطُه كان سيُظهر
 * فرقاً موجباً كلَّ مرّة بمقدار ما لم تصرفه — فرقاً حقيقياً المصدر، كاذبَ
 * المعنى، يُسجَّل تسويةً فيُضاعف الفائض.
 */
export function holdings(input: {
  reserves: ReserveFund[];
  transactions: Transaction[];
  dailyBudget: DailyBudget | null;
}): Holdings {
  const totals = reserveTotals(input.reserves, input.transactions);
  const envelopes: HoldingRow[] = input.reserves.map((f) => ({
    id: f.id,
    name: f.name,
    icon: f.icon,
    color: f.color,
    balance: totals.get(f.id)?.balance ?? 0,
  }));
  const envelopesTotal = round2(envelopes.reduce((s, e) => s + e.balance, 0));
  const cycleBalance = input.dailyBudget
    ? round2(computeDailyBudgetStatus(input.dailyBudget, input.transactions).balance)
    : 0;
  return { envelopes, envelopesTotal, cycleBalance, expected: round2(envelopesTotal + cycleBalance) };
}

/* ===================== الفرق ===================== */

export type ReconcileVerdict =
  | "match" // ضمن حدّ التقريب — لا تسوية
  | "more"  // الواقعُ أكثر: دخلٌ أو ارتدادٌ لم يُسجَّل
  | "less"; // الواقعُ أقلّ: صرفٌ لم يُسجَّل

export interface ReconcileResult {
  expected: number;
  actual: number;
  delta: number; // actual − expected
  verdict: ReconcileVerdict;
}

export function reconcileDelta(
  expected: number,
  actual: number,
  tolerance: number = RECONCILE_TOLERANCE
): ReconcileResult {
  const e = round2(Number.isFinite(expected) ? expected : 0);
  const a = round2(Number.isFinite(actual) ? actual : 0);
  const delta = round2(a - e);
  const tol = Math.abs(Number.isFinite(tolerance) ? tolerance : RECONCILE_TOLERANCE);
  const verdict: ReconcileVerdict = Math.abs(delta) <= tol ? "match" : delta > 0 ? "more" : "less";
  return { expected: e, actual: a, delta: verdict === "match" ? 0 : delta, verdict };
}
