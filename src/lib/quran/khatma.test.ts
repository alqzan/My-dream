import { describe, it, expect } from "vitest";
import { khatmaJuzForPage, khatmaPct, khatmaEta, khatmaDaysForGoal, pagesReadOn } from "./khatma";

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
  it("falls back to since-start pace when there is no page log", () => {
    // بدأ 2026-01-01، اليوم 2026-01-11 (11 يوماً)، بلغ الصفحة 110 → 10 ص/يوم.
    const eta = khatmaEta(110, "2026-01-01", "2026-01-11");
    expect(eta.enough).toBe(true);
    expect(eta.perDay).toBeCloseTo(10, 5);
    expect(eta.window).toBeNull();
    expect(eta.daysLeft).toBe(Math.ceil((604 - 110) / 10)); // 50
  });

  it("prefers the recent (last-14-day) pace over the since-start pace", () => {
    // بدأ بطيئاً ثم تسارع مؤخراً: منذ البداية ≈ 4 ص/يوم، لكن آخر 7 أيام ≈ 20.
    const log = [
      { date: "2026-01-01", page: 20 },
      { date: "2026-01-24", page: 100 }, // نقطة قبل نافذة 14 يوماً
      { date: "2026-01-27", page: 160 },
      { date: "2026-01-31", page: 240 }, // اليوم
    ];
    const eta = khatmaEta(240, "2026-01-01", "2026-01-31", log);
    expect(eta.window).toBe(14); // حُسبت على النافذة الأخيرة
    // الأساس داخل النافذة = 2026-01-24 (100)، الأيام = 7، الفرق = 140 → 20 ص/يوم.
    expect(eta.perDay).toBeCloseTo(20, 5);
    expect(eta.daysLeft).toBe(Math.ceil((604 - 240) / 20)); // 19
  });
});

describe("khatma daily page goal", () => {
  it("derives khatma length from a daily goal", () => {
    expect(khatmaDaysForGoal(20)).toBe(Math.ceil(604 / 20)); // 31 ≈ شهر
    expect(khatmaDaysForGoal(604)).toBe(1);
  });
  it("counts pages read on a given day from the log", () => {
    const log = [
      { date: "2026-01-10", page: 100 },
      { date: "2026-01-11", page: 118 },
    ];
    expect(pagesReadOn(log, "2026-01-11", 118)).toBe(18); // 118 − 100
    expect(pagesReadOn(log, "2026-01-10", 100)).toBe(100); // لا نقطة قبله → من الصفر
    expect(pagesReadOn([], "2026-01-11", 0)).toBe(0);
  });
});
