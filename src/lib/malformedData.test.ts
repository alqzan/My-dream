// حارس «قيمةٌ مشوّهةٌ واحدة لا تُسقط التطبيق كلّه».
//
// البلاغ الذي وُلد منه هذا الملف: أثناء مراجعةٍ شاملة حُقنت بياناتٌ لا ينتجها
// التطبيق — حالةُ صلاةٍ خارج الثلاث المعروفة، وميزانيّةٌ يوميّة بلا `startDate`
// — فسقطت **كلّ صفحات التطبيق** لا البطاقةُ صاحبةُ القيمة وحدها: الشريط
// الجانبي والترويسة والصفحة في شجرةٍ واحدة تحرسها حدودُ خطأٍ واحدة، فرميةٌ في
// أيّ ورقةٍ منها تُفرغ الشاشة إلى «صار خطأ مؤقت في التحميل».
//
// وهذه القيم ليست فرضاً نظرياً: البيانات تدخل من نسخةٍ احتياطية، ومن استيراد
// Day One، ومن الرسائل البنكية، ومن دمجِ السحابة مع جهازٍ بإصدارٍ أقدم — وكلّها
// خارج سيطرة كُتّاب التطبيق أنفسهم. المبدأ مُقرٌّ في المشروع أصلاً
// (`UNKNOWN_CATEGORY` لتصنيفٍ محذوف): اعرِض بديلاً محايداً ولا تنهر.
import { describe, it, expect } from "vitest";
import { prayerStatusMeta, PRAYER_STATUS_META } from "./types";
import { computeDailyBudgetStatus, today } from "./utils";
import type { Transaction, DailyBudget } from "./types";

describe("prayerStatusMeta — حالةُ صلاةٍ خارج المعروف", () => {
  it("تُرجع وصفَ الحالات الثلاث كما هي", () => {
    expect(prayerStatusMeta("جماعة")).toBe(PRAYER_STATUS_META["جماعة"]);
    expect(prayerStatusMeta("منفردة")).toBe(PRAYER_STATUS_META["منفردة"]);
    expect(prayerStatusMeta("لم")).toBe(PRAYER_STATUS_META["لم"]);
  });

  it("تعرف الحالتين المضافتين مع شاشة الصلاة المنقولة", () => {
    // «فائتة» و«قضاء» كانتا مثالَي «قيمةٍ مجهولة» في هذا الملفّ، ثمّ صارتا
    // حالتين حقيقيتين — فمن حقّهما وصفٌ خاصٌّ لا الرجوعُ إلى «لم».
    expect(prayerStatusMeta("فائتة")).toBe(PRAYER_STATUS_META["فائتة"]);
    expect(prayerStatusMeta("قضاء")).toBe(PRAYER_STATUS_META["قضاء"]);
  });

  it("تعود إلى «لم» عند قيمةٍ مجهولة بدل أن ترمي", () => {
    // «في وقتها» و«مقضية» صيغتان معقولتان لا يعرفهما النوع — تماماً كما قد
    // يكتبها جهازٌ بإصدارٍ آخر أو نسخةٌ احتياطية محرّرة بيد.
    expect(() => prayerStatusMeta("في وقتها")).not.toThrow();
    expect(prayerStatusMeta("في وقتها")).toBe(PRAYER_STATUS_META["لم"]);
    expect(prayerStatusMeta("مقضية").color).toBe(PRAYER_STATUS_META["لم"].color);
  });

  it("تعود إلى «لم» عند غياب القيمة أصلاً", () => {
    expect(prayerStatusMeta(undefined)).toBe(PRAYER_STATUS_META["لم"]);
    expect(prayerStatusMeta("")).toBe(PRAYER_STATUS_META["لم"]);
  });
});

describe("computeDailyBudgetStatus — ميزانيّةٌ يوميّة مشوّهة", () => {
  const tx = (id: string, date: string, amount: number): Transaction =>
    ({ id, date, amount, category: "cat-essentials", note: "x" });

  it("تحسب الدورة الصحيحة حين تكون البيانات سليمة", () => {
    const budget: DailyBudget = { amount: 100, startDate: today() };
    const s = computeDailyBudgetStatus(budget, [tx("t1", today(), 30)]);
    expect(s.days).toBe(1);
    expect(s.allowance).toBe(100);
    expect(s.spent).toBe(30);
    expect(s.balance).toBe(70);
  });

  it("لا ترمي عند غياب startDate، وتعتبر الدورة بدأت اليوم", () => {
    // البديل محافظٌ عمداً: بدلُ يومٍ واحد لا رصيدٌ تراكميٌّ مخترَعٌ من تاريخٍ
    // لا معنى له — فلا يرى المالك رصيداً وهمياً كبيراً فيصرف على أساسه.
    const budget = { amount: 100 } as unknown as DailyBudget;
    expect(() => computeDailyBudgetStatus(budget, [])).not.toThrow();
    const s = computeDailyBudgetStatus(budget, []);
    expect(s.days).toBe(1);
    expect(s.allowance).toBe(100);
  });

  it("لا ترمي عند startDate مشوّهة الشكل أو غير موجودة في التقويم", () => {
    for (const bad of ["", "غداً", "2026-13-45", "2026-02-30", "26-01-01"]) {
      const budget = { amount: 100, startDate: bad } as DailyBudget;
      expect(() => computeDailyBudgetStatus(budget, []), bad).not.toThrow();
      expect(computeDailyBudgetStatus(budget, []).days, bad).toBe(1);
    }
  });

  it("لا تُنتج NaN حين يكون amount غير رقميّ", () => {
    // NaN أسوأ من الانهيار: يمرّ صامتاً فيُعرض «NaN» في كلّ بطاقةٍ وإحصائية.
    const budget = { amount: undefined, startDate: today() } as unknown as DailyBudget;
    const s = computeDailyBudgetStatus(budget, [tx("t1", today(), 30)]);
    expect(Number.isFinite(s.allowance)).toBe(true);
    expect(Number.isFinite(s.balance)).toBe(true);
    expect(s.allowance).toBe(0);
  });

  it("لا تُنتج NaN حين تكون carryAdjust غير رقمية", () => {
    const budget = { amount: 100, startDate: today(), carryAdjust: null } as unknown as DailyBudget;
    const s = computeDailyBudgetStatus(budget, []);
    expect(Number.isFinite(s.allowance)).toBe(true);
    expect(s.allowance).toBe(100);
  });

  it("تصفّي المصاريف على التاريخ البديل لا على المشوّه", () => {
    // كان السطر يرشّح بـ`dailyBudget.startDate` الخام بينما يحسب الأيام
    // بالبديل — فينفرط الاتّساق بين البدل والمصروف.
    const budget = { amount: 100, startDate: "غداً" } as DailyBudget;
    const s = computeDailyBudgetStatus(budget, [tx("t1", today(), 40)]);
    expect(s.spent).toBe(40);
    expect(s.balance).toBe(60);
  });
});
