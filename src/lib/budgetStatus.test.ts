// حارس «شاشةٌ واحدة لا شاشتان»: البوصلة والشارة والتنبيه الحيّ وبطاقة السقوف
// كلّها تقرأ من `budgetStatuses` على **نفس** النافذة. البلاغ الذي وُلد منه هذا
// الملف: صفحة الأموال تقول «ضمن السقوف» (اليوم 2 من الدورة، صرف 209) والبوصلة
// تقول «وصلت 97% من سقف أساسيات» — لأنها وحدها كانت تجمع على الشهر الميلادي.
import { describe, it, expect } from "vitest";
import { budgetStatuses, budgetStatusFor, budgetWarningFor, describeSpendWindow } from "./budgetStatus";
import { budgetAlerts } from "./financeOverview";
import { generateInsights } from "./insights";
import { spendWindow } from "./budgetCycle";
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

describe("بوصلة مدار تتبع نافذة صفحة الأموال", () => {
  const base = {
    transactions: all, journalEntries: [], readingLogs: [], books: [], habits: [],
    budgets, categories: cats, reserves: [], prayerLogs: [],
    dailyBudget: null, monthlyIncome: null, futureLetters: [], installmentPlans: [],
    quranHifz: null, quranKhatma: null, lastBackup: "2026-07-28",
  };
  const budgetOnes = (o: object) =>
    generateInsights({ ...base, ...o }).filter((i) => i.dedupeKey.startsWith("finance:budget-"));

  it("لا تحذّر من سقفٍ لم يُقترَب منه في الدورة الجارية", () => {
    expect(budgetOnes({ spendWindowStart: CYCLE })).toEqual([]);
  });

  it("تحذّر فعلاً حين يقترب صرف الدورة نفسها من السقف", () => {
    const hot = [...newCycle, tx("f", "2026-07-28", 5900)];
    const [ins] = budgetOnes({ transactions: hot, spendWindowStart: CYCLE });
    expect(ins.dedupeKey).toBe(`finance:budget-near:basics:${CYCLE}`);
    // المفتاح مقيَّدٌ بالدورة: إخفاء تحذير هذه الدورة لا يُسكِت التي بعدها.
    expect(ins.dedupeKey).not.toBe(
      budgetOnes({ transactions: hot.map((t) => ({ ...t, date: "2026-08-28" })), spendWindowStart: "2026-08-27" })[0]?.dedupeKey
    );
    // ولكلّ تحذيرٍ سطرُ سندٍ يذكر مداه.
    expect(ins.reason).toContain("من نزول الراتب");
  });

  it("تطابق `budgetAlerts` على النافذة نفسها مهما كانت", () => {
    for (const win of [CYCLE, "2026-07", "2026-06"]) {
      const a = budgetAlerts(budgets, all, cats, null, win);
      const list = budgetOnes({ spendWindowStart: win });
      expect(list.filter((i) => i.dedupeKey.startsWith("finance:budget-over:")).length).toBe(a.over);
      expect(list.filter((i) => i.dedupeKey.startsWith("finance:budget-near:")).length).toBe(a.near);
    }
  });

  it("النافذة الافتراضية للمحرّك هي ما تعطيه spendWindow من إعدادات المالك", () => {
    expect(spendWindow("salary", CYCLE, 27, TODAY)).toBe(CYCLE);
    expect(spendWindow("month", CYCLE, 27, TODAY)).toBe("2026-07");
  });
});

describe("describeSpendWindow", () => {
  it("يذكر يوم الدورة أو يوم الشهر بحسب النافذة", () => {
    expect(describeSpendWindow(CYCLE, TODAY)).toContain("اليوم 2 من الدورة");
    expect(describeSpendWindow("2026-07", TODAY)).toContain("اليوم 28 من الشهر");
  });
});
