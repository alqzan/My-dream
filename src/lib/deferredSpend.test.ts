// الضمانة العابرة للوحدات: **الشراء المؤجّل لا يُحتسب صرفاً في أيّ حساب.**
// هذا الاختبار يمسك الحساباتَ النقيّة كلّها عند بوابةٍ واحدة (`cashOut`)، فلو
// أُضيف تجميعٌ جديد يقرأ `t.amount` مباشرةً ظهر الخلل هنا لا في جيب المالك.
import { describe, it, expect } from "vitest";
import { cashOut, isCashOut, dailyShare, reserveShare, computeDailyBudgetStatus } from "./utils";
import { budgetWarningFor } from "./budgetStatus";
import { buildFinanceOverview, budgetAlerts, biggestCashExpense } from "./financeOverview";
import { aggregateDay } from "./dayAggregator";
import { generateInsights } from "./insights";
import { today } from "./utils";
import type { Transaction, FinanceCategoryDef, Budget } from "./types";

const T = today();
const cats: FinanceCategoryDef[] = [{ id: "cat-x", label: "أساسيات", icon: "🧺", color: "#000" }];
const budgets: Budget[] = [{ category: "cat-x", limit: 1000 }];

// شراءٌ بالتقسيط بـ1200: التزامٌ لا صرف (deferred) + قسطٌ واحد دُفع فعلاً 100.
const principal: Transaction = {
  id: "orig", date: T, amount: 1200, category: "cat-x", note: "جوّال",
  planId: "p1", planRole: "principal", deferred: true,
};
const installment: Transaction = {
  id: "inst1", date: T, amount: 100, category: "cat-x", note: "جوّال — قسط 1",
  planId: "p1", planRole: "installment", planInstallmentNo: 1,
};
const txs = [principal, installment];

describe("cashOut — البوابة الوحيدة", () => {
  it("is zero for a deferred purchase and the full amount otherwise", () => {
    expect(cashOut(principal)).toBe(0);
    expect(cashOut(installment)).toBe(100);
    expect(isCashOut(principal)).toBe(false);
    expect(isCashOut(installment)).toBe(true);
  });

  it("zeroes the daily share and any reserve share of a deferred purchase", () => {
    expect(dailyShare(principal)).toBe(0);
    expect(dailyShare({ ...principal, reserveSplits: [{ fundId: "f1", pct: 50 }] })).toBe(0);
    expect(reserveShare({ ...principal, reserveSplits: [{ fundId: "f1", pct: 50 }] }, "f1")).toBe(0);
    // والدفعة الفعلية تُقسَّم كالعادة.
    expect(reserveShare({ ...installment, reserveSplits: [{ fundId: "f1", pct: 50 }] }, "f1")).toBe(50);
  });
});

describe("الميزانية اليومية", () => {
  it("only the installment eats the allowance (not the 1200 purchase)", () => {
    const status = computeDailyBudgetStatus({ amount: 500, startDate: T }, txs);
    expect(status.spent).toBe(100);
    expect(status.balance).toBe(400);
  });
});

describe("سقوف التصنيفات", () => {
  it("a deferred purchase never breaches a cap on its own", () => {
    expect(budgetAlerts(budgets, [principal], cats, null, T.slice(0, 7))).toEqual({ over: 0, near: 0 });
    // 1200 كان سيتجاوز سقف 1000 لو حُسِب.
    expect(budgetAlerts(budgets, [{ ...principal, deferred: undefined }], cats, null, T.slice(0, 7)))
      .toEqual({ over: 1, near: 0 });
  });

  it("budgetWarningFor ignores it too (the live warning while adding an expense)", () => {
    expect(budgetWarningFor("cat-x", budgets, [principal], cats, null)).toBeNull();
  });
});

describe("صرف الشهر و«نظرة اليوم»", () => {
  it("month spend counts the installment only", () => {
    const o = buildFinanceOverview({
      dailyBudget: null, transactions: txs, reserves: [], recurring: [],
      salaryDay: 27, monthPrefix: T.slice(0, 7), todayStr: T,
    });
    expect(o.monthSpend).toBe(100);
  });
});

describe("«أكبر مصروف» في متابعة الصرف", () => {
  it("never names the deferred 1200 principal — the 100 installment is the biggest cash expense", () => {
    // الحالة بالحرف: أصلٌ مؤجّل 1200 + قسطٌ مدفوع 100.
    const biggest = biggestCashExpense(txs);
    expect(biggest?.id).toBe("inst1");
    expect(cashOut(biggest!)).toBe(100);

    // وشرط التوصية نفسه (نسبة أكبر مصروفٍ من الإجمالي) يُحسب على النقد:
    const total = txs.reduce((s, t) => s + cashOut(t), 0);
    expect(total).toBe(100);
    expect(cashOut(biggest!) / total).toBe(1); // القسط هو كلّ الصرف، لا 1200/100
  });

  it("ignores a period that holds nothing but deferred purchases", () => {
    expect(biggestCashExpense([principal])).toBeNull();
  });

  it("still picks the largest real expense when several exist", () => {
    const big: Transaction = { id: "b", date: T, amount: 400, category: "cat-x", note: "إطارات" };
    expect(biggestCashExpense([...txs, big])?.id).toBe("b");
  });
});

describe("بطاقة اليوم", () => {
  it("the day's expense excludes the deferred purchase but still lists it", () => {
    const day = aggregateDay(T, {
      transactions: txs, journalEntries: [], readingLogs: [], books: [], habits: [], prayerLogs: [],
    });
    expect(day.expense).toBe(100);
    expect(day.transactions).toHaveLength(2); // يظهر في القائمة، بصفر أثرٍ حسابيّ
  });
});

describe("بوصلة مدار", () => {
  it("never raises a budget-over insight from a deferred purchase alone", () => {
    const data = {
      transactions: [principal], journalEntries: [], readingLogs: [], books: [], habits: [],
      budgets, categories: cats, reserves: [], prayerLogs: [],
      dailyBudget: null, monthlyIncome: null, futureLetters: [], installmentPlans: [],
      quranHifz: null, quranKhatma: null, lastBackup: T,
    };
    expect(generateInsights(data).some((i) => i.dedupeKey.startsWith("finance:budget-"))).toBe(false);
    // ولو كان مصروفاً عادياً لظهر التجاوز.
    const cash = { ...data, transactions: [{ ...principal, deferred: undefined }] };
    expect(generateInsights(cash).some((i) => i.dedupeKey.startsWith("finance:budget-over:cat-x:"))).toBe(true);
  });
});
