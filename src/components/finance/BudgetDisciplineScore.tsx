"use client";
import type { Transaction, Budget } from "@/lib/types";
import { getNoSpendStreak } from "@/lib/utils";

interface BudgetDisciplineScoreProps {
  transactions: Transaction[]; // all-time, for trend + no-spend streak
  monthTransactions: Transaction[]; // current filtered month only
  budgets: Budget[];
}

// A spending-discipline score (0-100) built entirely from expense data — no
// income needed. Rewards staying under budget, no-spend days, and spending
// less than last week.
export function BudgetDisciplineScore({ transactions, monthTransactions, budgets }: BudgetDisciplineScoreProps) {
  if (!transactions.length) return null;

  let budgetScore = 20; // neutral baseline when no budgets are set yet
  if (budgets.length) {
    const within = budgets.filter((b) => {
      const spent = monthTransactions
        .filter((t) => t.category === b.category)
        .reduce((s, t) => s + t.amount, 0);
      return spent <= b.limit;
    }).length;
    budgetScore = Math.round((within / budgets.length) * 40);
  }

  function sumInRange(startDaysAgo: number, endDaysAgo: number) {
    const end = new Date(); end.setDate(end.getDate() - startDaysAgo);
    const start = new Date(); start.setDate(start.getDate() - endDaysAgo);
    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];
    return transactions
      .filter((t) => t.date >= startStr && t.date <= endStr)
      .reduce((s, t) => s + t.amount, 0);
  }
  const thisWeek = sumInRange(0, 6);
  const lastWeek = sumInRange(7, 13);
  let trendScore = 15;
  if (lastWeek > 0) {
    if (thisWeek <= lastWeek * 0.9) trendScore = 30;
    else if (thisWeek <= lastWeek) trendScore = 20;
    else if (thisWeek <= lastWeek * 1.2) trendScore = 10;
    else trendScore = 0;
  }

  const noSpendStreak = getNoSpendStreak(transactions);
  const score = Math.max(0, Math.min(100, budgetScore + noSpendScore(transactions) + trendScore));
  const { label, color, bg, advice } = getInfo(score);

  return (
    <div className={`rounded-2xl p-4 ${bg} space-y-3`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500">انضباط الميزانية</p>
          <p className="text-2xl font-bold mt-0.5" style={{ color }}>{score}</p>
        </div>
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black border-4"
          style={{ borderColor: color, color }}
        >
          {score}
        </div>
      </div>

      <div className="h-2 bg-white/60 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="font-bold text-sm" style={{ color }}>{label}</span>
        <span className="text-xs text-gray-500">—</span>
        <span className="text-xs text-gray-600 leading-relaxed">{advice}</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xs text-gray-500">🔥 بدون صرف</div>
          <div className="text-sm font-bold text-gray-800">{noSpendStreak} يوم</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">ضمن الميزانية</div>
          <div className="text-sm font-bold text-gray-800">{budgets.length ? `${Math.round((budgetScore / 40) * 100)}%` : "—"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">مقابل الأسبوع الماضي</div>
          <div className="text-sm font-bold text-gray-800">
            {lastWeek > 0 ? `${thisWeek <= lastWeek ? "↓" : "↑"} ${Math.round(Math.abs((thisWeek - lastWeek) / lastWeek) * 100)}%` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

function noSpendScore(transactions: Transaction[]): number {
  // Reward a healthy no-spend streak, capped so it doesn't dominate the score.
  return Math.min(30, getNoSpendStreak(transactions) * 3);
}

function getInfo(score: number) {
  if (score >= 80) return { label: "ممتاز 🌟", color: "#3d9640", bg: "bg-green-50", advice: "انضباط رائع في مصاريفك، استمر!" };
  if (score >= 65) return { label: "جيد جداً", color: "#4a9fbd", bg: "bg-blue-50", advice: "أداء جيد، حافظ على وتيرتك." };
  if (score >= 50) return { label: "متوسط", color: "#d4a017", bg: "bg-yellow-50", advice: "راقب مصاريف الكماليات أكثر شوي." };
  if (score >= 35) return { label: "يحتاج تحسين", color: "#e07b39", bg: "bg-orange-50", advice: "مصاريفك تتسارع، جرّب يوم بدون صرف." };
  return { label: "خطر", color: "#e05555", bg: "bg-red-50", advice: "راجع ميزانياتك — الصرف يتجاوز الحدود." };
}
