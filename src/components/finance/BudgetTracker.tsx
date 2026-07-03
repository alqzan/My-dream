"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { formatAmount, getCategoryInfo, getMainCategory } from "@/lib/utils";
import { Plus, X } from "lucide-react";

interface BudgetTrackerProps {
  monthPrefix: string; // YYYY-MM
}

// Each budget renders as a little lantern that fills up as you spend —
// empty and glowing gold when you're safe, amber as you approach the cap,
// red once it overflows past the rim.
export function BudgetTracker({ monthPrefix }: BudgetTrackerProps) {
  const { categories, budgets, transactions, setBudget, removeBudget } = useAppStore();
  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState<string>(categories[0]?.id ?? "");
  const [limit, setLimit] = useState("");

  // A budget cap sits on a main category; spending in its subs counts too.
  const spentByCategory = (category: string) =>
    transactions
      .filter((t) => getMainCategory(categories, t.category).id === category && t.date.startsWith(monthPrefix))
      .reduce((s, t) => s + t.amount, 0);

  function handleAdd() {
    const parsed = parseFloat(limit);
    if (!parsed || parsed <= 0) return;
    setBudget(cat, parsed);
    setAdding(false);
    setLimit("");
  }

  const availableCats = categories.filter((c) => !c.parentId && !budgets.some((b) => b.category === c.id));
  const anyOver = budgets.some((b) => spentByCategory(b.category) > b.limit);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">ميزانية الشهر</span>
        {availableCats.length > 0 && (
          <button onClick={() => { setAdding(!adding); setCat(availableCats[0].id); }} className="text-finance p-1">
            <Plus size={16} />
          </button>
        )}
      </div>

      {budgets.length === 0 && !adding && (
        <p className="text-xs text-gray-400 text-center py-3">
          حدّد سقفاً لمصاريفك (مثلاً: كمالي 500 ر.س) — وشاهد الفانوس يمتلئ كل ما اقتربت منه.
        </p>
      )}

      {adding && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          <div className="flex gap-2">
            <select
              value={cat} onChange={(e) => setCat(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-finance/40"
            >
              {availableCats.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
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

      {budgets.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {budgets.map((b) => {
            const spent = spentByCategory(b.category);
            const pct = Math.min((spent / b.limit) * 100, 100);
            const over = spent > b.limit;
            const near = !over && pct >= 80;
            const info = getCategoryInfo(categories, b.category);
            const fillColor = over ? "#e05555" : near ? "#e07b39" : "#dc9f3c";

            return (
              <div key={b.category} className="flex flex-col items-center gap-1.5">
                <div className="relative">
                  <button
                    onClick={() => removeBudget(b.category)}
                    className="absolute -top-1.5 -left-1.5 z-10 bg-white rounded-full p-0.5 text-gray-300 hover:text-red-400 shadow-sm"
                  >
                    <X size={11} />
                  </button>
                  <div className="relative w-12 h-16 rounded-t-full rounded-b-lg border-2 border-gray-200 overflow-hidden bg-white">
                    <div
                      className="absolute bottom-0 inset-x-0 transition-all duration-500"
                      style={{ height: `${pct}%`, backgroundColor: fillColor, opacity: 0.85 }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center text-lg">
                      {info.icon}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-gray-500 text-center leading-tight">{info.label}</div>
                <div className={`text-[11px] font-semibold text-center ${over ? "text-red-500" : "text-gray-700"}`}>
                  {formatAmount(spent)}<span className="text-gray-400 font-normal">/{formatAmount(b.limit)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {anyOver && (
        <p className="text-[11px] text-red-500 text-center">⚠️ تجاوزت السقف في بعض التصنيفات</p>
      )}
    </div>
  );
}
