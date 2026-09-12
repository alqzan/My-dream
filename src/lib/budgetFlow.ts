// ===================== وتيرة الدورة · المقاصة · وزنُ المصروف =====================
// ثلاثةُ أسئلةٍ كانت بلا جوابٍ واحد، فتفرّقت أجوبتُها في الواجهة أو غابت أصلاً:
//
//   ١) «العجز ظهر — كم آخذ من الفوائض؟»  → `offsetPlan`
//   ٢) «وماذا يعني هذا العجز لبقيّة الدورة؟» → `cyclePace`
//   ٣) «هذا المصروفُ كبير — أهو صرفُ يومٍ أم حدثٌ قائمٌ بذاته؟» → `expenseWeight`
//
// والثلاثةُ **سؤالٌ واحد في الحقيقة**: أين تسكن الصدمةُ الكبيرة؟ الميزانيةُ
// اليومية المتراكمة مقياسُ انضباطٍ يوميّ، فإن ابتلعت رحلةً بألفين صارت حمراء
// أسبوعين وكفّت عن أن تقيس شيئاً؛ وإن أُخفيت الرحلةُ بـ`offBudget` كذب الحسابُ
// في الاتجاه الآخر (مالٌ خرج ولا أثر له في أيّ وعاء). فالخطّ الفاصل رقمٌ واحد
// معرّفٌ هنا: `EVENT_DAYS` — ما عادله من الأيام ثلاثةٌ فأكثر **حدثٌ له مظروفُه**،
// وما دونه صرفٌ يوميّ تمتصّه المقاصةُ والوتيرة.
//
// منطقٌ نقيّ بلا حالة ولا DOM (يعبر إلى الغلاف الأصليّ كما هو)، مختبَرٌ في
// `budgetFlow.test.ts`. لا تُعِد أيّاً من هذه المعادلات داخل مكوّن.
import { round2 } from "./utils";

// الخطّ الفاصل بين «صرفِ يومٍ» و«حدث»: ثلاثُ يوميّاتٍ كاملة. يُقاس به شيئان
// عمداً — سقفُ المقاصة التلقائية، ووزنُ المصروف لحظة تسجيله — فلا يصحّ أن
// يُغطّى تلقائياً عجزٌ سببُه حدثٌ كان ينبغي أن يُوجَّه لمظروفه.
export const EVENT_DAYS = 3;

// نصُّ إيداع المقاصة في صندوق الفوائض — ثابتٌ واحد فتُعرف حركاتُها في سجلّ
// الصندوق ولا تختلط بالسحب اليدويّ.
export const OFFSET_NOTE = "مقاصة تلقائية — تغطية عجز اليومية";

/* ===================== ١) وتيرة بقيّة الدورة ===================== */

// «كم أصرف يومياً حتى أصل ليوم الراتب على الصفر؟» — هذا هو الرقمُ الذي يحتاجه
// المالك حين ينزل الرصيد تحت الصفر، لا الرقمَ السالب وحده: العجزُ موزَّعاً على
// الأيام الباقية يصير خطّةً («٦٥ ر.س/يوم بدل ١٠٠») بدل أن يكون جرحاً مفتوحاً.
export type PaceKind =
  | "ahead"     // الوتيرة أعلى من البدل — عندك فائض
  | "onTrack"   // على البدل تقريباً
  | "tighten"   // تشدّدٌ محتمَل: العجز تمتصّه الأيام الباقية
  | "beyond";   // أعمقُ من أن تمتصّه — يحتاج قراراً (مقاصة أو مظروف)

export interface CyclePace {
  daily: number;    // البدل الأصليّ
  daysLeft: number; // الأيام المحسوبة (يومٌ واحد على الأقل — يومُ الراتب نفسه)
  rate: number;     // البدل المعدَّل لبقيّة الدورة
  delta: number;    // rate − daily (سالبٌ = تشدّد)
  kind: PaceKind;
}

// نسبةٌ من البدل تحتها تصير الوتيرةُ غيرَ واقعية (أكل وبنزينٌ لا يُضغطان أكثر).
const BEYOND_RATIO = 0.35;

export function cyclePace(balance: number, dailyAmount: number, daysLeft: number): CyclePace {
  // يومُ الراتب نفسه (daysLeft = 0) ليس «بلا أيام»: بقي يومٌ تصرف فيه، والمعادلة
  // نفسها تعطي حينها رصيدَ اليوم + بدلَه. وقيمةٌ مشوّهةٌ (NaN من نسخةٍ قديمة) لا
  // تُنتج قسمةً على صفر.
  const left = Math.max(1, Math.round(Number.isFinite(daysLeft) ? daysLeft : 1));
  const daily = Number.isFinite(dailyAmount) && dailyAmount > 0 ? dailyAmount : 0;
  const bal = Number.isFinite(balance) ? balance : 0;
  const rate = round2((bal + daily * left) / left);
  const ratio = daily > 0 ? rate / daily : 1;
  const kind: PaceKind =
    ratio >= 1.05 ? "ahead" : ratio >= 0.95 ? "onTrack" : ratio > BEYOND_RATIO ? "tighten" : "beyond";
  return { daily, daysLeft: left, rate, delta: round2(rate - daily), kind };
}

/* ===================== ٢) المقاصة التلقائية ===================== */

// لماذا لا تُغطّى كلُّ العجوزات تلقائياً؟ لأنّ الفوائض ليست حساباً جارياً: هي ما
// نجا من دوراتٍ سابقة. فعجزُ يومين من قهوةٍ وبنزين تغطيته مقاصةٌ صحيحة، وعجزُ
// ألفين سببُه رحلةٌ ليس عجزاً أصلاً — هو حدثٌ سُجّل في المكان الخطأ، وتغطيتُه
// صامتةً تُفرغ الفوائض بلا قرار. فوق `EVENT_DAYS` يقف الحسابُ ويسأل.
export type OffsetReason =
  | "none"       // لا عجز
  | "off"        // المقاصة موقوفةٌ من الإعدادات
  | "noSurplus"  // لا رصيد في الفوائض
  | "covered"    // غُطّي العجز كاملاً
  | "partial"    // غُطّي ما أمكن (الفوائض أقلّ من العجز)
  | "tooBig";    // أكبر من سقف المقاصة — قرارُ المالك لا قرارُ التطبيق

export interface OffsetPlan {
  amount: number;  // ما يُسحب من الفوائض (0 = لا شيء)
  deficit: number; // العجز الموجب (0 = لا عجز)
  cap: number;     // سقف المقاصة الواحدة (0 = بلا سقف: لا بدل يومي يقاس عليه)
  reason: OffsetReason;
}

export function offsetPlan(
  balance: number,
  surplusBalance: number,
  dailyAmount: number,
  enabled: boolean
): OffsetPlan {
  const daily = Number.isFinite(dailyAmount) && dailyAmount > 0 ? dailyAmount : 0;
  const cap = round2(daily * EVENT_DAYS);
  const bal = Number.isFinite(balance) ? balance : 0;
  const deficit = bal < 0 ? round2(-bal) : 0;
  if (deficit <= 0) return { amount: 0, deficit: 0, cap, reason: "none" };
  if (!enabled) return { amount: 0, deficit, cap, reason: "off" };
  if (cap > 0 && deficit > cap) return { amount: 0, deficit, cap, reason: "tooBig" };
  const available = Number.isFinite(surplusBalance) ? surplusBalance : 0;
  if (available <= 0) return { amount: 0, deficit, cap, reason: "noSurplus" };
  const amount = round2(Math.min(deficit, available));
  return { amount, deficit, cap, reason: amount >= deficit ? "covered" : "partial" };
}

/* ===================== ٣) وزنُ المصروف لحظة تسجيله ===================== */

// «رحلة المدينة»: أسجّلها كماليات فتبتلع الميزانية، أو أتجاهلها من الميزانيات
// فيختفي ألفٌ من كلّ وعاء. الجوابُ ثالثٌ: تُقاس بأيّام بدلِك، فإن عادلت ثلاثةً
// فأكثر عُرضت عليك وجهتُها (مظروفُ حدثٍ مموَّل) قبل أن تمسّ اليومية.
export interface ExpenseWeight {
  days: number; // كم يوماً من بدلك يعادل هذا المصروف (منزلةٌ عشرية واحدة)
  big: boolean; // ≥ EVENT_DAYS → يستحقّ توجيهاً
}

export function expenseWeight(amount: number, dailyAmount: number): ExpenseWeight {
  const daily = Number.isFinite(dailyAmount) && dailyAmount > 0 ? dailyAmount : 0;
  const value = Number.isFinite(amount) && amount > 0 ? amount : 0;
  if (daily <= 0 || value <= 0) return { days: 0, big: false };
  return { days: Math.round((value / daily) * 10) / 10, big: value >= daily * EVENT_DAYS };
}
