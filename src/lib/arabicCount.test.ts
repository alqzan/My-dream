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
    expect(entriesCount(3)).toBe("٣ مذكرات");
    expect(entriesCount(10)).toBe("١٠ مذكرات");
    expect(daysCount(7)).toBe("٧ أيام");
  });

  it("تمييزٌ مفردٌ من ١١ فأكثر — لا «١١ مذكرات»", () => {
    expect(entriesCount(11)).toBe("١١ مذكرة");
    expect(entriesCount(148)).toBe("١٤٨ مذكرة");
    expect(daysCount(30)).toBe("٣٠ يوماً");
  });

  it("الصفر يأخذ الجمع، أو صيغةً خاصّةً إن أُعطيت", () => {
    expect(entriesCount(0)).toBe("٠ مذكرات");
    expect(arabicCount(0, { zero: "لا شيء", one: "١", two: "٢", few: "ق", many: "م" })).toBe("لا شيء");
  });

  // انقلبت القاعدة بقرار المالك: الأرقام **هندية** في كلّ التطبيق، والمبالغُ
  // منها. هذا الاختبار هو حارسُ القرار الجديد في موضع حارسِ القديم.
  it("الأرقام هندية دائماً (لا لاتينية)", () => {
    expect(entriesCount(148)).toMatch(/^[٠-٩]+ /);
    expect(entriesCount(148)).not.toMatch(/[0-9]/);
    expect(daysCount(30)).not.toMatch(/[0-9]/);
  });
});
