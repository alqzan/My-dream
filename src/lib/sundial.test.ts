import { describe, it, expect } from "vitest";
import {
  dayFraction, phaseOf, dialGeometry, dueArc, bigFitSize, fillY,
  DIAL_TICKS, DUE_ARC_LABEL,
} from "./sundial";

const at = (h: number, m = 0) => new Date(2026, 7, 19, h, m);

describe("نسبةُ النهار", () => {
  const fajr = at(4, 52);
  const isha = at(20, 24);

  it("صفرٌ عند الفجر وواحدٌ عند العشاء", () => {
    expect(dayFraction(fajr, fajr, isha)).toBe(0);
    expect(dayFraction(isha, fajr, isha)).toBe(1);
  });

  it("النصفُ في منتصف ما بينهما", () => {
    expect(dayFraction(at(12, 38), fajr, isha)).toBeCloseTo(0.5, 2);
  });

  it("ما قبل الفجر وما بعد العشاء يُقصّان لا يخرجان", () => {
    expect(dayFraction(at(2), fajr, isha)).toBe(0);
    expect(dayFraction(at(23), fajr, isha)).toBe(1);
  });

  it("مدًى معدومٌ أو مقلوبٌ لا يقسم على صفر", () => {
    expect(dayFraction(at(12), fajr, fajr)).toBe(0);
    expect(dayFraction(at(12), isha, fajr)).toBe(0);
  });
});

describe("الأطوار", () => {
  it("تمشي من الفجر إلى العشاء", () => {
    expect(phaseOf(0)).toBe("الفجر");
    expect(phaseOf(0.3)).toBe("الضحى");
    expect(phaseOf(0.6)).toBe("العصر");
    expect(phaseOf(0.8)).toBe("المغرب");
    expect(phaseOf(1)).toBe("العشاء");
  });
});

describe("هندسةُ المزولة", () => {
  it("الشمسُ تمشي من طرفٍ إلى طرف", () => {
    expect(dialGeometry(0).sunX).toBeGreaterThan(dialGeometry(1).sunX);
    expect(dialGeometry(0.5).sunY).toBeLessThan(dialGeometry(0).sunY); // أعلى ما تكون وسطَ النهار
  });

  it("الشمسُ تغيب أوّلَ النهار وآخرَه فلا ظلّ", () => {
    expect(dialGeometry(0.01).sunVisible).toBe(false);
    expect(dialGeometry(0.9).sunVisible).toBe(false);
    expect(dialGeometry(0.9).shadowOpacity).toBe(0);
    expect(dialGeometry(0.9).tickOn).toBe("");
    expect(dialGeometry(0.5).sunVisible).toBe(true);
  });

  it("الظلُّ يقصر وسطَ النهار ويطول عند الطرفين", () => {
    const mid = dialGeometry(0.5).shadow.split(" ")[2];
    const late = dialGeometry(0.8).shadow.split(" ")[2];
    expect(Math.abs(Number(mid.split(",")[0]) - 160)).toBeLessThan(
      Math.abs(Number(late.split(",")[0]) - 160)
    );
  });

  it("العلاماتُ الخافتة تُسقط التي عليها الظلُّ وحدَها", () => {
    const g = dialGeometry(0.5);
    expect(g.ticksDim.split("M").length - 1).toBe(DIAL_TICKS.length - 1);
    // وحين لا ظلّ تبقى العلاماتُ كلُّها
    expect(dialGeometry(0.95).ticksDim.split("M").length - 1).toBe(DIAL_TICKS.length);
  });

  it("النسبةُ خارج المدى تُقصّ", () => {
    expect(dialGeometry(-5).frac).toBe(0);
    expect(dialGeometry(9).frac).toBe(1);
  });
});

describe("القوسُ المستحقُّ الآن", () => {
  it("الصلاةُ أوّلاً ما لم تكتمل", () => {
    expect(dueArc(3, 4)).toBe("salah");
    expect(dueArc(0, 0)).toBe("salah");
  });

  it("ثمّ القرآنُ إن كان له موعدٌ اليوم", () => {
    expect(dueArc(5, 4)).toBe("quran");
  });

  it("ثمّ المال", () => {
    expect(dueArc(5, 0)).toBe("mal");
    expect(DUE_ARC_LABEL[dueArc(5, 0)]).toBe("المال");
  });
});

describe("مقاسُ الرقم الكبير", () => {
  it("يصغر كلّما طال النصّ", () => {
    expect(bigFitSize("٣")).toBe(29);
    expect(bigFitSize("تمَّ")).toBe(29); // الحركاتُ لا تُحتسب
    expect(bigFitSize("اكتب")).toBe(21);
    expect(bigFitSize("١٢٣٤٥٦")).toBe(16);
  });
});

describe("امتلاءُ القوس", () => {
  it("الفارغُ في الأسفل والممتلئُ في الأعلى", () => {
    expect(fillY(0)).toBe(132);
    expect(fillY(1)).toBe(0);
    expect(fillY(0.5)).toBe(66);
  });

  it("خارجُ المدى يُقصّ", () => {
    expect(fillY(-1)).toBe(132);
    expect(fillY(2)).toBe(0);
  });
});
