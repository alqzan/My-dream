import { describe, it, expect } from "vitest";
import { pageSide, facingPage, zoneOf, placeOf, describePlace, clampPage } from "./page";
import { pageRange, idToPage, TOTAL_PAGES, surahAyahToId } from "./meta";

describe("pageSide", () => {
  it("الفردية يُمنى والزوجية يُسرى (الكتاب العربي يُفتح من اليمين)", () => {
    expect(pageSide(1)).toBe("يمنى"); // الفاتحة
    expect(pageSide(2)).toBe("يسرى"); // أوّل البقرة
    expect(pageSide(604)).toBe("يسرى");
  });
});

describe("facingPage", () => {
  it("يقرن صفحتَي الوجه المفتوح: الفاتحة مع أوّل البقرة (1↔2، 3↔4)", () => {
    expect(facingPage(1)).toBe(2);
    expect(facingPage(2)).toBe(1);
    expect(facingPage(3)).toBe(4);
    expect(facingPage(4)).toBe(3);
  });

  it("آخر صفحةٍ زوجية فلها مقابلها، ولا يخرج عن حدّ المصحف", () => {
    expect(facingPage(TOTAL_PAGES)).toBe(TOTAL_PAGES - 1);
    expect(facingPage(TOTAL_PAGES - 1)).toBe(TOTAL_PAGES);
  });
});

describe("zoneOf", () => {
  it("يوزّع الآيات على أثلاث الصفحة", () => {
    expect(zoneOf(1, 9)).toBe("أعلى الصفحة");
    expect(zoneOf(5, 9)).toBe("وسط الصفحة");
    expect(zoneOf(9, 9)).toBe("أسفل الصفحة");
  });

  it("صفحةٌ من آيتين: واحدةٌ أعلى وأخرى أسفل (لا تنزلقان للوسط)", () => {
    expect(zoneOf(1, 2)).toBe("أعلى الصفحة");
    expect(zoneOf(2, 2)).toBe("أسفل الصفحة");
  });

  it("آيةٌ واحدة تملأ صفحتها → لا ثلثَ يُدّعى", () => {
    expect(zoneOf(1, 1)).toBe("الصفحة كلّها");
  });
});

describe("placeOf", () => {
  it("أوّل آيةٍ في صفحةٍ تقع في أعلاها وآخرها في أسفلها", () => {
    const { start, end } = pageRange(50);
    expect(placeOf(start).zone).toBe("أعلى الصفحة");
    expect(placeOf(end).zone).toBe("أسفل الصفحة");
    expect(placeOf(start).index).toBe(1);
    expect(placeOf(end).index).toBe(end - start + 1);
  });

  it("يتّفق مع idToPage على امتداد المصحف", () => {
    for (const id of [1, 8, 300, 2141, 4000, 6236]) {
      expect(placeOf(id).page).toBe(idToPage(id));
    }
  });

  it("الفاتحة كلّها في الصفحة الأولى (يُمنى)", () => {
    const p = placeOf(surahAyahToId(1, 1));
    expect(p.page).toBe(1);
    expect(p.side).toBe("يمنى");
  });

  it("الترتيب داخل الصفحة لا يتجاوز عدد آياتها أبداً", () => {
    for (let page = 1; page <= TOTAL_PAGES; page += 37) {
      const { start, end } = pageRange(page);
      for (const id of [start, Math.floor((start + end) / 2), end]) {
        const p = placeOf(id);
        expect(p.index).toBeGreaterThanOrEqual(1);
        expect(p.index).toBeLessThanOrEqual(p.count);
      }
    }
  });
});

describe("describePlace", () => {
  it("سطرٌ عربيّ جاهز للعرض", () => {
    expect(describePlace({ page: 262, side: "يمنى", zone: "أعلى الصفحة", index: 1, count: 8 }))
      .toBe("ص 262 · يمنى · أعلى الصفحة");
  });
});

describe("clampPage", () => {
  it("يمنع الخروج عن حدود المصحف", () => {
    expect(clampPage(0)).toBe(1);
    expect(clampPage(605)).toBe(TOTAL_PAGES);
    expect(clampPage(300)).toBe(300);
  });
});
