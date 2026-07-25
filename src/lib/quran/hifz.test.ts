import { describe, it, expect } from "vitest";
import {
  weakSpots, latestRatingByPage, portionEnd, hifzProgress, hifzPace,
  gradeFromMistakes, mistakeTolerance, recentReviewBand, drillsToday, smartTestPortion,
  openMistakesInRange, marksTodayInRange, markedToday,
} from "./hifz";
import { pageRange, idToPage } from "./meta";
import type { HifzState, HifzRating } from "../types";

function hz(o: Partial<HifzState> = {}): HifzState {
  return { plan: { startId: 1, unit: "page", amount: 1, createdAt: "2026-01-01" }, frontierId: 0, sessions: [], reviews: [], mistakes: [], ...o };
}
let n = 0;
const ev = (fromId: number, toId: number, date: string, rating?: HifzRating) => ({ id: `e${n++}`, fromId, toId, date, rating });

// مجموعة الأوجه المُغطّاة بمقاطع الضعف.
function weakPageSet(s: HifzState): Set<number> {
  const set = new Set<number>();
  for (const sp of weakSpots(s)) for (let p = idToPage(sp.fromId); p <= idToPage(sp.toId); p++) set.add(p);
  return set;
}

describe("weakSpots — page-overlap based (not exact range-string)", () => {
  it("a page whose latest rating is 1 shows as weak", () => {
    const p1 = pageRange(1);
    const s = hz({ frontierId: p1.end, sessions: [ev(1, p1.end, "2026-01-01", 1)] });
    const w = weakSpots(s);
    expect(w).toHaveLength(1);
    expect(idToPage(w[0].fromId)).toBe(1);
  });

  it("a weak page later mastered within a DIFFERENT range clears (the bug)", () => {
    const p3 = pageRange(3), p2 = pageRange(2);
    const s = hz({
      frontierId: p3.end,
      // حُفظت الأوجه 1..3 دفعةً بتقييم «يحتاج إتقان».
      sessions: [ev(1, p3.end, "2026-01-01", 1)],
      // ثمّ رُوجع الوجه 2 وحده لاحقاً وأُتقن — بمدى مختلف تماماً.
      reviews: [ev(p2.start, p2.end, "2026-01-05", 3)],
    });
    const weak = weakPageSet(s);
    expect(weak.has(2)).toBe(false); // أُتقن ضمن مدى مختلف → لم يعد ضعيفاً
    expect(weak.has(1)).toBe(true);
    expect(weak.has(3)).toBe(true);
  });

  it("contiguous weak pages merge into one span", () => {
    const p2 = pageRange(2);
    const s = hz({ frontierId: p2.end, sessions: [ev(1, p2.end, "2026-01-01", 1)] });
    const w = weakSpots(s);
    expect(w).toHaveLength(1);
    expect(idToPage(w[0].fromId)).toBe(1);
    expect(idToPage(w[0].toId)).toBe(2);
  });

  it("non-contiguous weak pages stay separate spans", () => {
    const p3 = pageRange(3), p2 = pageRange(2);
    const s = hz({
      frontierId: p3.end,
      sessions: [ev(1, p3.end, "2026-01-01", 1)],
      reviews: [ev(p2.start, p2.end, "2026-01-05", 3)], // الوجه 2 يفصل 1 عن 3
    });
    expect(weakSpots(s)).toHaveLength(2);
  });

  it("no weak spots once every page's latest rating is mastery", () => {
    const p2 = pageRange(2);
    const s = hz({
      frontierId: p2.end,
      sessions: [ev(1, p2.end, "2026-01-01", 1)],
      reviews: [ev(1, p2.end, "2026-01-06", 3)], // مراجعة لاحقة أتقنت كل شيء
    });
    expect(weakSpots(s)).toHaveLength(0);
  });

  it("latestRatingByPage keeps the newest event per page", () => {
    const p1 = pageRange(1);
    const s = hz({
      frontierId: p1.end,
      sessions: [ev(1, p1.end, "2026-01-01", 1)],
      reviews: [ev(1, p1.end, "2026-01-03", 2)],
    });
    expect(latestRatingByPage(s).get(1)).toEqual({ date: "2026-01-03", rating: 2 });
  });
});

describe("portionEnd — quarter/half accumulate across pages (P2)", () => {
  it("two halves (or four quarters) equal exactly one full page", () => {
    const p = pageRange(3);
    expect(portionEnd(p.start, "half", 2)).toBe(p.end);
    expect(portionEnd(p.start, "quarter", 4)).toBe(p.end);
  });
  it("one half from a page start ends before the page end (partial)", () => {
    const p = pageRange(3);
    expect(portionEnd(p.start, "half", 1)).toBeLessThan(p.end);
    expect(portionEnd(p.start, "half", 1)).toBeGreaterThanOrEqual(p.start);
  });
  it("crossing multiple pages weights each page by its own length", () => {
    const p = pageRange(3);
    // أربعة أنصاف = وجهان كاملان → نهاية الوجه التالي.
    expect(portionEnd(p.start, "half", 4)).toBe(pageRange(4).end);
  });
});

describe("hifzProgress.spanPages — exact page count (P2)", () => {
  it("counts real pages between plan start and frontier", () => {
    const p3 = pageRange(3);
    const s = hz({ plan: { startId: 1, unit: "page", amount: 1, createdAt: "2026-01-01" }, frontierId: p3.end });
    // من الوجه 1 إلى الوجه 3 = 3 أوجه.
    expect(hifzProgress(s).spanPages).toBe(3);
  });
});

describe("hifzPace — realistic pace incl. idle days (P2)", () => {
  it("no estimate when data is too little", () => {
    const s = hz({ frontierId: 30, sessions: [ev(1, 10, "2026-01-30", 3), ev(11, 20, "2026-01-31", 3)] });
    const pace = hifzPace(s, "2026-02-01");
    expect(pace.enough).toBe(false);
    expect(pace.finishInDays).toBeNull();
  });
  it("realistic pace is lower than active-day pace when there are idle days", () => {
    const dates = ["2026-01-03", "2026-01-08", "2026-01-13", "2026-01-18", "2026-01-23", "2026-01-28"];
    const sessions = dates.map((d, i) => ev(i * 10 + 1, i * 10 + 10, d, 3)); // 10 آيات لكل يوم نشاط
    const s = hz({ frontierId: 60, sessions });
    const pace = hifzPace(s, "2026-02-01");
    expect(pace.enough).toBe(true);
    expect(pace.perDay).toBeCloseTo(10, 5); // 60 آية / 6 أيام نشاط
    expect(pace.perDayReal).toBeLessThan(pace.perDay); // موزّعة على 30 يوماً
    expect(pace.finishInDays).not.toBeNull();
  });
});

describe("gradeFromMistakes — التقييم مشتقٌّ من الأخطاء لا من رأي المستخدم", () => {
  it("لا تعثّر ⇒ متقن", () => {
    expect(gradeFromMistakes(0, 12)).toBe(3);
    expect(gradeFromMistakes(0, 1)).toBe(3);
  });
  it("حتى حدّ التسامح ⇒ جيّد، وفوقه ⇒ يحتاج إتقاناً", () => {
    expect(mistakeTolerance(12)).toBe(2);
    expect(gradeFromMistakes(1, 12)).toBe(2);
    expect(gradeFromMistakes(2, 12)).toBe(2);
    expect(gradeFromMistakes(3, 12)).toBe(1);
  });
  it("المقطع الطويل يحتمل تعثّراً أكثر قبل أن يسقط للتقييم الأدنى", () => {
    expect(mistakeTolerance(25)).toBe(5);
    expect(gradeFromMistakes(4, 25)).toBe(2);
    expect(gradeFromMistakes(6, 25)).toBe(1);
  });
  it("الحدّ الأدنى للتسامح موضعان مهما قصر المقطع", () => {
    expect(mistakeTolerance(1)).toBe(2);
    expect(gradeFromMistakes(2, 1)).toBe(2);
    expect(gradeFromMistakes(3, 1)).toBe(1);
  });
});

describe("recentReviewBand — حجمها من شدّة التمرين لا من مقبضٍ يدوي", () => {
  it("«خفيف» نافذة أضيق من «مكثّف»", () => {
    const p10 = pageRange(10);
    const mk = (intensity: "light" | "balanced" | "intense") =>
      hz({ frontierId: p10.end, plan: { startId: 1, unit: "page", amount: 1, createdAt: "2026-01-01", intensity } });
    const span = (s: HifzState) => {
      const b = recentReviewBand(s)!;
      return idToPage(b.toId) - idToPage(b.fromId) + 1;
    };
    expect(span(mk("light"))).toBe(3);
    expect(span(mk("balanced"))).toBe(5);
    expect(span(mk("intense"))).toBe(8);
  });
});

describe("drillsToday — مواضع الخطأ المُختبَر عليها اليوم", () => {
  const mk = (id: string, ayahId: number, hits: string[], extra = {}) =>
    ({ id, ayahId, wordIndex: 0, hits, resolved: false, updatedAt: hits[hits.length - 1], ...extra });

  it("يستثني ما اختُبر اليوم ويُقدّم الأكثر تكراراً", () => {
    const s = hz({
      frontierId: pageRange(2).end,
      mistakes: [
        mk("a", 3, ["2026-01-01"]),
        mk("b", 4, ["2026-01-01", "2026-01-02", "2026-01-03"]),
        mk("c", 5, ["2026-01-01"], { lastDrill: "2026-01-10" }),
      ],
    });
    const out = drillsToday(s, "2026-01-10").map((m) => m.id);
    expect(out).toEqual(["b", "a"]); // c اختُبر اليوم فسقط
  });

  it("يحترم سقف شدّة التمرين", () => {
    const mistakes = Array.from({ length: 9 }, (_, i) => mk(`m${i}`, i + 2, ["2026-01-01"]));
    const light = hz({
      frontierId: pageRange(2).end, mistakes,
      plan: { startId: 1, unit: "page", amount: 1, createdAt: "2026-01-01", intensity: "light" },
    });
    expect(drillsToday(light, "2026-01-10")).toHaveLength(3);
    expect(drillsToday(hz({ frontierId: pageRange(2).end, mistakes }), "2026-01-10")).toHaveLength(5);
  });
});

describe("مواضع المقطع — تمييز تعثّر اليوم من وسمٍ سابق مفتوح", () => {
  const mk = (id: string, ayahId: number, hits: string[], extra = {}) =>
    ({ id, ayahId, wordIndex: 0, hits, resolved: false, updatedAt: hits[hits.length - 1], ...extra });

  it("يقصر على المقطع ويُسقط المُغلق والفارغ", () => {
    const s = hz({
      mistakes: [
        mk("in1", 10, ["2026-01-05"]),
        mk("in2", 14, ["2026-01-01", "2026-01-05"]),
        mk("out", 40, ["2026-01-05"]),
        mk("closed", 12, ["2026-01-05"], { resolved: true }),
        mk("empty", 13, []),
      ],
    });
    expect(openMistakesInRange(s, 10, 20).map((m) => m.id)).toEqual(["in1", "in2"]);
  });

  it("يرتّب بموضعه في المصحف (الآية ثمّ الكلمة) لا بتاريخ الوسم", () => {
    const s = hz({
      mistakes: [
        { ...mk("b", 12, ["2026-01-05"]), wordIndex: 3 },
        { ...mk("c", 12, ["2026-01-01"]), wordIndex: null },
        { ...mk("a", 11, ["2026-01-02"]), wordIndex: 1 },
      ],
    });
    expect(openMistakesInRange(s, 10, 20).map((m) => m.id)).toEqual(["a", "c", "b"]);
  });

  it("marksTodayInRange يعدّ تعثّر اليوم وحده — فالوسمُ السابق لا يهبط بالتقييم", () => {
    const s = hz({
      mistakes: [
        mk("old", 10, ["2026-01-01"]),
        mk("todayOnly", 11, ["2026-01-05"]),
        mk("again", 12, ["2026-01-01", "2026-01-05"]),
      ],
    });
    expect(marksTodayInRange(s, 10, 20, "2026-01-05")).toBe(2);
    expect(markedToday({ hits: ["2026-01-01"] }, "2026-01-05")).toBe(false);
    expect(markedToday({ hits: ["2026-01-01", "2026-01-05"] }, "2026-01-05")).toBe(true);
    // إغلاق موضعٍ (أتقنته) يُخرجه من العدّ فوراً، فيتحسّن التقييم المشتقّ.
    const closed = hz({ mistakes: [{ ...mk("todayOnly", 11, ["2026-01-05"]), resolved: true }] });
    expect(marksTodayInRange(closed, 10, 20, "2026-01-05")).toBe(0);
  });
});

describe("smartTestPortion — يرجّح الأطول عهداً لا العشوائي البحت", () => {
  it("لا يختار من داخل نافذة المراجعة القريبة ما دام في المحفوظ ما هو أبعد", () => {
    const p10 = pageRange(10);
    const s = hz({ frontierId: p10.end, sessions: [ev(1, p10.end, "2026-01-01", 3)] });
    for (let i = 0; i < 30; i++) {
      const t = smartTestPortion(s, "2026-02-01")!;
      expect(idToPage(t.fromId)).toBeLessThanOrEqual(5); // النافذة القريبة = 6..10
    }
  });

  it("لا شيء قبل أن يوجد محفوظ", () => {
    expect(smartTestPortion(hz({ frontierId: 0 }), "2026-02-01")).toBeNull();
  });
});
