import { describe, it, expect } from "vitest";
import {
  daysUntil, isVisible, sortEvents, visibleEvents, describeDays, coarseDistance, progressTo,
} from "./countdown";
import type { CountdownEvent } from "./types";

const ev = (id: string, date: string, title = id, extra: Partial<CountdownEvent> = {}): CountdownEvent =>
  ({ id, date, title, ...extra });

describe("daysUntil", () => {
  it("يعدّ الأيام قبل الحدث ويومَه وبعده", () => {
    expect(daysUntil("2026-08-10", "2026-08-01")).toBe(9);
    expect(daysUntil("2026-08-01", "2026-08-01")).toBe(0);
    expect(daysUntil("2026-07-30", "2026-08-01")).toBe(-2);
  });

  // الفخّ الذي تحرسه هذه الحالة: حسابٌ بـtoISOString/UTC يزيح اليوم في الخليج
  // (+03) فيقول «باقي يومان» ليلةَ الحدث. parseDate تثبّت منتصف اليوم المحلّي.
  it("لا ينزلق يوماً عبر الشهور والسنوات", () => {
    expect(daysUntil("2026-01-01", "2025-12-31")).toBe(1);
    expect(daysUntil("2027-03-01", "2027-02-28")).toBe(1);
    expect(daysUntil("2028-03-01", "2028-02-28")).toBe(2); // سنة كبيسة
  });
});

describe("isVisible", () => {
  it("يُبقي القادم ويومَ الحدث ويومَه التالي", () => {
    expect(isVisible(ev("a", "2026-09-01"), "2026-08-01")).toBe(true);
    expect(isVisible(ev("a", "2026-08-01"), "2026-08-01")).toBe(true);
    expect(isVisible(ev("a", "2026-07-31"), "2026-08-01")).toBe(true);
  });

  it("يُخفي ما مضى إلّا الموسوم بالعدّ التصاعدي", () => {
    expect(isVisible(ev("a", "2026-07-01"), "2026-08-01")).toBe(false);
    expect(isVisible(ev("a", "2026-07-01", "بيبي", { countUpAfter: true }), "2026-08-01")).toBe(true);
  });
});

describe("sortEvents", () => {
  it("القادم قبل الماضي، والأقرب أولاً", () => {
    const list = [
      ev("far", "2026-12-01"),
      ev("past", "2026-07-01", "مضى", { countUpAfter: true }),
      ev("near", "2026-08-05"),
    ];
    expect(sortEvents(list, "2026-08-01").map((e) => e.id)).toEqual(["near", "far", "past"]);
  });

  it("ترتيبٌ ثابت عبر الأجهزة عند تساوي التاريخ (لا يعتمد على ترتيب الدمج)", () => {
    const a = [ev("1", "2026-08-10", "باء"), ev("2", "2026-08-10", "ألف")];
    const b = [ev("2", "2026-08-10", "ألف"), ev("1", "2026-08-10", "باء")];
    expect(sortEvents(a, "2026-08-01").map((e) => e.id))
      .toEqual(sortEvents(b, "2026-08-01").map((e) => e.id));
  });

  it("لا يعدّل المصفوفة الأصلية", () => {
    const list = [ev("b", "2026-12-01"), ev("a", "2026-08-05")];
    sortEvents(list, "2026-08-01");
    expect(list.map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("visibleEvents", () => {
  it("يرشّح ويرتّب معاً، ويحتمل غياب الحقل كلّه", () => {
    expect(visibleEvents(undefined, "2026-08-01")).toEqual([]);
    const out = visibleEvents(
      [ev("gone", "2026-01-01"), ev("soon", "2026-08-03"), ev("later", "2026-10-01")],
      "2026-08-01"
    );
    expect(out.map((e) => e.id)).toEqual(["soon", "later"]);
  });
});

describe("describeDays", () => {
  it("صياغة عربية سليمة للمثنّى والجمع", () => {
    expect(describeDays(0)).toBe("اليوم");
    expect(describeDays(1)).toBe("غداً");
    expect(describeDays(2)).toBe("بعد يومين");
    expect(describeDays(5)).toBe("بعد 5 أيام");
    expect(describeDays(40)).toBe("بعد 40 يوماً");
    expect(describeDays(-1)).toBe("أمس");
    expect(describeDays(-9)).toBe("قبل 9 أيام");
  });
});

describe("coarseDistance", () => {
  it("يصمت تحت الشهر ويُقرّب فوقه", () => {
    expect(coarseDistance(12)).toBeNull();
    expect(coarseDistance(30)).toBe("شهر تقريباً");
    expect(coarseDistance(243)).toBe("8 أشهر تقريباً");
    expect(coarseDistance(365)).toBe("سنة تقريباً");
    expect(coarseDistance(400)).toBe("سنة وشهر تقريباً");
    expect(coarseDistance(430)).toBe("سنة وشهران تقريباً");
  });
});

describe("progressTo", () => {
  it("يمتلئ عند الحدث ويبدأ من الصفر خارج النافذة", () => {
    expect(progressTo(0)).toBe(1);
    expect(progressTo(-3)).toBe(1);
    expect(progressTo(90)).toBe(0);
    expect(progressTo(200)).toBe(0);
    expect(progressTo(45)).toBeCloseTo(0.5, 5);
  });
});

// ===================== تاريخٌ فاسد لا يُسقط الشاشة ولا يكذب =====================
// المصادر الثلاثة لتاريخٍ فاسد: منتقي Safari يعيد قيمةً فارغة حين يكون تقويم
// الجهاز هجرياً، ونسخةٌ احتياطية قديمة، وجهازٌ حفظ قبل حارس الإدخال. كان
// `parseDate("")` يعطي سنة 1900، و«2026-02-30» تُدوَّر إلى 2 مارس — فيظهر عدٌّ
// تنازليّ لموعدٍ لا وجود له، وقد تنزلق `sort` بمقارنات NaN فيختلف الترتيب.
describe("تاريخُ الحدث الفاسد", () => {
  it("تاريخٌ صحيح يُعدّ كما هو", () => {
    expect(daysUntil("2026-02-15", "2026-02-01")).toBe(14);
    expect(isVisible(ev("a", "2026-02-15"), "2026-02-01")).toBe(true);
    expect(describeDays(daysUntil("2026-02-15", "2026-02-01"))).toBe("بعد 14 يوماً");
  });

  it("تاريخٌ مستحيل (2026-02-30) لا يُدوَّر إلى يومٍ آخر", () => {
    expect(daysUntil("2026-02-30", "2026-02-01")).toBeNaN();
    expect(describeDays(daysUntil("2026-02-30", "2026-02-01"))).toBe("تاريخ غير صالح");
    expect(isVisible(ev("bad", "2026-02-30"), "2026-02-01")).toBe(false);
    // ولا يعود بـ`countUpAfter` من الباب الخلفيّ
    expect(isVisible(ev("bad", "2026-02-30", "bad", { countUpAfter: true }), "2026-02-01")).toBe(false);
  });

  it("قيمةٌ فارغة عابرة من منتقي Safari لا تُنتج عدّاً ولا تظهر في الرئيسية", () => {
    expect(daysUntil("", "2026-02-01")).toBeNaN();
    expect(isVisible(ev("empty", ""), "2026-02-01")).toBe(false);
    expect(visibleEvents([ev("empty", ""), ev("ok", "2026-02-15")], "2026-02-01").map((e) => e.id))
      .toEqual(["ok"]);
  });

  it("وكذلك شهرٌ 13 ونصٌّ ليس تاريخاً", () => {
    for (const bad of ["2026-13-01", "2026-00-10", "2026-2-5", "غداً", "2026/02/15"]) {
      expect(daysUntil(bad, "2026-02-01"), bad).toBeNaN();
      expect(isVisible(ev("x", bad), "2026-02-01"), bad).toBe(false);
    }
  });

  it("الترتيب حتميّ: الفاسدة في الذيل بعد القادمة والماضية، مرتّبةً بعنوانها", () => {
    const list = [
      ev("bad-b", "2026-02-30", "ب"),
      ev("past", "2026-01-20", "ماضٍ"),
      ev("bad-a", "", "أ"),
      ev("soon", "2026-02-05", "قريب"),
      ev("later", "2026-03-05", "بعيد"),
    ];
    const order = sortEvents(list, "2026-02-01").map((e) => e.id);
    expect(order).toEqual(["soon", "later", "past", "bad-a", "bad-b"]);
    // والترتيب نفسه أيّاً كان ترتيب المصفوفة الواردة من الدمج
    expect(sortEvents([...list].reverse(), "2026-02-01").map((e) => e.id)).toEqual(order);
  });
});
