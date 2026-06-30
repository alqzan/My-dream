"use client";
import type { Transaction } from "@/lib/types";

interface FinanceHealthScoreProps {
  transactions: Transaction[];
}

export function FinanceHealthScore({ transactions }: FinanceHealthScoreProps) {
  const income = transactions.filter((t) => t.type === "دخل").reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter((t) => t.type === "مصروف" && t.category !== "ادخار" && t.category !== "استثمار").reduce((s, t) => s + t.amount, 0);
  const savings = transactions.filter((t) => t.category === "ادخار" || t.category === "استثمار").reduce((s, t) => s + t.amount, 0);
  const luxury = transactions.filter((t) => t.category === "كمالي" || t.category === "سفر").reduce((s, t) => s + t.amount, 0);

  if (!income) return null;

  const savingsRate = savings / income;
  const expenseRatio = expense / income;
  const luxuryRatio = luxury / income;

  // Score 0-100
  let score = 50;
  if (savingsRate >= 0.2) score += 20;
  else if (savingsRate >= 0.1) score += 10;
  if (expenseRatio <= 0.7) score += 20;
  else if (expenseRatio <= 0.9) score += 10;
  if (luxuryRatio <= 0.1) score += 10;
  else if (luxuryRatio > 0.3) score -= 10;
  score = Math.max(0, Math.min(100, score));

  const { label, color, bg, advice } = getHealthInfo(score);

  return (
    <div className={`rounded-2xl p-4 ${bg} space-y-3`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500">نقاط الصحة المالية</p>
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
          <div className="text-xs text-gray-500">ادخار</div>
          <div className="text-sm font-bold text-gray-800">{Math.round(savingsRate * 100)}%</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">مصاريف</div>
          <div className="text-sm font-bold text-gray-800">{Math.round(expenseRatio * 100)}%</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">كمالي</div>
          <div className="text-sm font-bold text-gray-800">{Math.round(luxuryRatio * 100)}%</div>
        </div>
      </div>
    </div>
  );
}

function getHealthInfo(score: number) {
  if (score >= 80) return { label: "ممتاز 🌟", color: "#3d9640", bg: "bg-green-50", advice: "وضعك المالي مثالي، استمر!" };
  if (score >= 65) return { label: "جيد جداً", color: "#4a9fbd", bg: "bg-blue-50", advice: "وضع جيد، يمكن تحسين نسبة الادخار." };
  if (score >= 50) return { label: "متوسط", color: "#d4a017", bg: "bg-yellow-50", advice: "حاول توفير 10-20% من دخلك شهرياً." };
  if (score >= 35) return { label: "يحتاج تحسين", color: "#e07b39", bg: "bg-orange-50", advice: "مصاريفك تتجاوز دخلك، راجع الكماليات." };
  return { label: "خطر", color: "#e05555", bg: "bg-red-50", advice: "وضعك يستوجب مراجعة فورية للمصاريف." };
}
