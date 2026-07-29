import { describe, it, expect } from "vitest";
import { portionPages, pageSpan, leadOnPage } from "./portionPage";
import { pageRange, idToPage, surahAyahToId, TOTAL_AYAT } from "./meta";

describe("portionPages", () => {
  it("مقطعٌ داخل وجهٍ واحد → وجهٌ واحد بمداه الكامل وحصّته منه", () => {
    // الفاتحة 2–4 داخل الوجه الأوّل (آيات 1..7).
    const [pg, ...rest] = portionPages(2, 4);
    expect(rest).toHaveLength(0);
    expect(pg.page).toBe(1);
    expect(pg.side).toBe("يمنى");
    expect(pg.start).toBe(1);
    expect(pg.end).toBe(7);
    expect(pg.fromId).toBe(2);
    expect(pg.toId).toBe(4);
    expect(pg.whole).toBe(false);
  });

  it("المقطع الذي يستغرق الوجه كلّه يُوسم whole (فلا سياق حوله)", () => {
    const { start, end } = pageRange(50);
    const [pg] = portionPages(start, end);
    expect(pg.whole).toBe(true);
    expect(pg.fromId).toBe(start);
    expect(pg.toId).toBe(end);
  });

  it("المقطع العابر لوجهين يُقسم عليهما، ولكلٍّ مداه وحصّته", () => {
    const p1 = pageRange(5);
    const p2 = pageRange(6);
    const pages = portionPages(p1.end - 1, p2.start + 1);
    expect(pages.map((p) => p.page)).toEqual([5, 6]);
    expect(pages[0]).toMatchObject({ start: p1.start, end: p1.end, fromId: p1.end - 1, toId: p1.end, whole: false });
    expect(pages[1]).toMatchObject({ start: p2.start, end: p2.end, fromId: p2.start, toId: p2.start + 1, whole: false });
  });

  it("الأوجه متتابعة بلا فجوة، وتغطّي المقطع كلّه", () => {
    const from = surahAyahToId(2, 1);
    const to = surahAyahToId(2, 60);
    const pages = portionPages(from, to);
    expect(pages[0].fromId).toBe(from);
    expect(pages[pages.length - 1].toId).toBe(to);
    pages.forEach((p, i) => {
      expect(p.page).toBe(pages[0].page + i);
      if (i > 0) expect(p.fromId).toBe(pages[i - 1].toId + 1);
      expect(p.fromId).toBeGreaterThanOrEqual(p.start);
      expect(p.toId).toBeLessThanOrEqual(p.end);
    });
  });

  it("الجهة تُشتقّ من رقم الوجه: الفردية يمنى والزوجية يسرى", () => {
    expect(portionPages(pageRange(3).start, pageRange(3).start)[0].side).toBe("يمنى");
    expect(portionPages(pageRange(4).start, pageRange(4).start)[0].side).toBe("يسرى");
  });

  it("مدىً مقلوب (to قبل from) يُطبَّع فلا يعود فارغاً", () => {
    expect(portionPages(10, 5)).toEqual(portionPages(5, 10));
  });

  it("آخر آيةٍ في المصحف تقع في وجهٍ واحدٍ سليم", () => {
    const [pg] = portionPages(TOTAL_AYAT, TOTAL_AYAT);
    expect(pg.page).toBe(idToPage(TOTAL_AYAT));
    expect(pg.end).toBe(TOTAL_AYAT);
  });
});

describe("pageSpan", () => {
  it("يعدّ الأوجه التي يمتدّ عليها المقطع", () => {
    expect(pageSpan(1, 5)).toBe(1);
    const p = pageRange(100);
    expect(pageSpan(p.start - 1, p.end + 1)).toBe(3);
    expect(pageSpan(p.end + 1, p.start - 1)).toBe(3); // مقلوباً كذلك
  });
});

describe("leadOnPage", () => {
  it("الآية السابقة تلقينٌ مرسوم حين تكون في الوجه نفسه", () => {
    expect(leadOnPage(4)).toBe(3); // داخل الوجه الأوّل
  });

  it("بدايةُ وجهٍ لا سابقةَ لها على الورقة → لا تلقين مرسوم", () => {
    const { start } = pageRange(7);
    expect(leadOnPage(start)).toBeNull();
  });

  it("أوّل المصحف لا سابقةَ له", () => {
    expect(leadOnPage(1)).toBeNull();
  });
});
