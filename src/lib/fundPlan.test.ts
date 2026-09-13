import { describe, it, expect } from "vitest";
import {
  suggestPayoffPerCycle, cycleFundingAmount, fundingDone, fundingPerDay,
  effectiveDailyRate, fundingPreview, cyclesRemaining, PAYOFF_CYCLES, MAX_PAYOFF_CYCLES,
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
