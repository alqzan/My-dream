import { describe, it, expect } from "vitest";
import {
  shelfAge, isRipe, daysLeft, isWaiting, waitingItems, savedTotal, waitingTotal,
  ripenTicks, shelfState, arDays, SHELF_RIPEN_DAYS,
} from "./shelf";
import type { ShelfItem } from "./types";

const item = (id: string, placedAt: string, extra: Partial<ShelfItem> = {}): ShelfItem =>
  ({ id, name: "شيء", price: 100, placedAt, ...extra });

describe("النضوج", () => {
  it("العمرُ يُحسب بالأيام ويُقصّ عند ثلاثين", () => {
    expect(shelfAge(item("a", "2026-08-19"), "2026-08-19")).toBe(0);
    expect(shelfAge(item("a", "2026-08-09"), "2026-08-19")).toBe(10);
    expect(shelfAge(item("a", "2026-01-01"), "2026-08-19")).toBe(SHELF_RIPEN_DAYS);
  });

  it("تاريخٌ في المستقبل لا يُنتج عمراً سالباً", () => {
    expect(shelfAge(item("a", "2026-09-19"), "2026-08-19")).toBe(0);
  });

  it("ينضج عند الثلاثين لا قبلها", () => {
    expect(isRipe(item("a", "2026-07-21"), "2026-08-19")).toBe(false); // ٢٩ يوماً
    expect(isRipe(item("a", "2026-07-20"), "2026-08-19")).toBe(true);  // ٣٠
  });

  it("ما بقي يكمل الثلاثين", () => {
    expect(daysLeft(item("a", "2026-08-09"), "2026-08-19")).toBe(20);
    expect(daysLeft(item("a", "2026-01-01"), "2026-08-19")).toBe(0);
  });
});

describe("الحال", () => {
  it("ينتظرُ ما لم يُترك ولم يُشترَ", () => {
    expect(isWaiting(item("a", "2026-08-01"))).toBe(true);
    expect(isWaiting(item("b", "2026-08-01", { releasedAt: "2026-08-05" }))).toBe(false);
    expect(isWaiting(item("c", "2026-08-01", { boughtAt: "2026-08-05" }))).toBe(false);
  });

  it("جملةُ الحال تتبع الحكم", () => {
    expect(shelfState(item("a", "2026-01-01"), "2026-08-19")).toContain("نضج");
    expect(shelfState(item("b", "2026-08-18"), "2026-08-19")).toBe("يبقى ٢٩ يومًا");
    expect(shelfState(item("c", "2026-08-01", { releasedAt: "2026-08-05" }), "2026-08-19"))
      .toBe("تركتَه فوفَّرتَ ثمنَه");
    expect(shelfState(item("d", "2026-08-01", { boughtAt: "2026-08-05" }), "2026-08-19"))
      .toBe("اشتريتَه بعد نضوجه");
  });

  it("صيغةُ اليوم واليومين صحيحة", () => {
    // ٢٩ يوماً مضت ⇒ يبقى يومٌ واحد
    expect(shelfState(item("a", "2026-07-21"), "2026-08-19")).toBe("يبقى يومٌ واحد");
    expect(shelfState(item("b", "2026-07-22"), "2026-08-19")).toBe("يبقى يومان");
  });
});

describe("المجاميع", () => {
  const list = [
    item("a", "2026-08-01", { price: 900 }),
    item("b", "2026-07-01", { price: 1500, releasedAt: "2026-08-01" }),
    item("c", "2026-06-01", { price: 300, boughtAt: "2026-07-05" }),
    item("d", "2026-08-10", { price: 50 }),
  ];

  it("ما وفَّرتَه مجموعُ المتروك وحدَه", () => {
    expect(savedTotal(list)).toBe(1500);
    expect(savedTotal([])).toBe(0);
  });

  it("ما ينتظر مجموعُ ما لم يُحكم عليه", () => {
    expect(waitingTotal(list)).toBe(950);
    expect(waitingItems(list).map((i) => i.id)).toEqual(["a", "d"]);
  });

  it("ثمنٌ غائبٌ لا يُنتج NaN", () => {
    const odd = [{ id: "x", name: "س", price: undefined as unknown as number, placedAt: "2026-08-01", releasedAt: "2026-08-02" }];
    expect(savedTotal(odd)).toBe(0);
  });
});

describe("شرطاتُ النضوج", () => {
  it("ثلاثون شرطةً، الممتلئُ منها بقدر العمر", () => {
    const t = ripenTicks(item("a", "2026-08-09"), "2026-08-19");
    expect(t).toHaveLength(SHELF_RIPEN_DAYS);
    expect(t.filter((x) => x.filled)).toHaveLength(10);
  });

  it("الناضجُ كلُّه ممتلئ", () => {
    expect(ripenTicks(item("a", "2026-01-01"), "2026-08-19").every((x) => x.filled)).toBe(true);
  });
});

describe("عدُّ الأيام بعربيّةٍ سليمة", () => {
  it("مفردٌ ومثنّى بلا رقم", () => {
    expect(arDays(1)).toBe("يومٌ واحد");
    expect(arDays(2)).toBe("يومان");
  });

  it("جمعُ القلّة من ثلاثةٍ إلى عشرة — «٤ أيام» لا «٤ يومًا»", () => {
    expect(arDays(4)).toBe("٤ أيام");
    expect(arDays(10)).toBe("١٠ أيام");
  });

  it("تمييزٌ مفردٌ منصوب فوق العشرة", () => {
    expect(arDays(11)).toBe("١١ يومًا");
    expect(arDays(26)).toBe("٢٦ يومًا");
  });

  it("أرقامُه هندية دائماً — لا يشذُّ رقمٌ لاتينيّ وسط شاشةٍ هندية", () => {
    for (const n of [3, 7, 12, 30]) expect(arDays(n)).not.toMatch(/[0-9]/);
  });

  it("جملةُ الحال تستعمله فلا يُقرأ «يبقى ٤ يومًا»", () => {
    expect(shelfState(item("a", "2026-08-15"), "2026-08-19")).toBe("يبقى ٢٦ يومًا");
    expect(shelfState(item("b", "2026-07-27"), "2026-08-19")).toBe("يبقى ٧ أيام");
  });
});
