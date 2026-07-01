"use client";
import type { Budget, Transaction } from "@/lib/types";
import { formatAmount } from "@/lib/utils";

interface FinancePaceProps {
  budgets: Budget[];
  monthTransactions: Transaction[];
}

// Turns "how much budget do I have left" into "how much can I spend per
// day for the rest of the month" — the same pacing idea as ReadingPace,
// applied to money instead of pages.
export function FinancePace({ budgets, monthTransactions }: FinancePaceProps) {
  if (!budgets.length) return null;

  const totalBudget = budgets.reduce((s, b) => s + b.limit, 0);
  const budgetedCats = new Set(budgets.map((b) => b.category));
  const spent = monthTransactions
    .filter((t) => budgetedCats.has(t.category))
    .reduce((s, t) => s + t.amount, 0);
  const remaining = totalBudget - spent;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(1, daysInMonth - now.getDate() + 1);
  const dailyAllowance = remaining / daysLeft;
  const averagePace = totalBudget / daysInMonth;

  const over = remaining < 0;
  const tight = !over && dailyAllowance < averagePace * 0.5;
  const color = over ? "#e05555" : tight ? "#e07b39" : "#1f7a6c";
  const bg = over ? "bg-red-50" : tight ? "bg-orange-50" : "bg-prayer/5";

  return (
    <div className={`rounded-2xl p-4 ${bg} space-y-1.5`}>
      <p className="text-xs font-medium text-gray-500">وتيرة الصرف</p>
      {over ? (
        <p className="text-sm leading-relaxed" style={{ color }}>
          تجاوزت ميزانية الشهر بـ <strong>{formatAmount(Math.abs(remaining))} ر.س</strong> — بقي {daysLeft} يوم.
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-gray-700">
          متبقي <strong style={{ color }}>{formatAmount(remaining)} ر.س</strong> لـ {daysLeft} يوم — يعني
          {" "}<strong style={{ color }}>{formatAmount(dailyAllowance)} ر.س/يوم</strong> متاح لك.
        </p>
      )}
      {tight && <p className="text-[11px] text-orange-500">وتيرتك أبطأ من المعتاد — خفف الكماليات شوي.</p>}
    </div>
  );
}
