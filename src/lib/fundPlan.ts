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
export const MAX_PAYOFF_CYCLES = 6;

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
