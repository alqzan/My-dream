import { describe, it, expect } from "vitest";
import { advanceBookPage } from "./readingProgress";
import type { Book } from "./types";

const book = (over: Partial<Book> = {}): Book => ({
  id: "b1",
  title: "كتاب",
  author: "مؤلف",
  totalPages: 300,
  currentPage: 0,
  status: "أقرأ",
  ...over,
});

describe("advanceBookPage", () => {
  it("يجمع الصفحات على التقدّم الحالي", () => {
    expect(advanceBookPage(book({ currentPage: 40 }), 30, "2026-09-11")).toEqual({ currentPage: 70 });
  });

  // الحارسُ الذي لم يكن: الكتابُ بلا عددِ صفحاتٍ كان يرجع للصفر مع كلّ تسجيل،
  // لأنّ `Math.min(pages, 0)` صفر. نموذجُ الكتاب لا يُلزم بالعدد، فالحالةُ واقعة.
  it("الكتابُ بلا عددِ صفحاتٍ يتقدّم ولا يرجع للصفر", () => {
    expect(advanceBookPage(book({ totalPages: 0, currentPage: 0 }), 30, "2026-09-11"))
      .toEqual({ currentPage: 30 });
    expect(advanceBookPage(book({ totalPages: 0, currentPage: 30 }), 25, "2026-09-11"))
      .toEqual({ currentPage: 55 });
  });

  it("ولا يُختَم كتابٌ لا يُعرف غلافه", () => {
    const out = advanceBookPage(book({ totalPages: 0, currentPage: 900 }), 100, "2026-09-11");
    expect(out.status).toBeUndefined();
    expect(out.finishDate).toBeUndefined();
  });

  it("لا يتجاوز الغلاف، وبلوغُه يختم الكتاب بتاريخ الجلسة", () => {
    expect(advanceBookPage(book({ currentPage: 290 }), 30, "2026-09-11")).toEqual({
      currentPage: 300,
      status: "أنهيت",
      finishDate: "2026-09-11",
    });
  });

  it("قبل الغلاف بصفحةٍ لا يُختَم", () => {
    expect(advanceBookPage(book({ currentPage: 250 }), 49, "2026-09-11")).toEqual({ currentPage: 299 });
  });

  it("صفحاتٌ غير صالحة لا تحرّك شيئاً", () => {
    for (const bad of [0, -5, NaN]) {
      expect(advanceBookPage(book({ currentPage: 40 }), bad, "2026-09-11")).toEqual({ currentPage: 40 });
    }
  });

  it("قيمٌ مشوّهة من نسخةٍ احتياطية لا تُنتج NaN", () => {
    const broken = book({ currentPage: NaN, totalPages: NaN });
    expect(advanceBookPage(broken, 10, "2026-09-11")).toEqual({ currentPage: 10 });
  });
});
