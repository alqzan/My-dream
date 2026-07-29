// ===================== حارسا حقل التاريخ =====================
// `isValidDateKey` انتقل إلى `utils.ts` من `installments.ts`: صار يحرس الأقساط
// والأصول **والأحداث** معاً. و`keepValidDate` تحرس ما قبله: قيمةٌ فارغة عابرة
// من منتقي Safari (بتقويمٍ هجريّ على الجهاز) كانت تمحو آخر تاريخٍ صالح، فيبدو
// زرُّ الحفظ معطّلاً بلا سبب.
import { describe, it, expect } from "vitest";
import { isValidDateKey, keepValidDate, parseDate, toDateStr } from "./utils";
import { isValidDateKey as fromInstallments } from "./installments";

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

  it("هو نفسه المُصدَّر من وحدة الأقساط (لا نسختان تفترقان)", () => {
    expect(fromInstallments).toBe(isValidDateKey);
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
