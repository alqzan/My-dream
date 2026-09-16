import { describe, it, expect } from "vitest";
import { nudgeHidden, nudgeToken, nudgesEnabled, sanitizeNudgePrefs } from "./nudgePrefs";

describe("تفضيلُ التذكيرات", () => {
  it("الافتراضُ إظهار — غيابُ التفضيل ليس إطفاءً", () => {
    expect(nudgesEnabled(sanitizeNudgePrefs(null))).toBe(true);
    expect(nudgesEnabled(sanitizeNudgePrefs({}))).toBe(true);
  });

  it("الإطفاءُ الصريح وحده يُطفئ", () => {
    expect(nudgesEnabled(sanitizeNudgePrefs({ on: false }))).toBe(false);
    expect(nudgesEnabled(sanitizeNudgePrefs({ on: true }))).toBe(true);
  });

  it("قيمةٌ تالفة تُقرأ غياباً لا كسراً", () => {
    expect(sanitizeNudgePrefs("نصّ")).toEqual({});
    expect(sanitizeNudgePrefs({ on: "ربما", hidden: 7 })).toEqual({});
  });

  it("إخفاءُ حصادِ اليوم لا يُخفي افتتاحَ الغد", () => {
    const prefs = { hidden: nudgeToken("2026-09-16", "evening") };
    expect(nudgeHidden(prefs, nudgeToken("2026-09-16", "evening"))).toBe(true);
    expect(nudgeHidden(prefs, nudgeToken("2026-09-16", "morning"))).toBe(false);
    expect(nudgeHidden(prefs, nudgeToken("2026-09-17", "evening"))).toBe(false);
  });
});
