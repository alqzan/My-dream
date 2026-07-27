import { describe, it, expect } from "vitest";
import {
  lastSalaryDate, budgetCycleStart, nextSalaryDate, cycleDays, inSpendWindow,
  spendWindow,
} from "./budgetCycle";
import { budgetAlerts, projectedCycleSurplus } from "./financeOverview";
import type { Budget, FinanceCategoryDef, Transaction } from "./types";

describe("lastSalaryDate", () => {
  it("returns this month's salary day once it has passed", () => {
    expect(lastSalaryDate(27, "2026-07-29")).toBe("2026-07-27");
  });
  it("falls back to last month before the salary day", () => {
    expect(lastSalaryDate(27, "2026-07-03")).toBe("2026-06-27");
  });
  it("clamps to the last day of a short month", () => {
    expect(lastSalaryDate(31, "2026-02-28")).toBe("2026-02-28");
  });
  it("crosses the year boundary", () => {
    expect(lastSalaryDate(27, "2026-01-05")).toBe("2025-12-27");
  });
});

describe("budgetCycleStart", () => {
  it("starts at the salary confirmation when there is one", () => {
    expect(budgetCycleStart("2026-07-27", 27, "2026-07-29")).toBe("2026-07-27");
  });
  it("keeps an older confirmation until the owner confirms again", () => {
    // مرّ يوم راتبٍ جديد ولم يُؤكَّد — الدورة تنتهي بالضغطة لا بالتاريخ.
    expect(budgetCycleStart("2026-06-27", 27, "2026-07-29")).toBe("2026-06-27");
  });
  it("falls back to the last salary date with no confirmation", () => {
    expect(budgetCycleStart(null, 27, "2026-07-29")).toBe("2026-07-27");
    expect(budgetCycleStart("bogus", 27, "2026-07-29")).toBe("2026-07-27");
  });
});

describe("nextSalaryDate / cycleDays", () => {
  it("points at the coming salary day", () => {
    expect(nextSalaryDate(27, "2026-07-29")).toBe("2026-08-27");
    expect(nextSalaryDate(27, "2026-12-28")).toBe("2027-01-27");
  });
  it("counts the cycle inclusively", () => {
    expect(cycleDays("2026-07-27", "2026-07-27")).toBe(1);
    expect(cycleDays("2026-07-27", "2026-07-30")).toBe(4);
  });
});

describe("inSpendWindow", () => {
  it("treats a YYYY-MM window as the calendar month", () => {
    expect(inSpendWindow("2026-07-01", "2026-07")).toBe(true);
    expect(inSpendWindow("2026-06-30", "2026-07")).toBe(false);
  });
  it("treats a full date as 'from this day on'", () => {
    expect(inSpendWindow("2026-07-27", "2026-07-27")).toBe(true);
    expect(inSpendWindow("2026-08-02", "2026-07-27")).toBe(true);
    expect(inSpendWindow("2026-07-26", "2026-07-27")).toBe(false);
  });
});

describe("budgetAlerts on a salary cycle", () => {
  const cats: FinanceCategoryDef[] = [{ id: "food", label: "أكل", icon: "🍽️", color: "#000" }];
  const budgets: Budget[] = [{ category: "food", limit: 1000 }];
  const tx = (date: string, amount: number): Transaction =>
    ({ id: date + amount, date, amount, category: "food", type: "expense" } as Transaction);

  it("drops spending from before the cycle started", () => {
    const txs = [tx("2026-07-20", 900), tx("2026-07-28", 100)];
    expect(budgetAlerts(budgets, txs, cats, null, "2026-07")).toEqual({ over: 0, near: 1 });
    expect(budgetAlerts(budgets, txs, cats, null, "2026-07-27")).toEqual({ over: 0, near: 0 });
  });
});

describe("projectedCycleSurplus", () => {
  it("projects the cycle's own pace onto the days left", () => {
    // 10 أيام، صُرف 3000 (متوسط 300/يوم) واليوميّة 400 → الرصيد 1000.
    const status = { balance: 1000, spent: 3000, days: 10 };
    const p = projectedCycleSurplus(status, 400, 5);
    expect(p.avgSpend).toBe(300);
    expect(p.projected).toBe(1500); // 1000 + (400−300)×5
    expect(p.optimistic).toBe(3000); // 1000 + 400×5
  });
  it("shows a deficit when the pace outruns the allowance", () => {
    expect(projectedCycleSurplus({ balance: 100, spent: 5000, days: 10 }, 400, 5).projected).toBe(-400);
  });
  it("is the plain balance on salary day itself", () => {
    expect(projectedCycleSurplus({ balance: 250, spent: 0, days: 1 }, 400, 0).projected).toBe(250);
  });
});

describe("spendWindow (اختيار المالك)", () => {
  it("يرجع الشهر الميلادي عند اختيار «month»", () => {
    expect(spendWindow("month", "2026-07-27", 27, "2026-07-29")).toBe("2026-07");
  });
  it("يرجع بداية دورة الراتب افتراضياً وعند «salary»", () => {
    expect(spendWindow("salary", "2026-07-27", 27, "2026-07-29")).toBe("2026-07-27");
    expect(spendWindow(undefined, null, 27, "2026-07-29")).toBe("2026-07-27");
  });
});
