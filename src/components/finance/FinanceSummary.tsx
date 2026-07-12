"use client";
import dynamic from "next/dynamic";
import type { Transaction, FinanceCategoryDef } from "@/lib/types";
import { formatAmount, getMainCategory } from "@/lib/utils";

// Defer recharts — the total + legend render instantly, the donut fills in.
const ExpensePie = dynamic(() => import("./ExpensePie").then((m) => m.ExpensePie), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-gray-100 rounded-full" />,
});

interface FinanceSummaryProps {
  transactions: Transaction[];
  categories: FinanceCategoryDef[];
}

export function FinanceSummary({ transactions, categories }: FinanceSummaryProps) {
  const totalExpense = transactions.reduce((s, t) => s + t.amount, 0);

  // Sub-categories roll up to their main — the pie stays at the main level.
  const expenseByCategory = transactions
    .reduce<Record<string, number>>((acc, t) => {
      const mainId = getMainCategory(categories, t.category).id;
      acc[mainId] = (acc[mainId] || 0) + t.amount;
      return acc;
    }, {});

  const pieData = Object.entries(expenseByCategory)
    .map(([cat, amount]) => {
      const info = getMainCategory(categories, cat);
      return { name: info.label, value: amount, color: info.color };
    })
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-xs text-gray-500 mb-1">إجمالي المصاريف</div>
        <div className="text-3xl font-bold text-red-500">{formatAmount(totalExpense)}</div>
        <div className="text-[11px] text-gray-400 mt-0.5">ر.س</div>
      </div>

      {pieData.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-3">توزيع المصاريف</p>
          <div className="h-40">
            <ExpensePie data={pieData} />
          </div>
          <div className="space-y-1.5 mt-2">
            {pieData.slice(0, 5).map((d) => (
              <div key={d.name} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                <span className="text-xs text-gray-600 flex-1">{d.name}</span>
                <span className="text-xs font-semibold text-gray-800">{formatAmount(d.value)} ر.س</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
