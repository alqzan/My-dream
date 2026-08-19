/**
 * حارسُ قاعدة الأرقام. القرار: **الأرقام كلُّها هندية في مدار، والمبالغُ منها.**
 *
 * هذا الملفّ يمنع الرجوعَ الصامت: منسّقٌ واحدٌ يُترك على `nu-latn` يكفي ليظهر
 * رقمٌ لاتينيٌّ وحيدٌ وسط شاشةٍ هندية — وهو بالضبط الخلطُ الذي شكا منه المالك.
 */
import { describe, it, expect } from "vitest";
import {
  toIndicDigits, toLatinDigits, formatAmount, formatDate, formatDateShort,
  formatClock, hijriDate, entriesCount,
} from "./utils";

const hasLatinDigit = (s: string) => /[0-9]/.test(s);

describe("قاعدةُ الأرقام الهندية", () => {
  it("المُحوِّل يقلب الأرقام ولا يمسّ الحروف", () => {
    expect(toIndicDigits("2026-05-01")).toBe("٢٠٢٦-٠٥-٠١");
    expect(toIndicDigits("لا رقم هنا")).toBe("لا رقم هنا");
    expect(toIndicDigits("")).toBe("");
  });

  it("رحلةُ ذهابٍ وإياب: هنديٌّ ثمّ لاتينيٌّ يعود كما بدأ", () => {
    expect(toLatinDigits(toIndicDigits("1448"))).toBe("1448");
  });

  it("المبالغُ هندية — وهذا ما انقلب عن القاعدة القديمة", () => {
    expect(hasLatinDigit(formatAmount(1895))).toBe(false);
    expect(hasLatinDigit(formatAmount(0))).toBe(false);
    expect(hasLatinDigit(formatAmount(12.5))).toBe(false);
    expect(formatAmount(1895)).toMatch(/[٠-٩]/);
  });

  it("التواريخُ والمواقيتُ هندية", () => {
    expect(hasLatinDigit(formatDate("2026-05-01"))).toBe(false);
    expect(hasLatinDigit(formatDateShort("2026-05-01"))).toBe(false);
    expect(hasLatinDigit(hijriDate("2026-05-01"))).toBe(false);
    expect(hasLatinDigit(formatClock(new Date("2026-05-01T13:45:00")))).toBe(false);
  });

  it("العدُّ العربيُّ هنديّ", () => {
    expect(hasLatinDigit(entriesCount(148))).toBe(false);
  });

  it("مفاتيحُ التخزين تبقى لاتينية — التحويلُ للعرض لا للبيانات", () => {
    // حارسٌ للمبدأ: لا يجوز أن يمرّ مفتاحُ تاريخٍ على المحوّل قبل التخزين،
    // فمقارنةُ `"٢٠٢٦-٠٥-٠١" < "٢٠٢٦-٠٥-٠٢"` صحيحةٌ صدفةً والتحليلُ يفشل.
    expect(Number.isNaN(new Date(toIndicDigits("2026-05-01")).getTime())).toBe(true);
  });
});
