import { describe, it, expect } from "vitest";
import {
  buildFinanceOverview, daysUntilSalary, nearestCommitment, budgetAlerts, defaultPlanOpen,
  planSectionFromHash, historySlice, PLAN_SECTIONS,
} from "./financeOverview";
import { today } from "./utils";
import type { RecurringTransaction, Transaction, FinanceCategoryDef, Budget, ReserveFund, DailyBudget, InstallmentPlan } from "./types";

const tx = (over: Partial<Transaction>): Transaction => ({ id: "t", date: "2026-06-01", amount: 10, category: "", note: "", ...over });
const rec = (over: Partial<RecurringTransaction>): RecurringTransaction => ({
  id: "r", amount: 100, category: "c", note: "فاتورة", unit: "شهري", every: 1,
  dayOfMonth: 15, anchorDate: "2026-01-15", active: true, ...over,
});

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

describe("nearestCommitment", () => {
  it("picks the soonest active recurring and reports its amount/days", () => {
    const now = new Date(2026, 5, 10); // 10 يونيو 2026 محلياً
    const r1 = rec({ id: "r1", dayOfMonth: 15, amount: 500, anchorDate: "2026-01-15" });
    const r2 = rec({ id: "r2", dayOfMonth: 28, amount: 100, anchorDate: "2026-01-28" });
    const n = nearestCommitment([r2, r1], now);
    expect(n?.id).toBe("r1");
    expect(n?.amount).toBe(500);
    expect(n?.due).toBe("2026-06-15");
    expect(n?.daysUntil).toBe(5);
  });
  it("returns null when there are no active commitments", () => {
    expect(nearestCommitment([rec({ active: false })], new Date(2026, 5, 10))).toBeNull();
    expect(nearestCommitment([], new Date())).toBeNull();
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
      dailyBudget, transactions, reserves, recurring: [rec({ active: true })],
      salaryDay: 27, monthPrefix, todayStr: t, now: new Date(2026, 5, 10),
    });
    expect(o.hasBudget).toBe(true);
    expect(o.availableToday).toBe(70); // 100 (يوم واحد) − 30
    expect(o.monthSpend).toBe(30);
    expect(o.reservesTotal).toBe(300);
    expect(o.hasReserves).toBe(true);
    expect(o.nearest?.amount).toBe(100);
  });

  it("flags missing budget honestly instead of a misleading number", () => {
    const t = today();
    const o = buildFinanceOverview({
      dailyBudget: null, transactions: [], reserves: [], recurring: [],
      salaryDay: 27, monthPrefix: t.slice(0, 7), todayStr: t,
    });
    expect(o.hasBudget).toBe(false);
    expect(o.hasReserves).toBe(false);
    expect(o.nearest).toBeNull();
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
    expect(planSectionFromHash("recurring")).toBe("recurring");
    expect(planSectionFromHash("reserves")).toBe("reserves");
  });
  it("returns null for non-plan hashes (e.g. #history is always visible)", () => {
    expect(planSectionFromHash("history")).toBeNull();
    expect(planSectionFromHash("")).toBeNull();
    expect(planSectionFromHash("nope")).toBeNull();
  });
  it("resolves the installments section too (‎/finance#installments‎)", () => {
    expect(planSectionFromHash("installments")).toBe("installments");
  });
  it("the plan-sections registry keeps every section, الأقساط بين المتكررة والاحتياطيات", () => {
    expect([...PLAN_SECTIONS]).toEqual(["daily", "budgets", "recurring", "installments", "reserves"]);
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

describe("nearestCommitment مع الأقساط — بطاقةٌ واحدة بلا تكرار", () => {
  const plan = (over: Partial<InstallmentPlan> = {}): InstallmentPlan => ({
    id: "p1", provider: "تمارا", name: "جوّال", totalPrice: 1200, downPayment: 0,
    installmentAmount: 300, count: 4, firstDueDate: "2026-06-12",
    status: "active", createdAt: "2026-06-01", ...over,
  });

  it("picks an installment when it is nearer than the recurring rule", () => {
    const now = new Date(2026, 5, 10); // 10 يونيو
    const n = nearestCommitment([rec({ id: "r1", dayOfMonth: 15 })], now, { plans: [plan()], transactions: [] });
    expect(n?.kind).toBe("installment");
    expect(n?.planId).toBe("p1");
    expect(n?.amount).toBe(300);
    expect(n?.due).toBe("2026-06-12");
    expect(n?.daysUntil).toBe(2);
  });

  it("keeps the recurring rule when it is nearer", () => {
    const now = new Date(2026, 5, 10);
    const n = nearestCommitment([rec({ id: "r1", dayOfMonth: 11, anchorDate: "2026-01-11" })], now, {
      plans: [plan()], transactions: [],
    });
    expect(n?.kind).toBe("recurring");
    expect(n?.id).toBe("r1");
  });

  it("shows a plan and its reminder rule only ONCE (no double commitment)", () => {
    const now = new Date(2026, 5, 10);
    const reminder = rec({ id: "rem", dayOfMonth: 12, anchorDate: "2026-06-12", amount: 300, generationMode: "reminder" });
    const linked = plan({ recurringId: "rem" });
    const n = nearestCommitment([reminder], now, { plans: [linked], transactions: [] });
    expect(n?.kind).toBe("installment"); // القسط نفسه، لا قاعدة التذكير
    expect(n?.id).toBe("plan:p1:1");
  });

  it("ignores a plan whose installments are all paid", () => {
    const now = new Date(2026, 5, 10);
    const paidTxs: Transaction[] = [1, 2, 3, 4].map((no) => tx({
      id: `t${no}`, amount: 300, date: "2026-06-01", planId: "p1",
      planRole: "installment", planInstallmentNo: no,
    }));
    expect(nearestCommitment([], now, { plans: [plan()], transactions: paidTxs })).toBeNull();
  });

  it("ignores a cancelled plan but keeps its reminder rule visible", () => {
    const now = new Date(2026, 5, 10);
    const reminder = rec({ id: "rem", dayOfMonth: 12, anchorDate: "2026-06-12", amount: 300 });
    const cancelled = plan({ status: "cancelled", recurringId: "rem" });
    const n = nearestCommitment([reminder], now, { plans: [cancelled], transactions: [] });
    expect(n?.kind).toBe("recurring");
  });
});

describe("buildFinanceOverview — ملخّص الأقساط", () => {
  it("reports the active count, remaining total and overdue count", () => {
    const t = today();
    const o = buildFinanceOverview({
      dailyBudget: null, transactions: [], reserves: [], recurring: [],
      installmentPlans: [{
        id: "p1", provider: "تابي", name: "أثاث", totalPrice: 900, downPayment: 0,
        installmentAmount: 300, count: 3, firstDueDate: "2026-01-05",
        status: "active", createdAt: "2026-01-01",
      }],
      salaryDay: 27, monthPrefix: t.slice(0, 7), todayStr: t,
    });
    expect(o.installments.activeCount).toBe(1);
    expect(o.installments.remainingTotal).toBe(900);
    expect(o.installments.overdueCount).toBe(3); // مواعيد 2026 كلّها فاتت
    expect(o.nearest?.kind).toBe("installment");
  });

  it("stays empty (and never throws) when no plans are passed at all", () => {
    const t = today();
    const o = buildFinanceOverview({
      dailyBudget: null, transactions: [], reserves: [], recurring: [],
      salaryDay: 27, monthPrefix: t.slice(0, 7), todayStr: t,
    });
    expect(o.installments.activeCount).toBe(0);
    expect(o.nearest).toBeNull();
  });
});

describe("defaultPlanOpen — قسطٌ فائت يفتح «الأقساط»", () => {
  it("prioritises an overdue installment over a breached cap", () => {
    const d = defaultPlanOpen({ budgetAttention: true, negativeBalance: false, installmentOverdue: true });
    expect(d.installments).toBe(true);
    expect(d.budgets).toBe(false);
  });
});
