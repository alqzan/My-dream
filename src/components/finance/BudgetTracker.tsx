"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { FinanceCategory } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { formatAmount } from "@/lib/utils";
import { Plus, X, AlertTriangle } from "lucide-react";

const BUDGETABLE: FinanceCategory[] = ["طعام", "مواصلات", "كمالي", "سفر", "صحة", "تعليم", "أخرى"];

interface BudgetTrackerProps {
  monthPrefix: string; // YYYY-MM
}

export function BudgetTracker({ monthPrefix }: BudgetTrackerProps) {
  const { budgets, transactions, setBudget, removeBudget } = useAppStore();
  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState<FinanceCategory>("طعام");
  const [limit, setLimit] = useState("");

  const spentByCategory = (category: FinanceCategory) =>
    transactions
      .filter((t) => t.type === "مصروف" && t.category === category && t.date.startsWith(monthPrefix))
      .reduce((s, t) => s + t.amount, 0);

  function handleAdd() {
    const parsed = parseFloat(limit);
    if (!parsed || parsed <= 0) return;
    setBudget(cat, parsed);
    setAdding(false);
    setLimit("");
  }

  const availableCats = BUDGETABLE.filter((c) => !budgets.some((b) => b.category === c));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">ميزانية الشهر</span>
        {availableCats.length > 0 && (
          <button onClick={() => { setAdding(!adding); setCat(availableCats[0]); }} className="text-finance p-1">
            <Plus size={16} />
          </button>
        )}
      </div>

      {budgets.length === 0 && !adding && (
        <p className="text-xs text-gray-400 text-center py-3">
          حدّد سقفاً لمصاريفك (مثلاً: كمالي 500 ر.س) وننبّهك عند الاقتراب منه.
        </p>
      )}

      {adding && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          <div className="flex gap-2">
            <select
              value={cat} onChange={(e) => setCat(e.target.value as FinanceCategory)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-finance/40"
            >
              {availableCats.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c].icon} {CATEGORY_LABELS[c].label}</option>
              ))}
            </select>
            <input
              type="number" value={limit} onChange={(e) => setLimit(e.target.value)}
              placeholder="السقف"
              className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
            />
          </div>
          <button onClick={handleAdd} className="w-full bg-finance text-white text-sm py-1.5 rounded-lg hover:bg-finance/90">
            إضافة
          </button>
        </div>
      )}

      <div className="space-y-2.5">
        {budgets.map((b) => {
          const spent = spentByCategory(b.category);
          const pct = Math.min((spent / b.limit) * 100, 100);
          const over = spent > b.limit;
          const near = !over && pct >= 80;
          const info = CATEGORY_LABELS[b.category];
          const barColor = over ? "#e05555" : near ? "#e07b39" : "#3d9640";

          return (
            <div key={b.category} className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span>{info.icon}</span>
                <span className="text-gray-600 flex-1">{info.label}</span>
                {(over || near) && (
                  <AlertTriangle size={13} className={over ? "text-red-500" : "text-orange-500"} />
                )}
                <span className={`text-xs font-semibold ${over ? "text-red-500" : "text-gray-700"}`}>
                  {formatAmount(spent)} / {formatAmount(b.limit)}
                </span>
                <button onClick={() => removeBudget(b.category)} className="text-gray-300 hover:text-red-400">
                  <X size={13} />
                </button>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: barColor }} />
              </div>
              {over && (
                <p className="text-[11px] text-red-500">تجاوزت السقف بـ {formatAmount(spent - b.limit)} ر.س</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
