import { describe, it, expect } from "vitest";
import { buildTodayPlan, isValidSessionSnapshot, lastSabaq, halfPortion, reviewRuns, type SessionStep, type ReviewRun } from "./session";
import type { DuePage } from "./schedule";
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
const runsOf = (steps: SessionStep[]): ReviewRun[] => {
  const r = steps.find((x) => x.kind === "review");
  return r && r.kind === "review" ? r.runs : [];
};
const hasRecent = (steps: SessionStep[]) => runsOf(steps).some((r) => r.recent);
const mist = (id: string, ayahId: number, extra: Partial<HifzMistake> = {}): HifzMistake =>
  ({ id, ayahId, wordIndex: 0, word: "و", hits: ["2026-01-01"], resolved: false, updatedAt: "2026-01-01", ...extra });

describe("buildTodayPlan — مسارٌ واحد مرتّب لعمل اليوم", () => {
  it("يرتّب الخطوات: السَّبْق ثمّ المراجعة (خطوةٌ واحدة) ثمّ الأخطاء", () => {
    const p8 = pageRange(8);
    const s = hz({
      frontierId: p8.end,
      sessions: [sess(1, p8.end, "2026-01-01")],
      mistakes: [mist("m1", 3)],
    });
    const kinds = buildTodayPlan(s, "2026-01-10").steps.map((x) => x.kind);
    expect(kinds[0]).toBe("memorize");
    expect(kinds[1]).toBe("review");
    expect(kinds.filter((k) => k === "review")).toHaveLength(1);
    expect(kinds).not.toContain("due");
    expect(kinds).not.toContain("recent");
    expect(kinds.indexOf("drill")).toBeGreaterThan(kinds.indexOf("review"));
  });

  // طلبُ المالك: عشرةُ أوجهٍ مستحقّة كانت عشرَ خطوات — والمطلوب مرّةٌ واحدة.
  it("المستحقُّ والقريبة المتجاورة مقطعٌ واحد بترتيب المصحف", () => {
    const p8 = pageRange(8);
    const s = hz({ frontierId: p8.end, sessions: [sess(1, p8.end, "2026-01-01")] });
    const plan = buildTodayPlan(s, "2026-01-10");
    const runs = runsOf(plan.steps);
    // الأوجه كلّها مستحقّة ومتجاورة، والقريبة في ذيلها ⇒ مقطعٌ واحد
    expect(runs).toHaveLength(1);
    expect(runs[0].recent).toBe(true);
    expect(runs[0].due).toBe(plan.duePages);
    expect(runs[0].portion.toId).toBe(p8.end);
  });

  it("لا يعرض الوجه الواحد مرّتين: المقاطع لا تتقاطع", () => {
    const p30 = pageRange(30);
    const s = hz({ frontierId: p30.end, sessions: [sess(1, p30.end, "2026-01-01")] });
    const runs = runsOf(buildTodayPlan(s, "2026-01-10").steps);
    const seen = new Set<number>();
    for (const r of runs) {
      for (let p = idToPage(r.portion.fromId); p <= idToPage(r.portion.toId); p++) {
        expect(seen.has(p)).toBe(false);
        seen.add(p);
      }
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
    expect(hasRecent(buildTodayPlan(s, "2026-01-10").steps)).toBe(false);
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
    expect(hasRecent(buildTodayPlan(s, "2026-01-10").steps)).toBe(false);
  });

  it("ثغرةٌ في مدايات اليوم تُبقي القريبة مطلوبة", () => {
    const p3 = pageRange(3);
    const s = hz({
      frontierId: p3.end,
      sessions: [sess(1, p3.end, "2026-01-01", 3)],
      reviews: [rev(p3.start + 2, p3.end, "2026-01-10", 3)], // أوّل النافذة لم يُراجَع
    });
    expect(hasRecent(buildTodayPlan(s, "2026-01-10").steps)).toBe(true);
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

  it("الملخّص يذكر الجديد والمراجعة والأخطاء بأرقامٍ هندية", () => {
    const p8 = pageRange(8);
    const s = hz({
      frontierId: p8.end,
      sessions: [sess(1, p8.end, "2026-01-01")],
      mistakes: [mist("m1", 3), mist("m2", 4)],
    });
    const { summary } = buildTodayPlan(s, "2026-01-10");
    expect(summary).toContain("للمراجعة");
    expect(summary).toContain("موضعان للاختبار".slice(0, 6));
    // قاعدةُ مدار: الأرقام كلُّها هندية (٠٫١٫٣٥٨). كان هذا الملخّص آخرَ ما بقي
    // لاتينياً في القسم، فيظهر رقمٌ شاذّ وسط شاشةٍ هندية.
    expect(summary).not.toMatch(/[0-9]/);
    expect(summary).toMatch(/[٠-٩]/);
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
    // السقف يتكيّف مع المواظبة: جلسةٌ واحدة في أسبوعين ⇒ أقلُّ من سقف «متوازن».
    expect(plan.duePages).toBe(plan.dueCap);
    expect(plan.dueCap).toBe(5);
    expect(plan.dueHidden).toBeGreaterThan(0);
  });
});

describe("reviewRuns — مراجعة اليوم مقاطعُ متّصلة", () => {
  const due = (page: number, extra: Partial<DuePage> = {}): DuePage => {
    const r = pageRange(page);
    return { page, portion: { fromId: r.start, toId: r.end }, overdueDays: 0, lapses: 0, mistakes: 0, risk: 1, neverReviewed: false, ...extra };
  };

  it("يرتّب بالمصحف لا بالخطر، ويصل المتجاور، ويفصل المتباعد", () => {
    // الطابور بالخطر: ٤٠ ثمّ ١٢ ثمّ ١٤ ثمّ ١٣
    const runs = reviewRuns(null, [due(40), due(12, { overdueDays: 3 }), due(14, { lapses: 2 }), due(13, { neverReviewed: true })], null);
    expect(runs.map((r) => [idToPage(r.portion.fromId), idToPage(r.portion.toId)])).toEqual([[12, 14], [40, 40]]);
    expect(runs[0]).toMatchObject({ due: 3, never: 1, overdueDays: 3, lapses: 2 });
  });

  it("الاختبار مقطعٌ في الآخر، ويسقط إن تقاطع مع المراجعة", () => {
    const t = { fromId: pageRange(50).start, toId: pageRange(50).end };
    const withTest = reviewRuns(null, [due(12)], t);
    expect(withTest.at(-1)).toMatchObject({ test: true, portion: t });
    const overlap = { fromId: pageRange(12).start + 1, toId: pageRange(12).end };
    expect(reviewRuns(null, [due(12)], overlap).some((r) => r.test)).toBe(false);
  });

  it("لا مقاطع حين لا شيء", () => {
    expect(reviewRuns(null, [], null)).toEqual([]);
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

  it("يقبل خطوة المراجعة بمقاطعها وتقدّمها، ولقطاتٍ أقدم بخطوات due/recent", () => {
    const review = { ...valid, steps: [{ kind: "review", runs: [{ portion: { fromId: 1, toId: 7 }, recent: true }, { portion: { fromId: 30, toId: 40 }, due: 1 }] }], sub: 1 };
    expect(isValidSessionSnapshot(review, "2026-01-10")).toBe(true);
    expect(isValidSessionSnapshot({ ...review, steps: [{ kind: "review", runs: [] }] }, "2026-01-10")).toBe(false);
    expect(isValidSessionSnapshot({ ...review, sub: -1 }, "2026-01-10")).toBe(false);
    const legacy = { ...valid, steps: [{ kind: "due", portion: { fromId: 1, toId: 7 }, page: 1, overdueDays: 0, never: true }] };
    expect(isValidSessionSnapshot(legacy, "2026-01-10")).toBe(true);
  });

  it("يرفض idx سالباً أو خارج النطاق وحقول الخطوة غير الصالحة", () => {
    expect(isValidSessionSnapshot({ ...valid, idx: -1 }, "2026-01-10")).toBe(false);
    expect(isValidSessionSnapshot({ ...valid, idx: 1 }, "2026-01-10")).toBe(false);
    expect(isValidSessionSnapshot({ ...valid, steps: [{ kind: "memorize", portion: { fromId: 0, toId: 7 } }] }, "2026-01-10")).toBe(false);
    expect(isValidSessionSnapshot({ ...valid, steps: [{ kind: "memorize", portion: { fromId: 1, toId: 6237 } }] }, "2026-01-10")).toBe(false);
    expect(isValidSessionSnapshot({ ...valid, tally: { memorized: "1", reviewed: 0, mistakesClosed: 0 } }, "2026-01-10")).toBe(false);
  });
});

describe("ميزانُ الجديد والقديم — لا جديد على قديمٍ مهزوز", () => {
  const p1 = pageRange(1), p2 = pageRange(2);

  it("وردُ أمس «يحتاج إتقاناً» ⇒ تثبيتٌ أوّلاً ولا جديد", () => {
    const s = hz({
      frontierId: p2.end,
      sessions: [sess(p2.start, p2.end, "2026-01-09", 1), sess(1, p1.end, "2026-01-08", 3)],
    });
    const plan = buildTodayPlan(s, "2026-01-10");
    expect(plan.pace).toBe("hold");
    expect(plan.newPortion).toBeNull();
    expect(plan.paceNote).toBeTruthy();
    expect(plan.steps[0]).toEqual({ kind: "consolidate", portion: { fromId: p2.start, toId: p2.end } });
    expect(plan.steps.some((x) => x.kind === "memorize")).toBe(false);
    // والمقطعُ نفسه لا يُعاد في القريبة ولا في المستحقّ
    for (const r of runsOf(plan.steps)) expect(r.portion.toId).toBeLessThan(p2.start);
  });

  it("إذا ثبّتَه في مراجعةٍ لاحقة بإتقان عاد الجديد", () => {
    const s = hz({
      frontierId: p2.end,
      sessions: [sess(p2.start, p2.end, "2026-01-09", 1), sess(1, p1.end, "2026-01-08", 3)],
      reviews: [rev(p2.start, p2.end, "2026-01-09", 3)],
    });
    const plan = buildTodayPlan(s, "2026-01-10");
    expect(plan.pace).toBe("full");
    expect(plan.steps[0].kind).toBe("memorize");
  });

  it("تثبيتُ اليوم لا يُطلب ثانيةً في اليوم نفسه", () => {
    const s = hz({
      frontierId: p2.end,
      sessions: [sess(p2.start, p2.end, "2026-01-09", 1), sess(1, p1.end, "2026-01-08", 3)],
      reviews: [rev(p2.start, p2.end, "2026-01-10", 1)],
    });
    expect(buildTodayPlan(s, "2026-01-10").steps.some((x) => x.kind === "consolidate")).toBe(false);
  });

  it("متأخّراتٌ تفوق ضِعف سقف اليوم ⇒ نصفُ ورد", () => {
    const p40 = pageRange(40);
    // أربعون وجهاً لم يُراجَع أحدُها قطّ ⇒ كلّها مستحقّة
    const s = hz({ frontierId: p40.end, sessions: [sess(1, p40.end, "2026-01-01")] });
    const plan = buildTodayPlan(s, "2026-01-10");
    expect(plan.pace).toBe("half");
    const full = { fromId: p40.end + 1, toId: pageRange(41).end };
    expect(plan.newPortion).toEqual(halfPortion(full));
    expect(plan.newPortion!.toId).toBeLessThan(full.toId);
  });

  it("lastSabaq يضمّ جلسات آخر يومٍ قبل اليوم ولا يرى اليوم", () => {
    const s = hz({
      sessions: [sess(5, 6, "2026-01-10"), sess(3, 4, "2026-01-09"), sess(1, 2, "2026-01-09"), sess(1, 1, "2026-01-01")],
    });
    expect(lastSabaq(s, "2026-01-10")).toEqual({ fromId: 1, toId: 4 });
    expect(lastSabaq(hz(), "2026-01-10")).toBeNull();
  });

  it("halfPortion لا يُنتج مقطعاً فارغاً", () => {
    expect(halfPortion({ fromId: 10, toId: 10 })).toEqual({ fromId: 10, toId: 10 });
    expect(halfPortion({ fromId: 10, toId: 14 })).toEqual({ fromId: 10, toId: 12 });
  });
});
