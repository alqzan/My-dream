import { describe, expect, it } from "vitest";
import { graceStreak } from "./utils";

const asOf = new Date(2026, 7, 22);
const day = (offset: number) => {
  const d = new Date(asOf);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("graceStreak — ستريك البهو بمهلة يوم واحد", () => {
  it("لا يعرض إنجازاً منفرداً كستريك", () => {
    expect(graceStreak([day(0)], asOf)).toEqual({ days: 1, graceDay: false });
    expect(graceStreak([day(-1)], asOf)).toEqual({ days: 1, graceDay: true });
  });

  it("يحافظ على السلسلة بعد غياب يوم واحد", () => {
    expect(graceStreak([day(0), day(-2), day(-3)], asOf)).toEqual({ days: 3, graceDay: false });
    expect(graceStreak([day(-1), day(-2), day(-3)], asOf)).toEqual({ days: 3, graceDay: true });
  });

  it("يكسر السلسلة بعد غياب يومين متتاليين", () => {
    expect(graceStreak([day(-2), day(-3), day(-4)], asOf)).toEqual({ days: 0, graceDay: false });
  });

  it("يتجاهل التواريخ المستقبلية والمشوّهة", () => {
    expect(graceStreak([day(1), "2026-02-31", day(0)], asOf)).toEqual({ days: 1, graceDay: false });
  });
});
