import { describe, it, expect } from "vitest";
import { buildTodayPlan } from "./session";
import { pageRange, idToPage } from "./meta";
import type { HifzState, HifzSession, HifzReviewLog, HifzRating, HifzMistake } from "../types";

function hz(o: Partial<HifzState> = {}): HifzState {
  return { plan: { startId: 1, unit: "page", amount: 1, createdAt: "2026-01-01" }, frontierId: 0, sessions: [], reviews: [], mistakes: [], ...o };
}
let n = 0;
const sess = (fromId: number, toId: number, date: string, rating?: HifzRating): HifzSession =>
  ({ id: `s${n++}`, fromId, toId, date, rating });
const rev = (fromId: number, toId: number, date: string, rating?: HifzRating): HifzReviewLog =>
  ({ id: `r${n++}`, fromId, toId, date, rating });
const mist = (id: string, ayahId: number, extra: Partial<HifzMistake> = {}): HifzMistake =>
  ({ id, ayahId, wordIndex: 0, word: "و", hits: ["2026-01-01"], resolved: false, updatedAt: "2026-01-01", ...extra });

describe("buildTodayPlan — مسارٌ واحد مرتّب لعمل اليوم", () => {
  it("يرتّب الخطوات: السَّبْق ثمّ القريبة ثمّ المستحقّ ثمّ الأخطاء", () => {
    const p8 = pageRange(8);
    const s = hz({
      frontierId: p8.end,
      sessions: [sess(1, p8.end, "2026-01-01")],
      mistakes: [mist("m1", 3)],
    });
    const kinds = buildTodayPlan(s, "2026-01-10").steps.map((x) => x.kind);
    expect(kinds[0]).toBe("memorize");
    expect(kinds[1]).toBe("recent");
    expect(kinds.filter((k) => k === "due").length).toBeGreaterThan(0);
    expect(kinds.indexOf("drill")).toBeGreaterThan(kinds.lastIndexOf("due"));
  });

  it("لا يعرض الوجه الواحد مرّتين: المستحقّ لا يتقاطع مع المراجعة القريبة", () => {
    const p8 = pageRange(8);
    const s = hz({ frontierId: p8.end, sessions: [sess(1, p8.end, "2026-01-01")] });
    const plan = buildTodayPlan(s, "2026-01-10");
    const band = plan.steps.find((x) => x.kind === "recent")!;
    const bandPages = new Set<number>();
    if (band.kind === "recent") {
      for (let p = idToPage(band.portion.fromId); p <= idToPage(band.portion.toId); p++) bandPages.add(p);
    }
    for (const st of plan.steps) {
      if (st.kind === "due") expect(bandPages.has(st.page)).toBe(false);
    }
  });

  it("السَّبْق يسقط بعد تسجيل ورد الحفظ اليوم", () => {
    const p2 = pageRange(2);
    const s = hz({ frontierId: p2.end, sessions: [sess(1, p2.end, "2026-01-10")] });
    const plan = buildTodayPlan(s, "2026-01-10");
    expect(plan.newPortion).toBeNull();
    expect(plan.steps.some((x) => x.kind === "memorize")).toBe(false);
  });

  it("المراجعة القريبة لا تتكرّر إن سُجّلت اليوم", () => {
    const p3 = pageRange(3);
    const s = hz({
      frontierId: p3.end,
      sessions: [sess(1, p3.end, "2026-01-01", 3)],
      reviews: [rev(1, p3.end, "2026-01-10", 3)],
    });
    expect(buildTodayPlan(s, "2026-01-10").steps.some((x) => x.kind === "recent")).toBe(false);
  });

  it("لا خطوات ولا اقتراح حين لا خطة", () => {
    const plan = buildTodayPlan(hz({ plan: null }), "2026-01-10");
    expect(plan.steps).toHaveLength(0);
    expect(plan.summary).toContain("لا شيء");
  });

  it("الملخّص يذكر الجديد والمراجعة والأخطاء بأرقامٍ لاتينية", () => {
    const p8 = pageRange(8);
    const s = hz({
      frontierId: p8.end,
      sessions: [sess(1, p8.end, "2026-01-01")],
      mistakes: [mist("m1", 3), mist("m2", 4)],
    });
    const { summary } = buildTodayPlan(s, "2026-01-10");
    expect(summary).toContain("للمراجعة");
    expect(summary).toContain("موضعان للاختبار".slice(0, 6));
    expect(summary).toMatch(/[0-9]/); // أرقام لاتينية لا هندية
  });

  it("الوقت التقريبي موجبٌ دائماً حين يوجد عمل", () => {
    const p2 = pageRange(2);
    const s = hz({ frontierId: p2.end, sessions: [sess(1, p2.end, "2026-01-01")] });
    expect(buildTodayPlan(s, "2026-01-10").estMinutes).toBeGreaterThan(0);
  });

  it("المؤجَّل يُحتسب حين تتجاوز المستحقّات سقف اليوم", () => {
    const p30 = pageRange(30);
    const s = hz({ frontierId: p30.end, sessions: [sess(1, p30.end, "2026-01-01")] });
    const plan = buildTodayPlan(s, "2026-01-10");
    expect(plan.duePages).toBe(7); // سقف «متوازن»
    expect(plan.dueHidden).toBeGreaterThan(0);
  });
});
