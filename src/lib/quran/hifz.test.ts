import { describe, it, expect } from "vitest";
import { weakSpots, latestRatingByPage, mistakeRecallSuccesses, portionEnd, hifzProgress, hifzPace } from "./hifz";
import { pageRange, idToPage } from "./meta";
import type { HifzState, HifzRating } from "../types";

function hz(o: Partial<HifzState> = {}): HifzState {
  return { plan: { startId: 1, unit: "page", amount: 1, createdAt: "2026-01-01" }, frontierId: 0, sessions: [], reviews: [], reviewCursorId: 0, mistakes: [], ...o };
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

  it("mistakeRecallSuccesses counts successful recalls after the last error only", () => {
    const p2 = pageRange(2);
    const s = hz({
      frontierId: p2.end,
      // آية الخطأ = 10 (ضمن الوجه المحفوظ).
      reviews: [
        ev(1, p2.end, "2026-01-02", 2), // قبل آخر خطأ → لا يُحتسب
        ev(1, p2.end, "2026-01-06", 3), // بعد آخر خطأ، ناجح → يُحتسب
        ev(1, p2.end, "2026-01-07", 2), // بعد آخر خطأ، ناجح → يُحتسب
        ev(1, p2.end, "2026-01-08", 1), // بعد آخر خطأ لكنّه فشل → لا يُحتسب
      ],
    });
    const mistake = { ayahId: 10, hits: ["2026-01-01", "2026-01-05"] };
    expect(mistakeRecallSuccesses(s, mistake)).toBe(2);
  });

  it("mistakeRecallSuccesses ignores events not overlapping the mistake's ayah", () => {
    const p2 = pageRange(2);
    const s = hz({ frontierId: p2.end, reviews: [ev(1, 5, "2026-01-06", 3)] });
    expect(mistakeRecallSuccesses(s, { ayahId: 500, hits: ["2026-01-01"] })).toBe(0);
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
