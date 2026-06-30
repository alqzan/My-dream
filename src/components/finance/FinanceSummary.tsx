"use client";
import type { Transaction } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { formatAmount } from "@/lib/utils";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface FinanceSummaryProps {
  transactions: Transaction[];
}

export function FinanceSummary({ transactions }: FinanceSummaryProps) {
  const totalIncome = transactions
    .filter((t) => t.type === "دخل")
    .reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions
    .filter((t) => t.type === "مصروف")
    .reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;

  const expenseByCategory = transactions
    .filter((t) => t.type === "مصروف")
    .reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + t.amount;
      return acc;
    }, {});

  const pieData = Object.entries(expenseByCategory)
    .map(([cat, amount]) => ({
      name: CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]?.label ?? cat,
      value: amount,
      color: CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]?.color ?? "#888",
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-finance/5 rounded-xl p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">دخل</div>
          <div className="text-base font-bold text-finance">{formatAmount(totalIncome)}</div>
          <div className="text-[10px] text-gray-400">ر.س</div>
        </div>
        <div className="bg-red-50 rounded-xl p-3 text-center">
          <div className="text-xs text-gray-500 mb-1">مصاريف</div>
          <div className="text-base font-bold text-red-500">{formatAmount(totalExpense)}</div>
          <div className="text-[10px] text-gray-400">ر.س</div>
        </div>
        <div
          className={`rounded-xl p-3 text-center ${
            balance >= 0 ? "bg-blue-50" : "bg-orange-50"
          }`}
        >
          <div className="text-xs text-gray-500 mb-1">صافي</div>
          <div
            className={`text-base font-bold ${
              balance >= 0 ? "text-blue-600" : "text-orange-500"
            }`}
          >
            {formatAmount(Math.abs(balance))}
          </div>
          <div className="text-[10px] text-gray-400">ر.س</div>
        </div>
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
