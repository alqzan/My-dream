"use client";
import type { Transaction, FinanceCategoryDef } from "@/lib/types";
import { formatDate, formatAmount, getCategoryInfo } from "@/lib/utils";
import { Gem } from "lucide-react";

interface BigCommitmentsProps {
  transactions: Transaction[]; // already scoped to the month being viewed
  categories: FinanceCategoryDef[];
}

// Rent, a loan payment, a big investment — real money, but not a fair
// comparison against day-to-day discretionary spending. They get their own
// spotlight here instead of tanking the daily budget number.
export function BigCommitments({ transactions, categories }: BigCommitmentsProps) {
  const big = transactions.filter((t) => t.big).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!big.length) return null;

  const total = big.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="bg-gradient-to-br from-brand-50 to-white rounded-2xl border border-brand-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
          <Gem size={15} /> الالتزامات الكبيرة
        </span>
        <span className="text-sm font-bold text-brand-700">{formatAmount(total)} ر.س</span>
      </div>
      <div className="space-y-2">
        {big.map((tx) => {
          const info = getCategoryInfo(categories, tx.category);
          return (
            <div key={tx.id} className="flex items-center gap-3 bg-white/70 rounded-xl p-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                style={{ backgroundColor: info.color + "15" }}
              >
                {info.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800 truncate">{tx.note || info.label}</div>
                <div className="text-[11px] text-gray-400">{formatDate(tx.date)}</div>
              </div>
              <span className="text-sm font-bold text-brand-700 shrink-0">-{formatAmount(tx.amount)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
