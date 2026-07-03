"use client";
import type { Transaction, FinanceCategoryDef } from "@/lib/types";
import { formatAmount, getCategoryInfo } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface FinanceSummaryProps {
  transactions: Transaction[];
  categories: FinanceCategoryDef[];
}

export function FinanceSummary({ transactions, categories }: FinanceSummaryProps) {
  const totalExpense = transactions.reduce((s, t) => s + t.amount, 0);

  const expenseByCategory = transactions
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount;
      return acc;
    }, {});

  const pieData = Object.entries(expenseByCategory)
    .map(([cat, amount]) => {
      const info = getCategoryInfo(categories, cat);
      return { name: info.label, value: amount, color: info.color };
    })
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="text-xs text-gray-500 mb-1">إجمالي المصاريف</div>
        <div className="text-3xl font-bold text-red-500">
          <AnimatedNumber value={totalExpense} format={formatAmount} />
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5">ر.س</div>
      </div>

      {pieData.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-3">توزيع المصاريف</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={65}
                  dataKey="value"
                  strokeWidth={2}
                  stroke="#fff"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [`${formatAmount(v)} ر.س`, ""]}
                  contentStyle={{ borderRadius: 12, border: "none", fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
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
