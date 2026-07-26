import { describe, it, expect } from "vitest";
import {
  assetStatus, dailyDepreciation, assetsOverview, depreciationInMonth,
  validateAssetDraft, assetEndDate, MAX_LIFE_DAYS,
} from "./assets";
import type { Asset } from "./types";

function asset(over: Partial<Asset> = {}): Asset {
  return {
    id: "a1",
    name: "لابتوب",
    purchaseDate: "2026-01-01",
    purchasePrice: 3650,
    lifeDays: 365,
    createdAt: "2026-01-01",
    ...over,
  };
}

describe("الإهلاك اليوميّ", () => {
  it("يوزّع الثمن على أيام العمر بالتساوي", () => {
    expect(dailyDepreciation(asset())).toBe(10);
  });

  it("يستثني القيمة المتبقّية من القابل للإهلاك", () => {
    expect(dailyDepreciation(asset({ purchasePrice: 4015, salvageValue: 365 }))).toBe(10);
  });

  it("يوم الشراء نفسه صفر استهلاك", () => {
    const s = assetStatus(asset(), "2026-01-01");
    expect(s.daysOwned).toBe(0);
    expect(s.depreciated).toBe(0);
    expect(s.bookValue).toBe(3650);
  });

  it("يستهلك يوماً بيوم", () => {
    const s = assetStatus(asset(), "2026-01-11");
    expect(s.daysOwned).toBe(10);
    expect(s.depreciated).toBe(100);
    expect(s.bookValue).toBe(3550);
    expect(s.pct).toBe(3);
  });

  it("لا ينزل تحت القيمة المتبقّية بعد انتهاء العمر", () => {
    const s = assetStatus(asset({ purchasePrice: 4015, salvageValue: 365 }), "2030-01-01");
    expect(s.expired).toBe(true);
    expect(s.bookValue).toBe(365);
    expect(s.remainingDays).toBe(0);
    expect(s.pct).toBe(100);
  });

  it("تاريخ شراءٍ مستقبليّ لا يستهلك شيئاً", () => {
    const s = assetStatus(asset({ purchaseDate: "2026-06-01" }), "2026-01-01");
    expect(s.future).toBe(true);
    expect(s.depreciated).toBe(0);
    expect(s.bookValue).toBe(3650);
  });

  it("البيع يجمّد العدّاد ويحسب الربح/الخسارة على قيمة يوم البيع", () => {
    const s = assetStatus(asset({ soldDate: "2026-01-11", soldPrice: 3600 }), "2026-03-01");
    expect(s.daysOwned).toBe(10);
    expect(s.bookValue).toBe(3550);
    expect(s.saleResult).toBe(50); // بِعتَه بأغلى من قيمته الدفترية
  });

  it("عمرٌ فاسد يُقلَّم بدل القسمة على صفر", () => {
    expect(Number.isFinite(dailyDepreciation(asset({ lifeDays: 0 })))).toBe(true);
    expect(assetStatus(asset({ lifeDays: 99999 }), "2026-01-01").lifeDays).toBe(MAX_LIFE_DAYS);
  });

  it("قيمةٌ متبقّية أكبر من الثمن لا تجعل الإهلاك سالباً", () => {
    expect(dailyDepreciation(asset({ purchasePrice: 100, salvageValue: 500 }))).toBe(0);
  });

  it("نهاية العمر = الشراء + الأيام", () => {
    expect(assetEndDate(asset())).toBe("2027-01-01");
  });
});

describe("استهلاك شهرٍ بعينه", () => {
  it("يحسب أيام الشهر وحدها", () => {
    expect(depreciationInMonth(asset(), "2026-02")).toBe(280); // ٢٨ يوماً × ١٠
  });
  it("صفرٌ قبل الشراء", () => {
    expect(depreciationInMonth(asset(), "2025-11")).toBe(0);
  });
});

describe("نظرة الأصول", () => {
  it("تجمع القيمة الدفترية والاستهلاك اليوميّ وتستثني المباع", () => {
    const o = assetsOverview(
      [
        asset(),
        asset({ id: "a2", purchasePrice: 730, lifeDays: 365 }),
        asset({ id: "a3", soldDate: "2026-01-06", soldPrice: 3700 }),
      ],
      "2026-01-11"
    );
    expect(o.count).toBe(2);
    expect(o.totalCost).toBe(4380);
    expect(o.perDay).toBe(12);
    expect(o.perMonth).toBe(360);
    expect(o.bookValue).toBe(3550 + 710);
    expect(o.soldResult).toBe(100); // بيع بـ3700 وقيمته يومها 3600
  });
});

describe("تحقّق المدخلات", () => {
  it("يقبل أصلاً سليماً", () => {
    expect(validateAssetDraft({ name: "جوّال", purchasePrice: 4000, purchaseDate: "2026-01-01", lifeDays: 730 })).toEqual([]);
  });
  it("يرفض الثمن الصفري والقيمة المتبقّية الأكبر من الثمن", () => {
    expect(validateAssetDraft({ name: "x", purchasePrice: 0, purchaseDate: "2026-01-01", lifeDays: 365 }).length).toBe(1);
    expect(
      validateAssetDraft({ name: "x", purchasePrice: 100, purchaseDate: "2026-01-01", lifeDays: 365, salvageValue: 200 }).length
    ).toBe(1);
  });
});
