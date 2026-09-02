import { describe, it, expect } from "vitest";
import {
  buildFinanceOverview, daysUntilSalary, budgetAlerts, defaultPlanOpen,
  planSectionFromHash, historySlice, PLAN_SECTIONS, surplusPullSource,
} from "./financeOverview";
import { today } from "./utils";
import type { Transaction, FinanceCategoryDef, Budget, ReserveFund, DailyBudget } from "./types";
import { SURPLUS_FUND_NAME } from "./types";

const tx = (over: Partial<Transaction>): Transaction => ({ id: "t", date: "2026-06-01", amount: 10, category: "", note: "", ...over });

describe("daysUntilSalary", () => {
  it("counts to this month's salary day, 0 on the day itself", () => {
    expect(daysUntilSalary(27, "2026-06-20")).toBe(7);
    expect(daysUntilSalary(27, "2026-06-27")).toBe(0);
  });
  it("rolls to next month (and year) once the day has passed", () => {
    expect(daysUntilSalary(27, "2026-06-28")).toBe(29); // يوليو 27
    expect(daysUntilSalary(27, "2026-12-28")).toBe(30); // يناير 27 (عبور السنة)
  });
});

describe("budgetAlerts", () => {
  const cats: FinanceCategoryDef[] = [{ id: "cat-x", label: "أساسيات", icon: "🧺", color: "#000" }];
  const budgets: Budget[] = [{ category: "cat-x", limit: 100 }];
  it("counts an exceeded cap as over", () => {
    const txs = [tx({ category: "cat-x", amount: 120, date: "2026-06-05" })];
    expect(budgetAlerts(budgets, txs, cats, null, "2026-06")).toEqual({ over: 1, near: 0 });
  });
  it("counts a cap at ≥80% as near (not over)", () => {
    const txs = [tx({ category: "cat-x", amount: 85, date: "2026-06-05" })];
    expect(budgetAlerts(budgets, txs, cats, null, "2026-06")).toEqual({ over: 0, near: 1 });
  });
  it("ignores spending from other months", () => {
    const txs = [tx({ category: "cat-x", amount: 120, date: "2026-05-05" })];
    expect(budgetAlerts(budgets, txs, cats, null, "2026-06")).toEqual({ over: 0, near: 0 });
  });
});

describe("buildFinanceOverview", () => {
  it("summarizes when data is complete", () => {
    const t = today();
    const monthPrefix = t.slice(0, 7);
    const dailyBudget: DailyBudget = { amount: 100, startDate: t };
    const reserves: ReserveFund[] = [
      { id: "f1", name: "سفر", icon: "✈️", color: "#000", deposits: [{ id: "d1", date: t, amount: 300 }], createdAt: t },
    ];
    const transactions = [tx({ id: "a", date: t, amount: 30, category: "cat-x" })];
    const o = buildFinanceOverview({
      dailyBudget, transactions, reserves,
      salaryDay: 27, monthPrefix, todayStr: t, now: new Date(2026, 5, 10),
    });
    expect(o.hasBudget).toBe(true);
    expect(o.availableToday).toBe(70); // 100 (يوم واحد) − 30
    expect(o.monthSpend).toBe(30);
    expect(o.reservesTotal).toBe(300);
    expect(o.hasReserves).toBe(true);
  });

  it("flags missing budget honestly instead of a misleading number", () => {
    const t = today();
    const o = buildFinanceOverview({
      dailyBudget: null, transactions: [], reserves: [],
      salaryDay: 27, monthPrefix: t.slice(0, 7), todayStr: t,
    });
    expect(o.hasBudget).toBe(false);
    expect(o.hasReserves).toBe(false);
  });
});

describe("defaultPlanOpen", () => {
  it("opens the budgets section when a cap needs attention", () => {
    expect(defaultPlanOpen({ budgetAttention: true, negativeBalance: false }).budgets).toBe(true);
    expect(defaultPlanOpen({ budgetAttention: true, negativeBalance: false }).daily).toBe(false);
  });
  it("otherwise opens the daily budget by default", () => {
    const d = defaultPlanOpen({ budgetAttention: false, negativeBalance: false });
    expect(d.daily).toBe(true);
    expect(d.budgets).toBe(false);
  });
});

describe("planSectionFromHash — deep links open the right collapsible", () => {
  it("resolves each plan section hash", () => {
    expect(planSectionFromHash("daily")).toBe("daily");
    expect(planSectionFromHash("budgets")).toBe("budgets");
    expect(planSectionFromHash("reserves")).toBe("reserves");
  });
  it("returns null for non-plan hashes (e.g. #history is always visible)", () => {
    expect(planSectionFromHash("history")).toBeNull();
    expect(planSectionFromHash("")).toBeNull();
    expect(planSectionFromHash("nope")).toBeNull();
  });
  it("الأقسام المحذوفة لم تعد روابطَ عميقة", () => {
    expect(planSectionFromHash("installments")).toBeNull();
    expect(planSectionFromHash("assets")).toBeNull();
    expect(planSectionFromHash("shelf")).toBeNull();
    expect(planSectionFromHash("recurring")).toBeNull();
  });
  it("the plan-sections registry keeps every remaining section", () => {
    expect([...PLAN_SECTIONS]).toEqual(["daily", "budgets", "reserves"]);
  });
});

describe("historySlice — «إظهار المزيد» pagination", () => {
  const list = Array.from({ length: 45 }, (_, i) => i);
  it("returns the first page and flags more", () => {
    const { visible, hasMore, remaining } = historySlice(list, 20);
    expect(visible).toHaveLength(20);
    expect(visible[0]).toBe(0); // الترتيب محفوظ (الأحدث أوّلاً يُمرَّر مُرتَّباً)
    expect(hasMore).toBe(true);
    expect(remaining).toBe(25);
  });
  it("shows everything once the limit covers the list", () => {
    const { visible, hasMore, remaining } = historySlice(list, 100);
    expect(visible).toHaveLength(45);
    expect(hasMore).toBe(false);
    expect(remaining).toBe(0);
  });
});

describe("surplusPullSource — مصدر إعادة الفوائض لليومية", () => {
  const fund = (over: Partial<ReserveFund>): ReserveFund => ({
    id: "f1", name: SURPLUS_FUND_NAME, icon: "✨", color: "#c9852a",
    deposits: [{ id: "d1", date: "2026-01-01", amount: 642.39 }], createdAt: "2026-01-01", ...over,
  });

  it("يرجع الصندوق ورصيده حين تتوفّر الشروط", () => {
    expect(surplusPullSource([fund({})], [], true)).toEqual({ fundId: "f1", balance: 642.39 });
  });

  it("لا مصدر بلا ميزانيةٍ يومية (لا وعاء يستقبل المبلغ)", () => {
    expect(surplusPullSource([fund({})], [], false)).toBeNull();
  });

  it("لا مصدر بصندوقٍ فارغ أو بلا صندوق فوائض", () => {
    expect(surplusPullSource([fund({ deposits: [] })], [], true)).toBeNull();
    expect(surplusPullSource([fund({ name: "عام" })], [], true)).toBeNull();
    expect(surplusPullSource([], [], true)).toBeNull();
  });

  it("يطرح ما صُرف من الصندوق قبل عرض الرصيد", () => {
    const spend = tx({ id: "t1", amount: 142.39, reserveSplits: [{ fundId: "f1", pct: 100 }] });
    expect(surplusPullSource([fund({})], [spend], true)).toEqual({ fundId: "f1", balance: 500 });
    const drain = tx({ id: "t2", amount: 642.39, reserveSplits: [{ fundId: "f1", pct: 100 }] });
    expect(surplusPullSource([fund({})], [drain], true)).toBeNull();
  });
});
