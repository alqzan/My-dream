import { describe, it, expect } from "vitest";
import { dailyQuestion, ALL_QUESTIONS } from "./questions";

describe("سؤالُ اليوم سنويٌّ حقيقةً", () => {
  it("**نفسُ اليوم من كلّ عامٍ نفسُ السؤال** — وإلّا فعبارة «جوابُك على السؤال نفسه» كذبة", () => {
    for (const md of ["01-01", "02-29", "08-19", "12-31"]) {
      const q = dailyQuestion(`2026-${md}`);
      expect(dailyQuestion(`2025-${md}`)).toBe(q);
      expect(dailyQuestion(`2019-${md}`)).toBe(q);
    }
  });

  it("أيامٌ مختلفةٌ تُعطي أسئلةً مختلفة في الغالب", () => {
    const qs = new Set(
      Array.from({ length: 60 }, (_, i) => dailyQuestion(`2026-03-${String(i % 28 + 1).padStart(2, "0")}`))
    );
    expect(qs.size).toBeGreaterThan(5);
  });

  it("حتميٌّ في اليوم الواحد مهما أُعيد النداء", () => {
    const a = dailyQuestion("2026-08-19");
    expect(dailyQuestion("2026-08-19")).toBe(a);
    expect(ALL_QUESTIONS).toContain(a);
  });

  it("مفتاحٌ قصيرٌ أو مشوّهٌ لا يرمي ولا يُرجع undefined", () => {
    expect(typeof dailyQuestion("")).toBe("string");
    expect(ALL_QUESTIONS).toContain(dailyQuestion("08-19"));
  });
});
