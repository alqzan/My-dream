// ===================== خطة تمويل المظاريف — الحساب النقيّ =====================
// القاعدة التي وُلد منها هذا الملف: **الصدمةُ الكبيرة لا تدخل البدل اليومي
// أبداً؛ تدخل مظروفاً، والمظروفُ يمتدّ على عدة دورات.**
//
// ولا يُوزَّع المصروفُ نفسه على الأشهر — المال خرج في يومه ويبقى مسجّلاً فيه،
// وتوزيعُه على السجلّ يجعل كلّ شهرٍ كذبةً صغيرة ويُفقد سؤال «كم صرفت في رمضان؟»
// جوابَه. المُوزَّع هو **التمويل**، وله ثلاث صور بآليةٍ واحدة:
//
//   • **مستمرّ**  — الإيجار وكلّ التزامٍ يتكرّر: مبلغٌ ثابت كل دورة، بلا نهاية.
//   • **ادخار**  — رحلةٌ قادمة: يتوقّف حين يبلغ الرصيدُ الهدف.
//   • **سداد**   — رحلةٌ وقعت ولم تُموَّل: يتوقّف حين يصفّر العجز.
//
// وصدقُ الحساب في سؤالٍ واحد: **من أين المال؟** من الفوائض (مالٌ قديم، لا يمسّ
// بدلك) أو من راتب الدورة (فينزل بدلك بحصّة اليوم منه). ولو مُوِّل من الراتب
// ولم ينزل البدل، لصرفتَ الريال مرّتين — وهي المحاسبة المزدوجة نفسها التي
// رُفعت عن السقوف.
//
// منطقٌ نقيّ بلا حالة ولا DOM، مختبَرٌ في `fundPlan.test.ts`.
import type { FundFunding, ReserveFund } from "./types";
import { round2 } from "./utils";

// عدد دورات السداد المقترَح لعجزٍ وقع، وحدُّه الأعلى. لماذا ثلاث؟ لأنّها تقسم
// الصدمة إلى قطرةٍ محتمَلة وتبقى في الذاكرة؛ وما تجاوز الستّ يصير دَيناً منسيّاً
// يسحب من الراتب بلا أن يذكره أحد — وهو الشعور نفسه الذي وُلدت الخطة لرفعه.
export const PAYOFF_CYCLES = 3;
// الحدّ الأعلى **اقتراحٌ لا وصاية**: المالك يختار عدد الدورات بنفسه من منتقي
// الخطة، وهذه القيم خياراتُه السريعة. ما تجاوز ستّاً يبقى ممكناً لكنّه يُذكَّر
// بأنّه يسحب من بدله طوال المدّة — القرارُ قراره لا قرار التطبيق.
export const MAX_PAYOFF_CYCLES = 12;
export const PAYOFF_CYCLE_CHOICES = [2, 3, 4, 6, 12] as const;
export const LONG_PLAN_CYCLES = 6;

// كم دورةً يلزم لتغطية فجوةٍ بمبلغٍ لكل دورة؟ (للعرض بجانب المبلغ المكتوب يدوياً)
export function cyclesForGap(gap: number, perCycle: number): number {
  if (!Number.isFinite(gap) || gap <= 0 || !Number.isFinite(perCycle) || perCycle <= 0) return 0;
  return Math.ceil(round2(gap) / perCycle);
}

// مبلغ السداد المقترح لعجزٍ قائم (العجز موجبٌ هنا).
export function suggestPayoffPerCycle(deficit: number, cycles: number = PAYOFF_CYCLES): number {
  const d = Number.isFinite(deficit) && deficit > 0 ? deficit : 0;
  const n = Math.min(Math.max(Math.round(cycles) || PAYOFF_CYCLES, 1), MAX_PAYOFF_CYCLES);
  return round2(d / n);
}

// كم يُنقل إلى هذا المظروف في دورةٍ رصيدُه `balance`؟ صفرٌ حين لا خطة، أو حين
// بلغت الخطةُ غايتها (فتتوقّف من نفسها). ولا يُنقل أكثر مما يلزم لبلوغ الغاية:
// آخرُ دورةٍ في السداد تنقل الباقي وحده لا المبلغ كاملاً.
export function cycleFundingAmount(fund: ReserveFund, balance: number): number {
  const f = fund.funding;
  if (!f || !Number.isFinite(f.perCycle) || f.perCycle <= 0) return 0;
  const per = round2(f.perCycle);
  const bal = Number.isFinite(balance) ? balance : 0;
  if (f.stop === "zero") {
    const deficit = bal < 0 ? round2(-bal) : 0;
    return deficit <= 0 ? 0 : round2(Math.min(per, deficit));
  }
  if (f.stop === "target") {
    const target = Number.isFinite(fund.target) && (fund.target ?? 0) > 0 ? fund.target! : 0;
    if (!target) return per; // هدفٌ غير محدَّد → تبقى مستمرّة بدل أن تقف صامتة
    const missing = round2(target - bal);
    return missing <= 0 ? 0 : round2(Math.min(per, missing));
  }
  return per; // مستمرّة (الإيجار)
}

// هل بلغت الخطةُ غايتها فتُرفع؟ (تُستدعى بعد تنفيذ نقل الدورة)
export function fundingDone(funding: FundFunding | undefined, fund: ReserveFund, balanceAfter: number): boolean {
  if (!funding?.stop) return false;
  if (funding.stop === "zero") return balanceAfter >= 0;
  const target = Number.isFinite(fund.target) && (fund.target ?? 0) > 0 ? fund.target! : 0;
  return target > 0 && balanceAfter >= target;
}

// حصّة اليوم من تمويلٍ مصدرُه الراتب: المجموع ÷ طول الدورة. قطرةٌ يومية لا خصمٌ
// دفعةً واحدة — الخصمُ الدفعة يجعل الرصيد سالباً من اليوم الأوّل بلا سبب.
export function fundingPerDay(totalFromSalary: number, cycleLength: number): number {
  const total = Number.isFinite(totalFromSalary) && totalFromSalary > 0 ? totalFromSalary : 0;
  const len = Math.max(1, Math.round(Number.isFinite(cycleLength) ? cycleLength : 30));
  return round2(total / len);
}

// البدل الفعليّ لليوم: ما ضبطتَه ناقص قطرةِ التمويل. لا ينزل تحت الصفر (خطّةٌ
// تلتهم الراتب كلَّه تُبقي البدل صفراً بدل أن تقلبه سالباً بلا معنى).
export function effectiveDailyRate(amount: number, perDay: number | undefined): number {
  const a = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const d = Number.isFinite(perDay) && (perDay ?? 0) > 0 ? perDay! : 0;
  return Math.max(0, round2(a - d));
}

// معاينةُ الأثر **قبل** الموافقة على خطةٍ من الراتب: «سينزل بدلك من ١٠٠ إلى ٨٣».
export function fundingPreview(
  dailyAmount: number,
  currentPerDay: number | undefined,
  addedPerCycle: number,
  cycleLength: number
): { before: number; after: number; perDay: number } {
  const before = effectiveDailyRate(dailyAmount, currentPerDay);
  const added = fundingPerDay(addedPerCycle, cycleLength);
  return {
    before,
    after: effectiveDailyRate(dailyAmount, round2((currentPerDay ?? 0) + added)),
    perDay: added,
  };
}

// كم دورةً بقيت حتى تبلغ الخطةُ غايتها؟ `null` للخطة المستمرّة (الإيجار) —
// لا غاية لها فلا عدّ. يُرسم بها «خطّ الدورات» في بطاقة المظروف، فيرى المالك
// نهاية الالتزام بعينه بدل أن يكون سحباً مفتوحاً بلا أفق.
export function cyclesRemaining(fund: ReserveFund, balance: number): number | null {
  const f = fund.funding;
  if (!f || f.perCycle <= 0 || !f.stop) return null;
  const bal = Number.isFinite(balance) ? balance : 0;
  const gap =
    f.stop === "zero"
      ? bal < 0
        ? -bal
        : 0
      : Math.max(0, (Number.isFinite(fund.target) && (fund.target ?? 0) > 0 ? fund.target! : 0) - bal);
  if (gap <= 0) return 0;
  return Math.ceil(round2(gap) / f.perCycle);
}

/* ===================== الخطةُ المقترحة لمصروفٍ كبير ===================== */
// «أنا غالباً أدفع من الدورة أو من الاحتياطيات أو أيّاً يكن — أبيه يتصرّف بذكاء».
// فبدل أن يُسأل المالك سؤالين (من أين؟ وعلى كم دورة؟) يقرأ التطبيق حالته ويقترح
// **توزيعاً واحداً** بثلاثة مصادر مرتّبة من الأرخص إلى الأغلى:
//
//   ١) **رصيد دورتك الحالي** — أرخصُها: مالٌ متاحٌ الآن لا يُرتّب التزاماً.
//      ويُبقى منه **يوميّةٌ واحدة** وسادةً، فلا يُترك اليومُ على حافّة الصفر.
//   ٢) **الفوائض** — مالٌ قديم لا يمسّ البدل. ويُبقى منها **ثلاثُ يوميّات**
//      (سقفُ المقاصة التلقائية في `budgetFlow.ts`)، وإلّا أُفرغت الوسادةُ التي
//      تغطّي عجز الغد وعاد المالك إلى الأحمر من بابٍ آخر.
//   ٣) **خطةُ سدادٍ من الراتب** — آخرُها لأنّها الوحيدة التي تنقص البدل.
//
// **وعددُ الدورات يُحسب لا يُفترض**: أقلُّ عددٍ يُبقي نقصَ البدل في حدوده
// (`MAX_DRIP_RATIO` = ثلثُ البدل)، مقصوصاً على `MAX_PAYOFF_CYCLES`. فالجواب
// «أربع دورات» يصير له سببٌ يُقال: «حتى لا ينزل بدلك أكثر من الثلث».
// نقيٌّ ومختبَر؛ والمالك يبقى قادراً على تعديل كلّ رقمٍ فيه.

// أقصى ما تأخذه خطةُ السداد من البدل اليومي.
export const MAX_DRIP_RATIO = 1 / 3;
// ما يُترك في الفوائض وسادةً للمقاصة التلقائية (بيوميّات البدل).
export const SURPLUS_CUSHION_DAYS = 3;

export interface ExpensePlan {
  amount: number;
  fromCycle: number;    // من رصيد الدورة (يبقى على البدل اليومي كصرفٍ عاديّ)
  fromSurplus: number;  // تمويلٌ فوريّ للمظروف من الفوائض
  financed: number;     // الباقي بخطة سدادٍ من الراتب
  cycles: number;       // عدد دوراتها (0 إن لا سداد)
  perCycle: number;
  perDay: number;       // كم تنقص من بدلك يومياً
  envelopePct: number;  // حصّة المظروف من المعاملة (0..100)
  keptCushion: number;  // ما تُرك في الفوائض
  needsEnvelope: boolean; // false = رصيدك يتحمّله، فلا داعي لمظروفٍ أصلاً
}

export function planBigExpense(input: {
  amount: number;
  cycleBalance: number;
  rate: number;
  surplusBalance: number;
  cycleLen: number;
}): ExpensePlan {
  const amount = Number.isFinite(input.amount) && input.amount > 0 ? round2(input.amount) : 0;
  const rate = Number.isFinite(input.rate) && input.rate > 0 ? input.rate : 0;
  const len = Math.max(1, Math.round(Number.isFinite(input.cycleLen) ? input.cycleLen : 30));
  const cycleBalance = Number.isFinite(input.cycleBalance) ? input.cycleBalance : 0;
  const surplus = Number.isFinite(input.surplusBalance) && input.surplusBalance > 0 ? input.surplusBalance : 0;

  // ١) رصيد الدورة — مع إبقاء يوميّةٍ واحدة وسادة.
  const fromCycle = round2(Math.max(0, Math.min(amount, cycleBalance - rate)));
  let rest = round2(amount - fromCycle);

  // ٢) الفوائض — مع إبقاء وسادة المقاصة.
  const cushion = round2(Math.min(surplus, rate * SURPLUS_CUSHION_DAYS));
  const fromSurplus = round2(Math.max(0, Math.min(rest, surplus - cushion)));
  rest = round2(rest - fromSurplus);

  // ٣) الباقي سداداً — بأقلّ عددٍ يُبقي نقص البدل في حدّه.
  const financed = round2(Math.max(0, rest));
  const perCycleMax = round2(rate * MAX_DRIP_RATIO * len);
  const cycles =
    financed <= 0
      ? 0
      : perCycleMax > 0
      ? Math.min(MAX_PAYOFF_CYCLES, Math.max(1, Math.ceil(financed / perCycleMax)))
      : MAX_PAYOFF_CYCLES;
  const perCycle = cycles > 0 ? round2(financed / cycles) : 0;

  const envelopeShare = round2(fromSurplus + financed);
  return {
    amount,
    fromCycle,
    fromSurplus,
    financed,
    cycles,
    perCycle,
    perDay: cycles > 0 ? fundingPerDay(perCycle, len) : 0,
    envelopePct: amount > 0 ? Math.min(100, Math.round((envelopeShare / amount) * 100)) : 0,
    keptCushion: cushion,
    needsEnvelope: envelopeShare > 0,
  };
}
