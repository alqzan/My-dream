// الضمانة العابرة للوحدات: **المصروف الموسوم `offBudget` صرفٌ حقيقيّ في كل
// مجموعٍ وإحصاء، وصفرٌ في الميزانيات وحدها.** الفرق عن المؤجّل جوهريّ: ذاك لم
// يخرج من الجيب أصلاً (`cashOut` = 0)، وهذا خرج لكنّه استثناءٌ لا يتكرّر (رسوم
// اختبار) فلا يُحاسَب عليه في اليومية ولا السقوف. البوابة هي `budgetSpend`، فلو
// أُضيف حسابُ ميزانيةٍ جديد يقرأ `cashOut` مباشرةً ظهر الخلل هنا.
import { describe, it, expect } from "vitest";
import {
  cashOut, isCashOut, budgetSpend, countsInBudget, dailyShare, reserveShare,
  computeDailyBudgetStatus, today,
} from "./utils";
import { budgetWarningFor } from "./budgetStatus";
import { buildFinanceOverview, budgetAlerts, biggestCashExpense } from "./financeOverview";
import { aggregateDay } from "./dayAggregator";
import { generateInsights } from "./insights";
import type { Transaction, FinanceCategoryDef, Budget } from "./types";

const T = today();
const cats: FinanceCategoryDef[] = [{ id: "cat-x", label: "أساسيات", icon: "🧺", color: "#000" }];
const budgets: Budget[] = [{ category: "cat-x", limit: 1000 }];

// رسوم اختبار CFA بـ1200: مدفوعةٌ فعلاً، لكن تسجيلها داخل الميزانية يخرّبها.
const exam: Transaction = {
  id: "cfa", date: T, amount: 1200, category: "cat-x", note: "رسوم اختبار CFA",
  offBudget: true,
};
const coffee: Transaction = { id: "c1", date: T, amount: 100, category: "cat-x", note: "قهوة" };
const txs = [exam, coffee];

describe("budgetSpend — بوابة الميزانيات", () => {
  it("keeps an off-budget expense as real cash but zeroes its budget charge", () => {
    expect(cashOut(exam)).toBe(1200); // خرج من الجيب — بخلاف المؤجّل
    expect(isCashOut(exam)).toBe(true);
    expect(budgetSpend(exam)).toBe(0);
    expect(countsInBudget(exam)).toBe(false);
    expect(budgetSpend(coffee)).toBe(100);
    expect(countsInBudget(coffee)).toBe(true);
  });

  it("zeroes the daily share while a reserve split still drains its fund", () => {
    expect(dailyShare(exam)).toBe(0);
    expect(dailyShare({ ...exam, reserveSplits: [{ fundId: "f1", pct: 50 }] })).toBe(0);
    // المال خرج فعلاً من المظروف، فالاحتياطي يُخصم كالعادة.
    expect(reserveShare({ ...exam, reserveSplits: [{ fundId: "f1", pct: 50 }] }, "f1")).toBe(600);
  });

  it("a deferred purchase stays zero cash regardless of the flag", () => {
    expect(budgetSpend({ amount: 1200, deferred: true })).toBe(0);
  });
});

describe("الميزانية اليومية", () => {
  it("only the ordinary expense eats the allowance", () => {
    const status = computeDailyBudgetStatus({ amount: 500, startDate: T }, txs);
    expect(status.spent).toBe(100);
    expect(status.balance).toBe(400);
    // ولولا الوسم لالتهم الاختبارُ اليوميةَ وأغرق الرصيد.
    const naive = computeDailyBudgetStatus({ amount: 500, startDate: T }, [{ ...exam, offBudget: undefined }, coffee]);
    expect(naive.balance).toBe(-800);
  });
});

describe("سقوف الأقسام", () => {
  it("an off-budget expense never breaches a cap", () => {
    expect(budgetAlerts(budgets, [exam], cats, null, T.slice(0, 7))).toEqual({ over: 0, near: 0 });
    expect(budgetAlerts(budgets, [{ ...exam, offBudget: undefined }], cats, null, T.slice(0, 7)))
      .toEqual({ over: 1, near: 0 });
  });

  it("budgetWarningFor ignores it too (the live warning while saving an expense)", () => {
    expect(budgetWarningFor("cat-x", budgets, [exam], cats, null)).toBeNull();
  });

  it("راجعةُ البوصلة لا تُنذر بتجاوزٍ سببه مصروفٌ خارج الميزانيات", () => {
    const data = {
      transactions: [exam], journalEntries: [], readingLogs: [], books: [], habits: [],
      budgets, categories: cats, reserves: [], prayerLogs: [],
      dailyBudget: null, monthlyIncome: null, futureLetters: [], installmentPlans: [],
      quranHifz: null, quranKhatma: null, lastBackup: T,
    };
    expect(generateInsights(data).some((i) => i.dedupeKey.startsWith("finance:budget-"))).toBe(false);
  });
});

describe("يبقى مصروفاً في كل صورةٍ للصرف", () => {
  it("month spend, the day card and «أكبر مصروف» all count it", () => {
    const o = buildFinanceOverview({
      dailyBudget: null, transactions: txs, reserves: [], recurring: [],
      salaryDay: 27, monthPrefix: T.slice(0, 7), todayStr: T,
    });
    expect(o.monthSpend).toBe(1300);

    const day = aggregateDay(T, {
      transactions: txs, journalEntries: [], readingLogs: [], books: [], habits: [], prayerLogs: [],
    });
    expect(day.expense).toBe(1300);

    expect(biggestCashExpense(txs)?.id).toBe("cfa");
  });
});
