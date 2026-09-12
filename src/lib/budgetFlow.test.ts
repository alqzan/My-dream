import { describe, it, expect } from "vitest";
import { cyclePace, offsetPlan, expenseWeight, EVENT_DAYS } from "./budgetFlow";

describe("cyclePace — البدل المعدَّل لبقيّة الدورة", () => {
  it("يوزّع العجز على الأيام الباقية بدل عرضه رقماً سالباً وحده", () => {
    // عجز ٣٥٠ وبدلٌ ١٠٠ وعشرة أيام باقية → (−350 + 1000) ÷ 10 = 65
    const p = cyclePace(-350, 100, 10);
    expect(p.rate).toBe(65);
    expect(p.delta).toBe(-35);
    expect(p.kind).toBe("tighten");
  });

  it("يرفع الوتيرة حين يكون الرصيد فائضاً", () => {
    const p = cyclePace(300, 100, 10);
    expect(p.rate).toBe(130);
    expect(p.kind).toBe("ahead");
  });

  it("«على البدل» حين يكون الرصيد صفراً", () => {
    expect(cyclePace(0, 100, 12).rate).toBe(100);
    expect(cyclePace(0, 100, 12).kind).toBe("onTrack");
  });

  it("عجزٌ أعمق من أن تمتصّه الأيام يُعلَن قراراً لا تشدّداً", () => {
    // −1800 على ١٠ أيام ببدل ١٠٠ → 100 − 180 = −80 ر.س/يوم: مستحيل
    const p = cyclePace(-1800, 100, 10);
    expect(p.rate).toBeLessThan(0);
    expect(p.kind).toBe("beyond");
  });

  it("يومُ الراتب نفسه يومٌ يُصرف فيه لا صفرَ أيام (لا قسمة على صفر)", () => {
    const p = cyclePace(-20, 100, 0);
    expect(p.daysLeft).toBe(1);
    expect(p.rate).toBe(80);
  });

  it("لا ينهار على قيمٍ مشوّهة من نسخةٍ احتياطية", () => {
    for (const bad of [NaN, Infinity, undefined as unknown as number]) {
      expect(() => cyclePace(bad, bad, bad)).not.toThrow();
      expect(Number.isFinite(cyclePace(bad, bad, bad).rate)).toBe(true);
    }
  });
});

describe("offsetPlan — المقاصة التلقائية من الفوائض", () => {
  it("لا شيء حين لا عجز", () => {
    expect(offsetPlan(120, 900, 100, true).reason).toBe("none");
    expect(offsetPlan(120, 900, 100, true).amount).toBe(0);
  });

  it("يغطّي العجز العاديّ كاملاً", () => {
    const p = offsetPlan(-180, 900, 100, true);
    expect(p.amount).toBe(180);
    expect(p.reason).toBe("covered");
  });

  it("يغطّي ما تسمح به الفوائض حين تقلّ عن العجز", () => {
    const p = offsetPlan(-180, 50, 100, true);
    expect(p.amount).toBe(50);
    expect(p.reason).toBe("partial");
  });

  it("**يقف** عند عجزٍ أكبر من ثلاث يوميّات: حدثٌ لا عجزٌ يوميّ", () => {
    const p = offsetPlan(-1200, 5000, 100, true);
    expect(p.amount).toBe(0);
    expect(p.reason).toBe("tooBig");
    expect(p.cap).toBe(100 * EVENT_DAYS);
  });

  it("حدُّ السقف نفسه يُغطّى (٣ يوميّات بالضبط) وما فوقه لا", () => {
    expect(offsetPlan(-300, 5000, 100, true).reason).toBe("covered");
    expect(offsetPlan(-300.5, 5000, 100, true).reason).toBe("tooBig");
  });

  it("موقوفةً من الإعدادات لا تتحرّك، ويبقى العجز معلوماً", () => {
    const p = offsetPlan(-180, 900, 100, false);
    expect(p.amount).toBe(0);
    expect(p.reason).toBe("off");
    expect(p.deficit).toBe(180);
  });

  it("بلا رصيدٍ في الفوائض لا سحب", () => {
    expect(offsetPlan(-180, 0, 100, true).reason).toBe("noSurplus");
    expect(offsetPlan(-180, -40, 100, true).amount).toBe(0);
  });

  it("بلا بدلٍ يوميّ لا سقف يقاس عليه — فلا تُمنع التغطية بسببه", () => {
    const p = offsetPlan(-500, 900, 0, true);
    expect(p.cap).toBe(0);
    expect(p.amount).toBe(500);
  });
});

describe("expenseWeight — وزنُ المصروف بأيّام البدل", () => {
  it("رحلةٌ بألفين على بدلِ مئتين = عشرة أيام → حدث", () => {
    const w = expenseWeight(2000, 200);
    expect(w.days).toBe(10);
    expect(w.big).toBe(true);
  });

  it("قهوةٌ بعشرين ليست حدثاً", () => {
    expect(expenseWeight(20, 200).big).toBe(false);
  });

  it("الحدُّ نفسه (٣ يوميّات) حدث", () => {
    expect(expenseWeight(600, 200).big).toBe(true);
    expect(expenseWeight(599, 200).big).toBe(false);
  });

  it("بلا ميزانيةٍ يومية لا مقياس — فلا وزن", () => {
    expect(expenseWeight(2000, 0)).toEqual({ days: 0, big: false });
  });
});
