// حارس «شاشةٌ واحدة لا شاشتان»: الشارةُ والتنبيهُ الحيّ وبطاقةُ السقوف كلّها
// تقرأ من `budgetStatuses` على **نفس** النافذة. البلاغ الذي وُلد منه هذا الملف:
// صفحة الأموال تقول «ضمن السقوف» (اليوم 2 من الدورة، صرف 209) وشاشةٌ أخرى تقول
// «وصلت 97% من سقف أساسيات» — لأنها وحدها كانت تجمع على الشهر الميلادي.
import { describe, it, expect } from "vitest";
import { budgetStatuses, budgetStatusFor, budgetWarningFor, describeSpendWindow } from "./budgetStatus";
import { budgetAlerts } from "./financeOverview";
import { spendWindow } from "./budgetCycle";
import { budgetLimit } from "./utils";
import type { Transaction, FinanceCategoryDef, Budget } from "./types";

const cats: FinanceCategoryDef[] = [
  { id: "basics", label: "أساسيات", icon: "🧺", color: "#888" },
  { id: "basics-sub", label: "بقالة", icon: "🛒", color: "#888", parentId: "basics" },
];
const budgets: Budget[] = [{ category: "basics", limit: 6273.5 }];
const tx = (id: string, date: string, amount: number, category = "basics"): Transaction =>
  ({ id, date, amount, category, note: "x" });

// دورةٌ بدأت 27 يوليو: صرفُ الدورة المنتهية (يوليو 1–26) ضخم، وصرف الدورة
// الجديدة صغير — تماماً كحالة البلاغ.
const oldCycle = [tx("a", "2026-07-05", 4000), tx("b", "2026-07-18", 1899.11)];
const newCycle = [tx("c", "2026-07-27", 120), tx("d", "2026-07-28", 89, "basics-sub")];
const all = [...oldCycle, ...newCycle];
const TODAY = "2026-07-28";
const CYCLE = "2026-07-27";

describe("نافذة السقوف: الدورة لا الشهر", () => {
  it("الدورة الجديدة تحسب صرفها وحده (وصرف القسم الفرعي يستهلك سقف رئيسه)", () => {
    const [st] = budgetStatuses(budgets, all, cats, null, CYCLE);
    expect(st.spent).toBe(209);
    expect(st.state).toBe("ok");
    expect(Math.round(st.pct)).toBe(3);
  });

  it("الشهر الميلادي يجمع الدورة المنتهية معه — وهذا ما كانت تعرضه البوصلة", () => {
    const [st] = budgetStatuses(budgets, all, cats, null, "2026-07");
    expect(Math.round(st.pct)).toBe(97);
    expect(st.state).toBe("near");
  });

  it("الشارة والتنبيه الحيّ وحالة القسم لا تتناقض مع بعضها على النافذة نفسها", () => {
    expect(budgetAlerts(budgets, all, cats, null, CYCLE)).toEqual({ over: 0, near: 0 });
    expect(budgetWarningFor("basics-sub", budgets, all, cats, null, CYCLE)).toBeNull();
    expect(budgetStatusFor("basics-sub", budgets, all, cats, null, CYCLE)?.spent).toBe(209);

    expect(budgetAlerts(budgets, all, cats, null, "2026-07")).toEqual({ over: 0, near: 1 });
    expect(budgetWarningFor("basics", budgets, all, cats, null, "2026-07")?.pct).toBe(97);
  });

  it("التجاوز يُحسب من النافذة أيضاً", () => {
    const over = [...newCycle, tx("e", "2026-07-28", 7000)];
    const [st] = budgetStatuses(budgets, over, cats, null, CYCLE);
    expect(st.state).toBe("over");
    expect(st.remaining).toBeLessThan(0);
    expect(budgetAlerts(budgets, over, cats, null, CYCLE)).toEqual({ over: 1, near: 0 });
  });
});

describe("describeSpendWindow", () => {
  it("يذكر يوم الدورة أو يوم الشهر بحسب النافذة", () => {
    expect(describeSpendWindow(CYCLE, TODAY)).toContain("اليوم 2 من الدورة");
    expect(describeSpendWindow("2026-07", TODAY)).toContain("اليوم 28 من الشهر");
  });
});

// ما دُفع من مظروفٍ (`reserveSplits`) لا يستهلك سقف القسم: المظروف مموَّلٌ من
// دوراتٍ سابقة، فاحتسابُه هنا يحاسب المالك مرّتين على مالٍ جُمع مرّة — وهو ما
// كان يجعل رحلةً واحدة تُظهر «كماليات» متجاوزةً ثلاثة أضعافها بينما صرفُ الدورة
// منضبط. الشرح في `dailyShare` (utils.ts)، والصرفُ يبقى في مظروفه ومجاميع الشهر.
describe("المظاريف لا تستهلك السقوف", () => {
  const trip = (splits: number): Transaction => ({
    id: "trip", date: CYCLE, amount: 2000, category: "basics", note: "رحلة المدينة",
    reserveSplits: splits ? [{ fundId: "f-trip", pct: splits }] : undefined,
  });

  it("مصروفٌ كامله على مظروف لا يمسّ السقف", () => {
    const [st] = budgetStatuses(budgets, [trip(100)], cats, null, CYCLE);
    expect(st.spent).toBe(0);
    expect(st.state).toBe("ok");
  });

  it("المقسوم يستهلك حصّته من التدفّق العادي وحدها", () => {
    const [st] = budgetStatuses(budgets, [trip(75)], cats, null, CYCLE);
    expect(st.spent).toBe(500);
  });

  it("وبلا مظروفٍ يبقى المبلغ كاملاً على السقف (فلا يضيع صرفٌ عاديّ)", () => {
    const [st] = budgetStatuses(budgets, [trip(0)], cats, null, CYCLE);
    expect(st.spent).toBe(2000);
  });

  it("والشارةُ والتنبيهُ الحيّ يتبعان القاعدة نفسها (شاشةٌ واحدة)", () => {
    const big: Transaction = { ...trip(100), amount: 20000 };
    expect(budgetAlerts(budgets, [big], cats, null, CYCLE)).toEqual({ over: 0, near: 0 });
    expect(budgetWarningFor("basics", budgets, [big], cats, null, CYCLE)).toBeNull();
    expect(budgetAlerts(budgets, [{ ...big, reserveSplits: undefined }], cats, null, CYCLE))
      .toEqual({ over: 1, near: 0 });
  });
});

// ===== سقفٌ بالنسبة من الدخل — الفرعُ الذي لم يُختبر قطّ =====
// لـ`budgetLimit` فرعان: سقفٌ مطلق (`limit`) وسقفٌ **نسبةً من الدخل الشهري**
// (`pct`). كلُّ ما كان يمرّ عليه من اختبارات يُمرّر `monthlyIncome = null`،
// فالفرعُ الثاني — وهو حسابٌ على مال المالك يقود تنبيهات التجاوز — لم يُنفَّذ
// في أيّ اختبار. (و`pct` في ملفّات الاختبار الأخرى نسبةُ **الحالة** لا `Budget.pct`.)
describe("budgetLimit — فرعُ النسبة من الدخل", () => {
  it("النسبةُ تُحسب من الدخل حين يكون معلوماً", () => {
    expect(budgetLimit({ category: "c", pct: 20 }, 10000)).toBe(2000);
    expect(budgetLimit({ category: "c", pct: 7.5 }, 8000)).toBe(600);
  });

  it("وبلا دخلٍ معلوم يسقط إلى السقف المطلق — لا إلى صفرٍ صامت", () => {
    expect(budgetLimit({ category: "c", pct: 20, limit: 1500 }, null)).toBe(1500);
    expect(budgetLimit({ category: "c", pct: 20, limit: 1500 }, 0)).toBe(1500);
  });

  it("والنسبةُ تغلب السقف المطلق حين يجتمعان ويكون الدخل معلوماً", () => {
    expect(budgetLimit({ category: "c", pct: 10, limit: 1500 }, 10000)).toBe(1000);
  });

  it("وبلا نسبةٍ ولا سقفٍ: صفر (ولا NaN)", () => {
    expect(budgetLimit({ category: "c" }, 10000)).toBe(0);
    expect(budgetLimit({ category: "c", pct: 0, limit: 0 }, 10000)).toBe(0);
  });
});
