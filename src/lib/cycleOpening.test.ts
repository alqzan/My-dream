import { describe, it, expect } from "vitest";
import { cycleOpening } from "./cycleOpening";
import { planCycleFunding } from "./fundPlan";
import { today } from "./utils";
import type { ReserveFund, Transaction } from "./types";

const T = today();
const fund = (
  id: string,
  name: string,
  deposits: number[],
  funding?: ReserveFund["funding"],
  target?: number
): ReserveFund => ({
  id, name, icon: "📦", color: "#8a6fb0", target,
  deposits: deposits.map((amount, i) => ({ id: `${id}-d${i}`, date: T, amount })),
  funding, createdAt: T,
});
const tx = (id: string, amount: number): Transaction => ({ id, date: T, amount, category: "cat-x", note: "" });

describe("planCycleFunding — نيّةٌ واحدة يقرأها العرضُ وينفّذها المتجر", () => {
  it("يجمع تمويل الراتب ويترك الفوائض للمموَّل منها", () => {
    const plan = planCycleFunding({
      reserves: [
        fund("f-rent", "الإيجار", [], { perCycle: 2000, source: "salary" }),
        fund("f-trip", "رحلة", [], { perCycle: 300, source: "surplus", stop: "target" }, 900),
      ],
      transactions: [],
      surplusId: "f-surplus",
      surplusBalance: 1000,
    });
    expect(plan.fromSalary).toBe(2000);
    expect(plan.fromSurplus).toBe(300);
    expect(plan.surplusLeft).toBe(700);
  });

  it("الفوائضُ لا تُصرف أكثر ممّا فيها", () => {
    const plan = planCycleFunding({
      reserves: [fund("f-trip", "رحلة", [], { perCycle: 500, source: "surplus" })],
      transactions: [],
      surplusId: "f-surplus",
      surplusBalance: 200,
    });
    expect(plan.fromSurplus).toBe(200);
    expect(plan.surplusLeft).toBe(0);
    expect(plan.moves[0].amount).toBe(200);
  });

  it("الخطةُ التي بلغت غايتها تُعلَّم `done` فتُرفع", () => {
    // ادخارٌ هدفُه ٩٠٠ ورصيدُه ٦٠٠ وقسطُه ٣٠٠ → ينتهي بهذه النقلة.
    const plan = planCycleFunding({
      reserves: [fund("f-trip", "رحلة", [600], { perCycle: 300, source: "salary", stop: "target" }, 900)],
      transactions: [],
      surplusBalance: 0,
    });
    expect(plan.moves[0]).toMatchObject({ amount: 300, done: true });
  });

  it("لا يموّل صندوق الفوائض نفسه ولا مظروفاً بلا خطة", () => {
    const plan = planCycleFunding({
      reserves: [
        fund("f-surplus", "الفوائض", [1000], { perCycle: 100, source: "salary" }),
        fund("f-plain", "بلا خطة", [50]),
      ],
      transactions: [],
      surplusId: "f-surplus",
      surplusBalance: 1000,
    });
    expect(plan.moves).toEqual([]);
    expect(plan.fromSalary).toBe(0);
  });
});

describe("cycleOpening — كم من راتبي ملكي؟", () => {
  const base = {
    income: 8000,
    dailyBudget: { amount: 100, startDate: T },
    reserves: [
      fund("f-rent", "الإيجار", [], { perCycle: 2000, source: "salary" }),
      fund("f-payoff", "سداد رحلة", [-400], { perCycle: 400, source: "salary", stop: "zero" }),
    ],
    transactions: [] as Transaction[],
    cycleLen: 30,
    surplusId: "f-surplus",
    surplusBalance: 0,
  };

  it("يقسم الراتب: ملتزمٌ · باقٍ لك · ومصروفٌ يوميّ فعليّ", () => {
    const o = cycleOpening(base);
    expect(o.fromSalary).toBe(2400);
    expect(o.yours).toBe(5600);
    // ٢٤٠٠ ÷ ٣٠ = ٨٠ قطرةً يومية → المصروف الفعليّ ٢٠ لا ١٠٠.
    expect(o.perDay).toBe(80);
    expect(o.setRate).toBe(100);
    expect(o.rate).toBe(20);
    expect(o.planned).toBe(600);
  });

  it("**الحكمُ بيوميّةٍ لا بالريال**: فجوةٌ أصغرُ من يوميّة ليست إنذاراً", () => {
    // ٨٠٠٠ راتب، ٢٤٠٠ التزامات → ٥٦٠٠ لك. وتيرةٌ تخطّط ٥٦١٠ → ناقصٌ ١٠ فقط،
    // والمصروف اليومي ١٨٧: عشرةُ ريالاتٍ ضجيجُ تقريب لا قرار.
    const o = cycleOpening({ ...base, dailyBudget: { amount: 267, startDate: T } });
    expect(o.rate).toBe(187);
    expect(o.gap).toBe(-10);
    expect(o.verdict).toBe("onTrack");
  });

  it("وما تجاوز يوميّةً كاملة يصير `over`", () => {
    const o = cycleOpening({ ...base, income: 2600, reserves: [] });
    expect(o.gap).toBe(-400); // والمصروفُ ١٠٠ → أعمقُ من يوميّة
    expect(o.verdict).toBe("over");
  });

  it("وفائضٌ فوق يوميّة يصير `fits`، وبلا راتبٍ أو وتيرة لا حكم", () => {
    expect(cycleOpening({ ...base, income: 8000, reserves: [] }).verdict).toBe("fits");
    expect(cycleOpening({ ...base, income: null }).verdict).toBe("none");
    expect(cycleOpening({ ...base, dailyBudget: null }).verdict).toBe("none");
  });

  it("**الفجوة**: مضبوطٌ فوق ما تملك تُقال في أوّل الدورة لا في آخرها", () => {
    // مصروفٌ مضبوط ١٠٠ بلا أيّ التزام: ٣٠٠٠ مخطَّطة وراتبٌ ٢٦٠٠ → ناقصٌ ٤٠٠.
    const o = cycleOpening({ ...base, income: 2600, reserves: [] });
    expect(o.fromSalary).toBe(0);
    expect(o.rate).toBe(100);
    expect(o.planned).toBe(3000);
    expect(o.gap).toBe(-400);
  });

  it("وفجوةٌ موجبة حين يبقى من الراتب بعد الوتيرة", () => {
    const o = cycleOpening({ ...base, income: 8000, reserves: [] });
    expect(o.gap).toBe(5000);
  });

  it("بلا راتبٍ معروف لا يُخترع رقم — الفجوةُ والباقي `null`", () => {
    const o = cycleOpening({ ...base, income: null });
    expect(o.yours).toBeNull();
    expect(o.gap).toBeNull();
    expect(o.rate).toBe(20); // والمصروفُ الفعليّ يبقى معروفاً
  });

  it("الالتزاماتُ مرتّبةٌ بالأثقل، ولكلٍّ حصّتُه اليومية", () => {
    const o = cycleOpening(base);
    expect(o.commitments.map((c) => c.name)).toEqual(["الإيجار", "سداد رحلة"]);
    expect(o.commitments[0]).toMatchObject({ amount: 2000, source: "salary", perDay: 66.67 });
  });

  it("المموَّل من الفوائض لا ينقص المصروف اليومي ولا حصّةَ يومٍ له", () => {
    const o = cycleOpening({
      ...base,
      reserves: [fund("f-trip", "رحلة", [], { perCycle: 600, source: "surplus" })],
      surplusBalance: 1000,
    });
    expect(o.fromSurplus).toBe(600);
    expect(o.fromSalary).toBe(0);
    expect(o.perDay).toBe(0);
    expect(o.rate).toBe(100); // كاملٌ: مالٌ قديم لا يمسّ راتب الدورة
    expect(o.commitments[0].perDay).toBe(0);
  });

  it("الفائضُ المرحَّل يُحسب ويصير متاحاً للتمويل من الفوائض", () => {
    // رصيدُ الدورة المنتهية +١٠٠ (بدلُ يومٍ بلا صرف) يرحَّل، فتجد خطةُ الفوائض
    // ٦٠٠ ما يكفيها رغم أنّ رصيدها قبل الترحيل ٥٠٠ فقط.
    const o = cycleOpening({
      ...base,
      reserves: [fund("f-trip", "رحلة", [], { perCycle: 600, source: "surplus" })],
      surplusBalance: 500,
    });
    expect(o.carryIn).toBe(100);
    expect(o.fromSurplus).toBe(600);
  });

  it("بلا ميزانيةٍ يومية: لا ترحيل ولا وتيرة، والالتزاماتُ تبقى مقروءة", () => {
    const o = cycleOpening({ ...base, dailyBudget: null });
    expect(o.carryIn).toBe(0);
    expect(o.rate).toBe(0);
    expect(o.planned).toBe(0);
    expect(o.fromSalary).toBe(2400);
  });

  it("خطةٌ تلتهم الراتب كلَّه تُبقي المصروف صفراً لا سالباً", () => {
    const o = cycleOpening({
      ...base,
      reserves: [fund("f-rent", "الإيجار", [], { perCycle: 9000, source: "salary" })],
    });
    expect(o.rate).toBe(0);
    expect(o.planned).toBe(0);
  });

  it("طولُ دورةٍ مشوَّه لا يقسم على صفر", () => {
    const o = cycleOpening({ ...base, cycleLen: NaN });
    expect(o.cycleLen).toBe(30);
    expect(Number.isFinite(o.perDay)).toBe(true);
  });
});
