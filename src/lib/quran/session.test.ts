import { describe, it, expect } from "vitest";
import { buildTodayPlan, isValidSessionSnapshot } from "./session";
import { coveredToday, recentReviewBand } from "./hifz";
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

  // كانت الجلسة تعود بعد إتمامها: تسجيلُ ورد اليوم يُقدّم الجبهة فتنزلق نافذة
  // «القريبة»، فلا تعُد مراجعةُ الجلسة تحيط بالنافذة الجديدة فتُطلَب من جديد.
  it("القريبة لا تعود بعد أن يُقدّم ورد اليوم الجبهة", () => {
    const p3 = pageRange(3);
    const p4 = pageRange(4);
    const s = hz({
      frontierId: p4.end, // الجبهة تقدّمت بورد اليوم
      sessions: [
        sess(1, p3.end, "2026-01-01", 3),
        sess(p3.end + 1, p4.end, "2026-01-10", 3), // ورد اليوم
      ],
      reviews: [rev(1, p3.end, "2026-01-10", 3)], // القريبة كما كانت قبل الورد
    });
    const band = recentReviewBand(s)!;
    expect(band.toId).toBe(p4.end); // النافذة انزلقت فعلاً
    expect(coveredToday(s, band, "2026-01-10")).toBe(true);
    expect(buildTodayPlan(s, "2026-01-10").steps.some((x) => x.kind === "recent")).toBe(false);
  });

  it("ثغرةٌ في مدايات اليوم تُبقي القريبة مطلوبة", () => {
    const p3 = pageRange(3);
    const s = hz({
      frontierId: p3.end,
      sessions: [sess(1, p3.end, "2026-01-01", 3)],
      reviews: [rev(p3.start + 2, p3.end, "2026-01-10", 3)], // أوّل النافذة لم يُراجَع
    });
    expect(buildTodayPlan(s, "2026-01-10").steps.some((x) => x.kind === "recent")).toBe(true);
  });

  // السقف يوميّ: خمسة مواضع في اليوم لا خمسةٌ لكلّ دفعة — وإلا طرح الباقي نفسه
  // جلسةً جديدة فلا تنتهي جلسة اليوم أبداً.
  it("سقف مواضع الخطأ يوميّ: ما اختُبِر اليوم يُخصَم منه", () => {
    const p2 = pageRange(2);
    const seven = Array.from({ length: 7 }, (_, i) => mist(`m${i}`, p2.start + i));
    const fresh = hz({ frontierId: p2.end, sessions: [sess(1, p2.end, "2026-01-10", 3)], mistakes: seven });
    expect(buildTodayPlan(fresh, "2026-01-10").drills).toBe(5); // سقف «متوازن»

    // اختُبرت خمسةٌ اليوم (أُغلق منها اثنان) ⇒ لا مواضع أخرى اليوم
    const after = hz({
      frontierId: p2.end,
      sessions: [sess(1, p2.end, "2026-01-10", 3)],
      mistakes: seven.map((m, i) =>
        i < 5 ? { ...m, lastDrill: "2026-01-10", resolved: i < 2 } : m,
      ),
    });
    const plan = buildTodayPlan(after, "2026-01-10");
    expect(plan.drills).toBe(0);
    expect(plan.steps.some((x) => x.kind === "drill")).toBe(false);
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

describe("isValidSessionSnapshot — لا نستأنف لقطةً مشوّهة", () => {
  const valid = {
    date: "2026-01-10",
    steps: [{ kind: "memorize", portion: { fromId: 1, toId: 7 } }],
    idx: 0,
    tally: { memorized: 0, reviewed: 0, mistakesClosed: 0 },
  };

  it("يقبل لقطةً صحيحةً لليوم", () => {
    expect(isValidSessionSnapshot(valid, "2026-01-10")).toBe(true);
  });

  it("يرفض idx سالباً أو خارج النطاق وحقول الخطوة غير الصالحة", () => {
    expect(isValidSessionSnapshot({ ...valid, idx: -1 }, "2026-01-10")).toBe(false);
    expect(isValidSessionSnapshot({ ...valid, idx: 1 }, "2026-01-10")).toBe(false);
    expect(isValidSessionSnapshot({ ...valid, steps: [{ kind: "memorize", portion: { fromId: 0, toId: 7 } }] }, "2026-01-10")).toBe(false);
    expect(isValidSessionSnapshot({ ...valid, steps: [{ kind: "memorize", portion: { fromId: 1, toId: 6237 } }] }, "2026-01-10")).toBe(false);
    expect(isValidSessionSnapshot({ ...valid, tally: { memorized: "1", reviewed: 0, mistakesClosed: 0 } }, "2026-01-10")).toBe(false);
  });
});
