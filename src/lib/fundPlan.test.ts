import { describe, it, expect } from "vitest";
import {
  suggestPayoffPerCycle, cycleFundingAmount, fundingDone, fundingPerDay,
  effectiveDailyRate, fundingPreview, cyclesRemaining, cyclesForGap,
  planBigExpense, buildPlanOptions, PAYOFF_CYCLES, MAX_PAYOFF_CYCLES, PAYOFF_CYCLE_CHOICES,
} from "./fundPlan";
import type { ReserveFund } from "./types";

const fund = (over: Partial<ReserveFund> = {}): ReserveFund => ({
  id: "f", name: "رحلة المدينة", icon: "🎒", color: "#000", deposits: [], createdAt: "2026-01-01",
  ...over,
});

describe("suggestPayoffPerCycle — تقسيم العجز على دورات", () => {
  it("يقسم على ثلاث دورات افتراضاً", () => {
    expect(suggestPayoffPerCycle(1500)).toBe(500);
    expect(PAYOFF_CYCLES).toBe(3);
  });
  it("يقصّ عدد الدورات على الحدّ الأعلى فلا يصير ديناً منسيّاً", () => {
    expect(suggestPayoffPerCycle(1200, 24)).toBe(suggestPayoffPerCycle(1200, MAX_PAYOFF_CYCLES));
  });
  it("لا عجز = لا سداد", () => {
    expect(suggestPayoffPerCycle(0)).toBe(0);
    expect(suggestPayoffPerCycle(-300)).toBe(0);
  });
});

describe("cycleFundingAmount — كم يُنقل هذه الدورة", () => {
  it("المستمرّة (الإيجار) تنقل مبلغها كل دورة مهما كان الرصيد", () => {
    const f = fund({ funding: { perCycle: 2000, source: "salary" } });
    expect(cycleFundingAmount(f, 0)).toBe(2000);
    expect(cycleFundingAmount(f, 9999)).toBe(2000);
  });

  it("السداد ينقل ما يلزم للتصفير فقط — وآخر دورة تنقل الباقي وحده", () => {
    const f = fund({ funding: { perCycle: 500, source: "salary", stop: "zero" } });
    expect(cycleFundingAmount(f, -1500)).toBe(500);
    expect(cycleFundingAmount(f, -120)).toBe(120);
    expect(cycleFundingAmount(f, 0)).toBe(0);
    expect(cycleFundingAmount(f, 300)).toBe(0);
  });

  it("الادخار يقف عند الهدف ولا يتجاوزه", () => {
    const f = fund({ target: 3000, funding: { perCycle: 500, source: "surplus", stop: "target" } });
    expect(cycleFundingAmount(f, 0)).toBe(500);
    expect(cycleFundingAmount(f, 2800)).toBe(200);
    expect(cycleFundingAmount(f, 3000)).toBe(0);
  });

  it("ادخارٌ بلا هدفٍ محدَّد يبقى مستمرّاً بدل أن يقف صامتاً", () => {
    const f = fund({ funding: { perCycle: 500, source: "salary", stop: "target" } });
    expect(cycleFundingAmount(f, 0)).toBe(500);
  });

  it("بلا خطة أو بمبلغٍ مشوّه لا نقل", () => {
    expect(cycleFundingAmount(fund(), -900)).toBe(0);
    expect(cycleFundingAmount(fund({ funding: { perCycle: 0, source: "salary" } }), -900)).toBe(0);
    expect(cycleFundingAmount(fund({ funding: { perCycle: NaN, source: "salary" } }), -900)).toBe(0);
  });
});

describe("fundingDone — الخطة ترفع نفسها", () => {
  it("السداد ينتهي بالتصفير، والمستمرّة لا تنتهي أبداً", () => {
    const payoff = { perCycle: 500, source: "salary" as const, stop: "zero" as const };
    expect(fundingDone(payoff, fund({ funding: payoff }), 0)).toBe(true);
    expect(fundingDone(payoff, fund({ funding: payoff }), -100)).toBe(false);
    const rent = { perCycle: 2000, source: "salary" as const };
    expect(fundingDone(rent, fund({ funding: rent }), 99999)).toBe(false);
  });
  it("الادخار ينتهي ببلوغ الهدف", () => {
    const save = { perCycle: 500, source: "surplus" as const, stop: "target" as const };
    const f = fund({ target: 3000, funding: save });
    expect(fundingDone(save, f, 3000)).toBe(true);
    expect(fundingDone(save, f, 2999)).toBe(false);
  });
});

describe("قطرةُ اليوم والبدل الفعليّ", () => {
  it("٥٠٠ للدورة على ٣٠ يوماً ≈ ١٦٫٦٧ ر.س/يوم", () => {
    expect(fundingPerDay(500, 30)).toBe(16.67);
  });
  it("البدل الفعليّ = المضبوط ناقص القطرة، ولا ينزل تحت الصفر", () => {
    expect(effectiveDailyRate(100, 16.67)).toBe(83.33);
    expect(effectiveDailyRate(100, undefined)).toBe(100);
    expect(effectiveDailyRate(100, 250)).toBe(0);
  });
  it("لا ينهار على طولِ دورةٍ صفريّ أو مشوّه", () => {
    expect(fundingPerDay(500, 0)).toBe(500);
    expect(Number.isFinite(fundingPerDay(500, NaN))).toBe(true);
  });
  it("المعاينة تقول البدل قبل الخطة وبعدها", () => {
    const p = fundingPreview(100, undefined, 500, 30);
    expect(p.before).toBe(100);
    expect(p.after).toBe(83.33);
    expect(p.perDay).toBe(16.67);
  });
  it("والمعاينة تتراكم فوق خطةٍ قائمة (إيجارٌ ثمّ سداد)", () => {
    const p = fundingPreview(100, 16.67, 300, 30);
    expect(p.before).toBe(83.33);
    expect(p.after).toBe(73.33);
  });
});

describe("cyclesRemaining — خطّ الدورات", () => {
  it("يعدّ دورات السداد المتبقّية", () => {
    const f = fund({ funding: { perCycle: 500, source: "salary", stop: "zero" } });
    expect(cyclesRemaining(f, -1500)).toBe(3);
    expect(cyclesRemaining(f, -600)).toBe(2);
    expect(cyclesRemaining(f, 0)).toBe(0);
  });
  it("والمستمرّة بلا عدّ (لا غاية لها)", () => {
    expect(cyclesRemaining(fund({ funding: { perCycle: 2000, source: "salary" } }), -100)).toBeNull();
    expect(cyclesRemaining(fund(), -100)).toBeNull();
  });
});

describe("cyclesForGap — العدد المقابل لمبلغٍ اختاره المالك بيده", () => {
  it("يقرّب لأعلى: ١٥٠٠ على ٤٠٠ = أربع دورات", () => {
    expect(cyclesForGap(1500, 400)).toBe(4);
    expect(cyclesForGap(1500, 500)).toBe(3);
  });
  it("صفرٌ حين لا فجوة أو لا مبلغ", () => {
    expect(cyclesForGap(0, 500)).toBe(0);
    expect(cyclesForGap(1500, 0)).toBe(0);
  });
  it("والمنتقي يعطي مبلغاً يطابق العدد المختار ذهاباً وإياباً", () => {
    for (const n of PAYOFF_CYCLE_CHOICES) {
      expect(cyclesForGap(1200, suggestPayoffPerCycle(1200, n))).toBe(n);
    }
  });
});

describe("planBigExpense — الخطةُ المقترحة", () => {
  const base = { rate: 100, cycleLen: 30 };

  it("يبدأ بالأرخص: رصيدُ الدورة، ويُبقي يوميّةً واحدة وسادة", () => {
    const p = planBigExpense({ ...base, amount: 300, cycleBalance: 450, surplusBalance: 0 });
    expect(p.fromCycle).toBe(300); // 450 − 100 وسادة = 350 متاح، والمصروف 300
    expect(p.needsEnvelope).toBe(false);
    expect(p.financed).toBe(0);
  });

  it("ثمّ الفوائض — ويُبقي ثلاث يوميّات وسادةً للمقاصة التلقائية", () => {
    const p = planBigExpense({ ...base, amount: 1000, cycleBalance: 0, surplusBalance: 800 });
    expect(p.fromCycle).toBe(0);
    expect(p.keptCushion).toBe(300);
    expect(p.fromSurplus).toBe(500);
    expect(p.financed).toBe(500);
  });

  it("ثمّ السداد — بأقلّ عددٍ يُبقي نقص البدل في حدّ الثلث", () => {
    // الحدّ: 100 × ⅓ × 30 = 1000 لكل دورة
    const p = planBigExpense({ ...base, amount: 3000, cycleBalance: 0, surplusBalance: 0 });
    expect(p.financed).toBe(3000);
    expect(p.cycles).toBe(3);
    expect(p.perCycle).toBe(1000);
    expect(p.perDay).toBe(33.33); // ثلثُ البدل تماماً
  });

  it("ويوزّع المصادر الثلاثة معاً حين تتوفّر", () => {
    const p = planBigExpense({ ...base, amount: 3000, cycleBalance: 450, surplusBalance: 1500 });
    expect(p.fromCycle).toBe(350);
    expect(p.fromSurplus).toBe(1200); // 1500 − 300 وسادة
    expect(p.financed).toBe(1450);
    expect(p.fromCycle + p.fromSurplus + p.financed).toBe(3000);
    // حصّةُ المظروف = ما لم يُدفع من رصيد الدورة
    expect(p.envelopePct).toBe(88);
  });

  it("رصيدٌ سالب لا يساهم بشيء (ولا يُخترع مالٌ من العدم)", () => {
    const p = planBigExpense({ ...base, amount: 500, cycleBalance: -200, surplusBalance: 0 });
    expect(p.fromCycle).toBe(0);
    expect(p.financed).toBe(500);
  });

  it("لا ينهار بلا بدلٍ يومي ولا بقيمٍ مشوّهة", () => {
    const p = planBigExpense({ amount: 900, cycleBalance: 0, surplusBalance: 0, rate: 0, cycleLen: 0 });
    expect(p.cycles).toBe(MAX_PAYOFF_CYCLES);
    expect(Number.isFinite(p.perCycle)).toBe(true);
    expect(() => planBigExpense({ amount: NaN, cycleBalance: NaN, surplusBalance: NaN, rate: NaN, cycleLen: NaN })).not.toThrow();
  });

  it("والمجموع لا يزيد ولا ينقص عن المصروف أبداً", () => {
    for (const amount of [120, 777.5, 2400, 10000]) {
      for (const surplusBalance of [0, 450, 9000]) {
        const p = planBigExpense({ ...base, amount, cycleBalance: 260, surplusBalance });
        expect(Math.round((p.fromCycle + p.fromSurplus + p.financed) * 100) / 100).toBe(Math.round(amount * 100) / 100);
      }
    }
  });
});

describe("buildPlanOptions — طرقٌ كاملةٌ بعواقبها", () => {
  const base = { rate: 100, cycleLen: 30, daysLeft: 10 };

  it("الموصى به أوّلاً وهو المزيج، ولكلّ خيارٍ مجموعٌ يساوي المصروف", () => {
    const opts = buildPlanOptions({ ...base, amount: 3000, cycleBalance: 450, surplusBalance: 1500 });
    expect(opts[0].kind).toBe("mix");
    expect(opts[0].recommended).toBe(true);
    expect(opts.filter((o) => o.recommended)).toHaveLength(1);
    for (const o of opts) {
      const sum = o.plan.fromCycle + o.plan.fromSurplus + o.plan.financed;
      expect(Math.round(sum * 100) / 100).toBe(3000);
    }
  });

  it("«كلُّه من بدلي» لا يفتح مظروفاً، ويُظهر وتيرةً منهارة حين لا تحتمل", () => {
    const opts = buildPlanOptions({ ...base, amount: 3000, cycleBalance: 450, surplusBalance: 1500 });
    const direct = opts.find((o) => o.kind === "fromBudget")!;
    expect(direct.plan.needsEnvelope).toBe(false);
    expect(direct.rateAfter).toBe(100); // لا يمسّ الدورات القادمة
    expect(direct.paceAfter).toBeLessThan(0); // لكنّ بقيّة الدورة تنهار
  });

  it("«احفظ سيولتك» يُبقي الفوائض كاملة ويأخذ من البدل وحده", () => {
    const opts = buildPlanOptions({ ...base, amount: 3000, cycleBalance: 450, surplusBalance: 1500 });
    const fin = opts.find((o) => o.kind === "financeAll")!;
    expect(fin.plan.fromSurplus).toBe(0);
    expect(fin.surplusAfter).toBe(1500);
    expect(fin.rateAfter).toBeLessThan(100);
  });

  it("«بلا مساس ببدلك» يظهر حين تغطّيه الفوائض بمسِّ الوسادة وحدها", () => {
    // 1100 في الفوائض: الموصى به يترك 300 وسادةً فيبقى 200 سداداً؛ وهذا الطريق
    // يغطّي المبلغ كاملاً بأكل الوسادة — طريقٌ مختلفٌ فعلاً فيستحقّ العرض.
    const opts = buildPlanOptions({ ...base, amount: 1000, cycleBalance: 0, surplusBalance: 1100 });
    const opt = opts.find((o) => o.kind === "noTouchBudget");
    expect(opt).toBeTruthy();
    expect(opt!.plan.financed).toBe(0);
    expect(opt!.rateAfter).toBe(100);
  });

  it("ولا يُعرض حين لا يضيف شيئاً على الموصى به (فلا خيارٌ مكرّر)", () => {
    // فوائضُ واسعة: الموصى به يغطّي كلَّ شيءٍ أصلاً بلا مسِّ الوسادة.
    const rich = buildPlanOptions({ ...base, amount: 1000, cycleBalance: 200, surplusBalance: 5000 });
    expect(rich[0].plan.financed).toBe(0);
    expect(rich.find((o) => o.kind === "noTouchBudget")).toBeUndefined();
    // وفقيرُ الفوائض لا يُعرض له هذا الطريق أصلاً
    const poor = buildPlanOptions({ ...base, amount: 3000, cycleBalance: 100, surplusBalance: 200 });
    expect(poor.find((o) => o.kind === "noTouchBudget")).toBeUndefined();
  });

  it("ويُعلَن مسُّ الوسادة صراحةً حين يقع", () => {
    const opts = buildPlanOptions({ ...base, amount: 1000, cycleBalance: 0, surplusBalance: 1100 });
    expect(opts.find((o) => o.kind === "noTouchBudget")!.eatsCushion).toBe(true); // بقي 100 < وسادة 300
    expect(opts[0].eatsCushion).toBe(false); // والموصى به لا يمسّها
  });
});
