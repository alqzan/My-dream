// ===================== حارسا حقل التاريخ =====================
// `isValidDateKey` يعيش في `utils.ts` مع بقيّة قواعد التاريخ.
// والأصول **والأحداث** معاً. و`keepValidDate` تحرس ما قبله: قيمةٌ فارغة عابرة
// من منتقي Safari (بتقويمٍ هجريّ على الجهاز) كانت تمحو آخر تاريخٍ صالح، فيبدو
// زرُّ الحفظ معطّلاً بلا سبب.
import { describe, it, expect } from "vitest";
import { isValidDateKey, keepValidDate, parseDate, toDateStr, displayTime } from "./utils";

describe("isValidDateKey", () => {
  it("يقبل تاريخاً صحيحاً", () => {
    expect(isValidDateKey("2026-02-15")).toBe(true);
    expect(isValidDateKey("2028-02-29")).toBe(true); // سنةٌ كبيسة
    expect(isValidDateKey("2026-12-31")).toBe(true);
    expect(isValidDateKey("2026-01-01")).toBe(true);
  });

  it("يرفض تاريخاً مستحيلاً يطابق الشكل", () => {
    expect(isValidDateKey("2026-02-30")).toBe(false);
    expect(isValidDateKey("2026-02-29")).toBe(false); // 2026 ليست كبيسة
    expect(isValidDateKey("2026-13-01")).toBe(false);
    expect(isValidDateKey("2026-00-10")).toBe(false);
    expect(isValidDateKey("2026-04-31")).toBe(false);
  });

  it("يرفض ما ليس بالصيغة أصلاً", () => {
    expect(isValidDateKey("")).toBe(false);
    expect(isValidDateKey("2026-2-5")).toBe(false);
    expect(isValidDateKey("2026/02/15")).toBe(false);
    expect(isValidDateKey("غداً")).toBe(false);
  });

  // السببُ الأصليّ لوجود هذا الحارس: `parseDate` تُدوّر المستحيل بلا إشعار.
  it("يلتقط ما كانت parseDate تُدوّره صامتةً", () => {
    expect(toDateStr(parseDate("2026-02-30"))).toBe("2026-03-02"); // تدويرٌ صامت
    expect(isValidDateKey("2026-02-30")).toBe(false); // والحارس يمنعه
  });
});

describe("keepValidDate — القيمة الفارغة العابرة من منتقي Safari", () => {
  it("لا تمحو آخر تاريخٍ صالح", () => {
    expect(keepValidDate("", "2026-02-15")).toBe("2026-02-15");
  });

  it("ولا تُنشئ شيئاً حين لا يكون ثمّ تاريخٌ بعد", () => {
    expect(keepValidDate("", "")).toBe("");
  });

  it("وتمرّ أيّ قيمةٍ حقيقية كما هي (فيبقى التصحيح ممكناً)", () => {
    expect(keepValidDate("2026-03-01", "2026-02-15")).toBe("2026-03-01");
    // حتى غير الصالحة تمرّ — الحكم عليها عند الحفظ لا أثناء الكتابة
    expect(keepValidDate("2026-02-30", "2026-02-15")).toBe("2026-02-30");
  });

  it("رحلةٌ كاملة: تاريخٌ مختار ← فتحُ التقويم يُفرغه ← يبقى المختار", () => {
    let date = "";
    date = keepValidDate("2026-02-15", date); // اختار المالك يوماً
    expect(isValidDateKey(date)).toBe(true);
    date = keepValidDate("", date);           // Safari يُطلق change فارغة
    expect(date).toBe("2026-02-15");
    expect(isValidDateKey(date)).toBe(true);  // فيبقى الزرّ صالحاً للحفظ
  });
});

// ===================== وقتُ المذكرة كما يُعرض =====================
// أرشيف Day One يعطي منتصف الليل لتدوينة يومٍ بلا وقت، فكان «00:00» يظهر
// وقتَ كتابةٍ محدّداً وليس كذلك.
describe("displayTime", () => {
  it("منتصفُ الليل ليس وقتاً", () => {
    expect(displayTime("00:00")).toBeNull();
    expect(displayTime("0:00")).toBeNull();
    expect(displayTime("24:00")).toBeNull();
  });

  it("الأوقات الحقيقية تمرّ كما هي", () => {
    expect(displayTime("07:10")).toBe("07:10");
    expect(displayTime("00:01")).toBe("00:01");
    expect(displayTime("23:49")).toBe("23:49");
  });

  it("الفراغ والغياب ⇒ لا شيء", () => {
    expect(displayTime(undefined)).toBeNull();
    expect(displayTime("  ")).toBeNull();
  });
});
