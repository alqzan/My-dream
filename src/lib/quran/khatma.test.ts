import { describe, it, expect } from "vitest";
import { khatmaJuzForPage, khatmaPct, khatmaEta } from "./khatma";

describe("khatmaJuzForPage — pages → juz", () => {
  it("maps boundaries and is monotonic non-decreasing", () => {
    expect(khatmaJuzForPage(0)).toBe(0);
    expect(khatmaJuzForPage(1)).toBe(1);
    expect(khatmaJuzForPage(604)).toBe(30);
    let prev = 0;
    for (let p = 1; p <= 604; p += 17) {
      const j = khatmaJuzForPage(p);
      expect(j).toBeGreaterThanOrEqual(prev);
      expect(j).toBeGreaterThanOrEqual(1);
      expect(j).toBeLessThanOrEqual(30);
      prev = j;
    }
  });
  it("clamps out-of-range pages", () => {
    expect(khatmaJuzForPage(9999)).toBe(30);
  });
});

describe("khatmaPct", () => {
  it("derives percentage from page", () => {
    expect(khatmaPct(0)).toBe(0);
    expect(khatmaPct(604)).toBe(100);
    expect(khatmaPct(302)).toBe(50);
  });
});

describe("khatmaEta", () => {
  it("gives no estimate without enough data", () => {
    expect(khatmaEta(5, "2026-01-31", "2026-02-01").enough).toBe(false);
    expect(khatmaEta(0, "2026-01-01", "2026-02-01").daysLeft).toBeNull();
    expect(khatmaEta(100, undefined, "2026-02-01").daysLeft).toBeNull();
  });
  it("estimates days left from the reading pace", () => {
    // بدأ 2026-01-01، اليوم 2026-01-11 (11 يوماً)، بلغ الصفحة 110 → 10 ص/يوم.
    const eta = khatmaEta(110, "2026-01-01", "2026-01-11");
    expect(eta.enough).toBe(true);
    expect(eta.perDay).toBeCloseTo(10, 5);
    expect(eta.daysLeft).toBe(Math.ceil((604 - 110) / 10)); // 50
  });
});
