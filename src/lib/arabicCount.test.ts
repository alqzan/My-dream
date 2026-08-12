import { describe, it, expect } from "vitest";
import { arabicCount, entriesCount, daysCount } from "./utils";

describe("arabicCount — القواعد الأربع", () => {
  it("مفردٌ ومثنّى بلا رقمٍ أمامهما", () => {
    expect(entriesCount(1)).toBe("مذكرة واحدة");
    expect(entriesCount(2)).toBe("مذكرتان");
    expect(daysCount(1)).toBe("يوم واحد");
    expect(daysCount(2)).toBe("يومان");
  });

  it("جمعُ القلّة من ٣ إلى ١٠", () => {
    expect(entriesCount(3)).toBe("3 مذكرات");
    expect(entriesCount(10)).toBe("10 مذكرات");
    expect(daysCount(7)).toBe("7 أيام");
  });

  it("تمييزٌ مفردٌ من ١١ فأكثر — لا «11 مذكرات»", () => {
    expect(entriesCount(11)).toBe("11 مذكرة");
    expect(entriesCount(148)).toBe("148 مذكرة");
    expect(daysCount(30)).toBe("30 يوماً");
  });

  it("الصفر يأخذ الجمع، أو صيغةً خاصّةً إن أُعطيت", () => {
    expect(entriesCount(0)).toBe("0 مذكرات");
    expect(arabicCount(0, { zero: "لا شيء", one: "١", two: "٢", few: "ق", many: "م" })).toBe("لا شيء");
  });

  it("الأرقام لاتينية دائماً (لا هندية)", () => {
    expect(entriesCount(148)).toMatch(/^\d+ /);
  });
});
