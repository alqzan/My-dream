// ===================== افتتاحيةُ الدورة =====================
// **السؤال الذي يسبق كلَّ سؤال: كم من راتبي ملكي فعلاً هذا الشهر؟**
//
// كان يومُ الراتب أعلى لحظةٍ في الدورة وأفقرَها بياناً: بانرٌ يقول «نزل الراتب؟
// 🎉» ثمّ يُصفّر العدّادات، وينزل المصروفُ اليومي من ١٠٠ إلى ٧٠ بلا أن يقول أحدٌ
// لماذا. والشرحُ موجود (`DailyRateSplit`) لكنّه **بعد الواقعة** وداخل قسمٍ
// مطويّ — يُقرأ حين لم يعد في اليد شيء.
//
// وهذه اللحظةُ هي الوحيدة التي ما زال القرارُ فيها ممكناً: بعدها كلُّ ما يفعله
// النظام ردُّ فعلٍ (مقاصةٌ بعد عجز، توجيهٌ بعد فاتورة). فصار البانرُ **بياناً**
// يُقرأ قبل الضغط: راتبُك · ما يخرج منه التزاماً · ما يبقى لك · ومصروفُك اليومي
// بعد كلّ ذلك.
//
// **ولا حساب جديد هنا**: التمويلُ من `planCycleFunding` — النيّةُ نفسُها التي
// ينفّذها `confirmSalary` بعد الضغط، فما وعدت به الافتتاحيةُ هو ما يقع. والقطرةُ
// من `fundingPerDay` والمصروفُ الفعليّ من `effectiveDailyRate`.
//
// **والرقمُ الذي لم يكن يُعرض أصلاً: `gap`.** المصروفُ اليومي يضبطه المالك بيده،
// ولا أحد كان يقابله براتبه: من ضبط ١٠٠ ودورتُه ثلاثون يوماً يخطّط لصرف ٣٠٠٠،
// فإن بقي له بعد التزاماته ٢٦٠٠ فهو **مضبوطٌ فوق ما يملك بـ٤٠٠** — ويكتشفها في
// آخر الدورة عجزاً، لا في أوّلها قراراً.
//
// منطقٌ نقيّ بلا حالة ولا DOM، مختبَرٌ في `cycleOpening.test.ts`.
import type { ReserveFund, Transaction } from "./types";
import { effectiveDailyRate, fundingPerDay, planCycleFunding } from "./fundPlan";
import { computeDailyBudgetStatus, round2 } from "./utils";

/** التزامٌ واحد في هذه الدورة — مظروفٌ له خطةٌ تنقل مالاً. */
export interface CycleCommitment {
  fundId: string;
  name: string;
  icon: string;
  color: string;
  amount: number;
  /** من راتب الدورة (ينقص مصروفك) أو من الفوائض (لا يمسّه). */
  source: "salary" | "surplus";
  /** حصّةُ اليوم منه — صفرٌ لما مصدرُه الفوائض. */
  perDay: number;
}

export interface CycleOpening {
  /** الراتب إن كان معروفاً (`monthlyIncome`)، وإلّا `null` فلا نخترع رقماً. */
  income: number | null;
  cycleLen: number;
  /** الفائضُ المرحَّل من الدورة المنتهية إلى الفوائض. */
  carryIn: number;
  commitments: CycleCommitment[];
  fromSalary: number;
  fromSurplus: number;
  /** قطرةُ اليوم من تمويل الراتب. */
  perDay: number;
  /** المصروف المضبوط كما ضبطه المالك. */
  setRate: number;
  /** المصروف اليومي الفعليّ بعد القطرة — الرقم الذي **يقرّر**. */
  rate: number;
  /** ما ستصرفه بهذه الوتيرة طوال الدورة (`rate × cycleLen`). */
  planned: number;
  /** ما يبقى لك من الراتب بعد التزامات الدورة (`null` بلا راتبٍ معروف). */
  yours: number | null;
  /** `yours − planned`: سالبٌ = مضبوطٌ فوق ما تملك. `null` بلا راتبٍ معروف. */
  gap: number | null;
  /**
   * حكمُ الفجوة — **بيوميّةٍ واحدة لا بالريال**. فجوةُ عشرة ريالاتٍ على دورةٍ
   * كاملة ليست خطراً، وصبغُها بالأحمر يعلّم المالك تجاهلَ اللون فيضيع حين يصير
   * الخطرُ حقيقياً. فالخطُّ الفاصل يوميّةٌ واحدة: ما دونها ضجيجُ تقريب.
   *   • `over`    — ناقصٌ يوميّةً فأكثر: قرارٌ الآن (اخفض الوتيرة أو أجّل التزاماً).
   *   • `onTrack` — على قدر راتبك في حدود يوميّة.
   *   • `fits`    — يفضل منه ما يزيد على يوميّة.
   * و`none` حين لا راتبَ معروفاً أو لا وتيرةَ مضبوطة — فلا حكمَ على غير معلوم.
   */
  verdict: "over" | "onTrack" | "fits" | "none";
}

export function cycleOpening(input: {
  income: number | null;
  dailyBudget: { amount: number; startDate: string; carryAdjust?: number; fundingPerDay?: number } | null;
  reserves: ReserveFund[];
  transactions: Transaction[];
  cycleLen: number;
  /** معرّفُ صندوق الفوائض ورصيدُه — يُستثنى من التمويل ويموّل غيرَه. */
  surplusId?: string;
  surplusBalance: number;
}): CycleOpening {
  const cycleLen = Math.max(1, Math.round(Number.isFinite(input.cycleLen) ? input.cycleLen : 30));
  const income = Number.isFinite(input.income) && (input.income ?? 0) > 0 ? input.income! : null;

  // الفائضُ المرحَّل: رصيدُ الدورة المنتهية الموجب (نفسُ ما يرحّله `confirmSalary`).
  const carryIn = input.dailyBudget
    ? Math.max(0, round2(computeDailyBudgetStatus(input.dailyBudget, input.transactions).balance))
    : 0;

  // التمويلُ يُقرأ من نيّةِ التنفيذ نفسِها، وبرصيد فوائضَ **بعد** الترحيل —
  // فالمموَّل من الفوائض يجد ما رُحّل للتوّ متاحاً، كما يفعل التنفيذ بالضبط.
  const plan = planCycleFunding({
    reserves: input.reserves,
    transactions: input.transactions,
    surplusId: input.surplusId,
    surplusBalance: round2((Number.isFinite(input.surplusBalance) ? input.surplusBalance : 0) + carryIn),
  });

  const commitments: CycleCommitment[] = [];
  for (const move of plan.moves) {
    if (move.amount <= 0) continue;
    const fund = input.reserves.find((f) => f.id === move.fundId);
    if (!fund) continue;
    commitments.push({
      fundId: fund.id,
      name: fund.name,
      icon: fund.icon,
      color: fund.color,
      amount: move.amount,
      source: move.source,
      perDay: move.source === "salary" ? fundingPerDay(move.amount, cycleLen) : 0,
    });
  }
  // الأثقلُ أوّلاً — الإيجارُ قبل قسطِ رحلةٍ صغيرة.
  commitments.sort((a, b) => b.amount - a.amount);

  const perDay = fundingPerDay(plan.fromSalary, cycleLen);
  const setRate = input.dailyBudget && Number.isFinite(input.dailyBudget.amount) ? input.dailyBudget.amount : 0;
  const rate = effectiveDailyRate(setRate, perDay);
  const planned = round2(rate * cycleLen);
  const yours = income !== null ? round2(income - plan.fromSalary) : null;
  const gap = yours !== null ? round2(yours - planned) : null;
  const verdict: CycleOpening["verdict"] =
    gap === null || rate <= 0 ? "none" : gap < -rate ? "over" : gap > rate ? "fits" : "onTrack";

  return {
    income,
    cycleLen,
    carryIn,
    commitments,
    fromSalary: plan.fromSalary,
    fromSurplus: plan.fromSurplus,
    perDay,
    setRate,
    rate,
    planned,
    yours,
    gap,
    verdict,
  };
}
