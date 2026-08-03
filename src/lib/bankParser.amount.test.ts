// حارس المبلغ والتاجر في الرسائل البنكية.
//
// لماذا ملفٌّ ثانٍ إلى جانب `bankParser.test.ts`؟ لأنّ ذاك يحرس **التواريخ ذات
// السنة برقمين** وحدها — كُتب ارتجاعياً بعد عطلٍ بعينه. وظلّ **استخراج المبلغ**
// بلا اختبارٍ مباشرٍ واحد، وهو أعلى الحقول مخاطرةً: رقمٌ يُقرأ خطأً هنا يصير
// مصروفاً حقيقياً في ميزانية المالك، والأخطر أن يُقرأ **الرصيد** مبلغاً — فرسالةُ
// بطاقةٍ ائتمانية تذكر ثلاثة أرقامٍ في نصٍّ واحد: مبلغ الشراء، والرصيد المتوفر،
// والمبلغ الإجمالي المستحق.
//
// الرسائل هنا محاكاةٌ لأشكال البنوك السعودية (الراجحي · الأهلي · مدى · سداد ·
// Apple Pay). لا أرقام حساباتٍ حقيقية فيها.
import { describe, it, expect } from "vitest";
import {
  parseBankSms,
  parseBankSmsBulk,
  isNoiseMessage,
  isLikelyDuplicate,
  normalizeMerchant,
  learnedCategory,
  suggestCategory,
} from "./bankParser";
import type { FinanceCategoryDef } from "./types";

const D = "2026-08-01";

const cats: FinanceCategoryDef[] = [
  { id: "cat-essentials", label: "أساسيات", icon: "🧺", color: "#c1663f" },
  { id: "cat-luxuries", label: "كماليات", icon: "✨", color: "#c9852a" },
  { id: "cat-charity", label: "صدقة", icon: "🤲", color: "#1f7a6c" },
  { id: "cat-investment", label: "استثمار", icon: "📊", color: "#3d9640" },
];

describe("parseBankSms — المبلغ لا الرصيد", () => {
  it("**الحالة الحرجة**: رسالة بطاقةٍ ائتمانية تذكر ثلاثة أرقام — يُلتقط الشراء وحده", () => {
    const sms = [
      "عملية شراء",
      "المبلغ: SAR 320.75",
      "لدى: الدانوب",
      "الرصيد المتوفر: SAR 2673.04",
      "المبلغ الإجمالي المستحق SAR 2326.96",
    ].join("\n");
    const r = parseBankSms(sms, D);
    expect(r).not.toBeNull();
    // ليس 2673.04 (الرصيد) ولا 2326.96 (المستحق).
    expect(r!.amount).toBe(320.75);
    expect(r!.note).toBe("الدانوب");
  });

  it("يتخطّى «الرصيد» بوصفٍ بينه وبين الرقم", () => {
    for (const balanceLine of [
      "الرصيد المتوفر: 2673.04 ريال",
      "الرصيد المتاح 2673.04 ريال",
      "الرصيد الحالي: SAR 2673.04",
      "رصيد: 2673.04",
    ]) {
      const r = parseBankSms(`شراء\nالمبلغ: 45.00 ريال\nلدى: بنده\n${balanceLine}`, D);
      expect(r?.amount, balanceLine).toBe(45);
    }
  });

  it("لا يخلط رصيداً أكبر بمبلغٍ أصغر حتى لو سبقه في النص", () => {
    const r = parseBankSms("الرصيد المتاح: 9999.00 ريال\nشراء\nالمبلغ: 12.50 ريال\nلدى: بارنز", D);
    expect(r?.amount).toBe(12.5);
  });
});

describe("parseBankSms — صيغ المبالغ", () => {
  const cases: [string, string, number][] = [
    ["العملة بعد الرقم", "شراء\nالمبلغ: 150.00 ريال\nلدى: بنده", 150],
    ["العملة قبل الرقم", "شراء بـSR 22.50\nلـSTARBUCKS", 22.5],
    ["SAR قبل الرقم", "عملية شراء\nالمبلغ: SAR 320.75\nلدى: نستو", 320.75],
    ["فاصلة آلاف", "شراء\nالمبلغ: 1,250.50 ريال\nلدى: ايكيا", 1250.5],
    ["رقم صحيح بلا كسور", "سحب نقدي\nالمبلغ: 500 ريال\nمن: جهاز صراف", 500],
    ["أرقام هندية وفاصلة عشرية عربية", "شراء بمبلغ ٧٢٠٫٣٦ ريال لدى نستو", 720.36],
    ["فاصلة آلاف عربية", "شراء\nالمبلغ: ١٬٢٥٠٫٥٠ ريال\nلدى: التميمي", 1250.5],
    ["بلا عملة — رقمٌ بعد كلمة العملية", "عملية شراء بمبلغ 75 من مطعم البيك", 75],
    ["ر.س بنقطة", "شراء\nالمبلغ: 88.25 ر.س\nلدى: هرفي", 88.25],
  ];

  for (const [name, sms, expected] of cases) {
    it(name, () => {
      const r = parseBankSms(sms, D);
      expect(r, name).not.toBeNull();
      expect(r!.amount, name).toBe(expected);
    });
  }
});

describe("parseBankSms — إيداعٌ مقابل خصم", () => {
  it("يتجاهل الراتب والإيداع (المتتبّع للمصاريف فقط)", () => {
    for (const sms of [
      "إيداع راتب\nالمبلغ: 12,000.00 ريال\nالرصيد: 15,300.00 ريال",
      "تم استلام حوالة\nالمبلغ: 500 ريال",
      "أضيف إلى حسابك مبلغ 250 ريال",
    ]) {
      expect(parseBankSms(sms, D), sms).toBeNull();
      expect(isNoiseMessage(sms), sms).toBe(true);
    }
  });

  it("يسجّل الخصم والسحب والسداد", () => {
    for (const sms of [
      "خصم\nالمبلغ: 60 ريال\nلدى: ساسكو",
      "سحب نقدي\nالمبلغ: 200 ريال\nمن: صراف",
      "تم سداد فاتورة\nمفوتر: السعودية للطاقة\nالمبلغ: 450.00 ريال",
    ]) {
      expect(parseBankSms(sms, D), sms).not.toBeNull();
    }
  });
});

describe("parseBankSms — التاجر", () => {
  it("يفضّل المستفيد على الحساب المموّل (Apple Pay: «من9004» ثمّ «لـ»)", () => {
    const r = parseBankSms("شراء بـSR 22.50\nمن9004\nلـSTARBUCKS\nرصيد:2673.04 ريال", D);
    expect(r?.note).toBe("STARBUCKS");
  });

  it("سداد: يأخذ المفوتر لا البطاقة المموّلة", () => {
    const r = parseBankSms(
      "تم سداد فاتورة\nمفوتر: السعودية للطاقة\nالمبلغ: 450.00 ريال\nمن البطاقة الائتمانية: 9407",
      D
    );
    expect(r?.note).toBe("السعودية للطاقة");
  });

  it("يقبل «من» حين تسمّي تاجراً حقيقياً لا رقم حساب", () => {
    const r = parseBankSms("شراء\nالمبلغ: 30 ريال\nمن ستاربكس", D);
    expect(r?.note).toBe("ستاربكس");
  });

  it("يتجاهل قيمةً رقميةً بحتة كاسم تاجر", () => {
    const r = parseBankSms("شراء\nالمبلغ: 30 ريال\nمن 9004", D);
    // لا يصير «9004» اسمَ تاجر — يسقط إلى وصفٍ من نصّ الرسالة.
    expect(r?.note).not.toBe("9004");
  });
});

describe("parseBankSms — التصنيف المقترح", () => {
  const cases: [string, string][] = [
    ["شراء\nالمبلغ: 150 ريال\nلدى: بنده", "cat-essentials"],
    ["شراء\nالمبلغ: 22 ريال\nلدى: ستاربكس", "cat-luxuries"],
    ["شراء\nالمبلغ: 90 ريال\nلدى: محطة ساسكو", "cat-essentials"],
    ["شراء\nالمبلغ: 60 ريال\nلدى: مطعم البيك", "cat-luxuries"],
    ["تبرع\nالمبلغ: 100 ريال\nلدى: جمعية خيرية", "cat-charity"],
    ["شراء\nالمبلغ: 45 ريال\nلدى: صيدلية النهدي", "cat-essentials"],
  ];
  for (const [sms, expected] of cases) {
    it(`${expected} ← ${sms.split("\n").pop()}`, () => {
      expect(parseBankSms(sms, D)?.category).toBe(expected);
    });
  }
});

describe("isNoiseMessage — ما يُسقط بصمت", () => {
  it("رمز التحقق والعمليات المرفوضة والرصيد المجرّد وكشف الحساب", () => {
    for (const sms of [
      "رمز التحقق 458123 لا تشاركه مع أحد",
      "عملية مرفوضة - رصيد غير كاف",
      "تم رفض العملية",
      "الرصيد المتاح: 4279 ريال",
      "كشف حساب بطاقتك\nالمبلغ الإجمالي المستحق: 2326.96 ريال\nتاريخ الاستحقاق 2026-08-25",
    ]) {
      expect(isNoiseMessage(sms), sms).toBe(true);
      expect(parseBankSms(sms, D), sms).toBeNull();
    }
  });

  it("**لا** يعدّ شراءً حقيقياً ضجيجاً لمجرّد أنّه يذكر المستحق والرصيد", () => {
    const sms = [
      "عملية شراء",
      "المبلغ: SAR 320.75",
      "لدى: الدانوب",
      "الرصيد المتوفر: SAR 2673.04",
      "المبلغ الإجمالي المستحق SAR 2326.96",
    ].join("\n");
    expect(isNoiseMessage(sms)).toBe(false);
  });

  it("رسالةٌ لا تُفهم ليست ضجيجاً — تُعرض للمراجعة اليدوية بدل حذفها", () => {
    expect(isNoiseMessage("تنبيه من مصرفك بخصوص خدمة جديدة")).toBe(false);
  });
});

describe("isLikelyDuplicate", () => {
  const existing = [{ amount: 150, date: D, note: "بنده" }];
  it("يكشف نفس اليوم ونفس المبلغ ونفس التاجر", () => {
    expect(isLikelyDuplicate(150, D, "بنده", existing)).toBe(true);
  });
  it("مبلغٌ مختلف ليس تكراراً", () => {
    expect(isLikelyDuplicate(151, D, "بنده", existing)).toBe(false);
  });
  it("يومٌ مختلف ليس تكراراً", () => {
    expect(isLikelyDuplicate(150, "2026-08-02", "بنده", existing)).toBe(false);
  });
  it("فرقُ الكسور دون قرشٍ يُعدّ تطابقاً", () => {
    expect(isLikelyDuplicate(150.004, D, "بنده", existing)).toBe(true);
  });
});

describe("normalizeMerchant", () => {
  it("يُسقط الأرقام والترقيم ويوحّد المسافات", () => {
    expect(normalizeMerchant("ستاربكس #١٢٣  الرياض")).toBe("ستاربكس الرياض");
    expect(normalizeMerchant("STARBUCKS #123")).toBe("starbucks");
  });
  it("يحتمل الفارغ والغائب", () => {
    expect(normalizeMerchant("")).toBe("");
    expect(normalizeMerchant(undefined as unknown as string)).toBe("");
  });
});

describe("learnedCategory / suggestCategory", () => {
  it("قاعدةُ المالك تفوز على التخمين المدمج", () => {
    // «ستاربكس» يخمّنه المدمج كماليات؛ القاعدة تحوّله إلى استثمار لنتأكّد أنّ
    // القاعدة هي التي فازت لا التخمين.
    const rules = { ستاربكس: "cat-investment" };
    expect(learnedCategory("ستاربكس الرياض", cats, rules)).toBe("cat-investment");
    expect(suggestCategory("ستاربكس الرياض", cats, rules)).toBe("cat-investment");
  });

  it("قاعدةٌ تشير إلى تصنيفٍ محذوف تُتجاهَل ويعود التخمين المدمج", () => {
    const rules = { ستاربكس: "cat-deleted" };
    expect(learnedCategory("ستاربكس الرياض", cats, rules)).toBeNull();
    expect(suggestCategory("ستاربكس الرياض", cats, rules)).toBe("cat-luxuries");
  });

  it("بلا قواعد: التخمين المدمج، وأساسيات عند الجهل", () => {
    expect(suggestCategory("متجر لا يعرفه أحد", cats, undefined)).toBe("cat-essentials");
  });
});

describe("parseBankSmsBulk", () => {
  it("يفصل على الأسطر الفارغة", () => {
    const blob = [
      "شراء\nالمبلغ: 150 ريال\nلدى: بنده",
      "",
      "شراء\nالمبلغ: 22 ريال\nلدى: ستاربكس",
    ].join("\n");
    const { transactions } = parseBankSmsBulk(blob, D);
    expect(transactions.map((t) => t.amount)).toEqual([150, 22]);
  });

  it("**لا** يشطر رسالةً واحدة متعدّدة الأسطر إلى مصاريف وهمية", () => {
    // شكل الراجحي: حقلٌ في كلّ سطر. شطرُها كان يحوّل سطرَي المبلغ والرصيد
    // إلى معاملتين.
    const sms = "شراء عبر نقاط البيع\nبطاقة: مدى\nمبلغ: 150.00 ريال\nلدى: بنده\nالرصيد: 2000.00 ريال";
    const { transactions } = parseBankSmsBulk(sms, D);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].amount).toBe(150);
  });

  it("يعدّ الإيداعات المتخطّاة بدل تسجيلها مصاريف", () => {
    const blob = "إيداع راتب\nالمبلغ: 12000 ريال\n\nشراء\nالمبلغ: 30 ريال\nلدى: بنده";
    const { transactions, skippedIncome } = parseBankSmsBulk(blob, D);
    expect(transactions).toHaveLength(1);
    expect(skippedIncome).toBe(1);
  });

  it("عمليةٌ مرفوضة لا تُسجَّل ولو ذكرت مبلغاً في سطرٍ منفصل", () => {
    const sms = "العملية: شراء\nالمبلغ: SAR 100.73\nتم رفض العملية: الرصيد غير كافٍ";
    expect(parseBankSmsBulk(sms, D).transactions).toHaveLength(0);
  });

  it("نصٌّ فارغ لا يرمي", () => {
    expect(parseBankSmsBulk("", D)).toEqual({ transactions: [], skippedIncome: 0 });
    expect(parseBankSmsBulk("   \n  ", D).transactions).toHaveLength(0);
  });
});
