"use client";
import type { Budget, Transaction, FinanceCategoryDef } from "@/lib/types";
import { formatAmount, budgetLimit, getMainCategory, budgetSpend } from "@/lib/utils";

interface FinancePaceProps {
  budgets: Budget[];
  transactions: Transaction[]; // كل المعاملات — تُصفّى هنا على نافذة الدورة
  categories: FinanceCategoryDef[];
  monthlyIncome: number | null;
  cycleStart: string; // بداية دورة الراتب (YYYY-MM-DD)
  daysLeft: number; // ما بقي حتى نزول الراتب القادم
  cycleLength: number; // طول الدورة بالأيام (للوتيرة المعتادة)
}

// Turns "how much budget do I have left" into "how much can I spend per
// day for the rest of the month" — the same pacing idea as the reading
// caravan (ReadingJourney), applied to money instead of pages.
export function FinancePace({ budgets, transactions, categories, monthlyIncome, cycleStart, daysLeft, cycleLength }: FinancePaceProps) {
  if (!budgets.length) return null;

  const totalBudget = budgets.reduce((s, b) => s + budgetLimit(b, monthlyIncome), 0);
  const budgetedCats = new Set(budgets.map((b) => b.category));
  // Sub-category spending rolls up onto the main category's budget.
  const spent = transactions
    .filter((t) => t.date >= cycleStart && budgetedCats.has(getMainCategory(categories, t.category).id))
    .reduce((s, t) => s + budgetSpend(t), 0);
  const remaining = totalBudget - spent;

  // الوتيرة تُقاس على دورة الراتب لا على الشهر الميلادي — نفس نافذة السقوف.
  const left = Math.max(1, daysLeft);
  const dailyAllowance = remaining / left;
  const averagePace = totalBudget / Math.max(1, cycleLength);

  const over = remaining < 0;
  const tight = !over && dailyAllowance < averagePace * 0.5;
  const color = over ? "#e05555" : tight ? "#e07b39" : "var(--theme-accent)";
  const bg = over ? "bg-red-50" : tight ? "bg-orange-50" : "bg-finance/5";

  return (
    <div className={`rounded-2xl p-4 ${bg} space-y-1.5`}>
      <p className="text-xs font-medium text-gray-500">وتيرة الصرف</p>
      {over ? (
        <p className="text-sm leading-relaxed" style={{ color }}>
          تجاوزت ميزانية الدورة بـ <strong>{formatAmount(Math.abs(remaining))} ر.س</strong> — بقي {left} يوم.
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-gray-700">
          متبقي <strong style={{ color }}>{formatAmount(remaining)} ر.س</strong> لـ {left} يوم — يعني
          {" "}<strong style={{ color }}>{formatAmount(Math.round(dailyAllowance))} ر.س/يوم</strong> متاح لك.
        </p>
      )}
      {tight && <p className="text-[11px] text-orange-500">وتيرتك أبطأ من المعتاد — خفف الكماليات شوي.</p>}
    </div>
  );
}
