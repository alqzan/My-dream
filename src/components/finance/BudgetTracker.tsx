"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { formatAmount, getCategoryInfo, getMainCategory, budgetLimit, cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";

interface BudgetTrackerProps {
  monthPrefix: string; // YYYY-MM
}

type CapMode = "pct" | "fixed";

const PCT_PRESETS = [10, 20, 30, 50];

// Each budget renders as a little lantern that fills up as you spend —
// empty and glowing gold when you're safe, amber as you approach the cap,
// red once it overflows past the rim. A cap is either a fixed amount or a
// percentage of the monthly income (and then it follows the income).
export function BudgetTracker({ monthPrefix }: BudgetTrackerProps) {
  const { categories, budgets, transactions, monthlyIncome, setBudget, removeBudget, setMonthlyIncome } = useAppStore();
  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState<string>(categories[0]?.id ?? "");
  const [mode, setMode] = useState<CapMode>("pct");
  const [limit, setLimit] = useState("");
  const [pct, setPct] = useState("30");
  const [income, setIncome] = useState(monthlyIncome?.toString() ?? "");

  // A budget cap sits on a main category; spending in its subs counts too.
  const spentByCategory = (category: string) =>
    transactions
      .filter((t) => getMainCategory(categories, t.category).id === category && t.date.startsWith(monthPrefix))
      .reduce((s, t) => s + t.amount, 0);

  // The live store income wins over the local input — the input only
  // exists for the very first time, and the store may have been set from
  // elsewhere (the daily-budget editor) after this component mounted.
  const parsedIncome = monthlyIncome || parseFloat(income) || 0;
  const parsedPct = parseFloat(pct) || 0;
  const previewCap = mode === "pct" ? (parsedIncome * parsedPct) / 100 : parseFloat(limit) || 0;

  function handleAdd() {
    if (mode === "pct") {
      if (!parsedPct || !parsedIncome) return;
      setMonthlyIncome(parsedIncome);
      setBudget(cat, { pct: parsedPct });
    } else {
      const parsed = parseFloat(limit);
      if (!parsed || parsed <= 0) return;
      setBudget(cat, { limit: parsed });
    }
    setAdding(false);
    setLimit("");
  }

  const availableCats = categories.filter((c) => !c.parentId && !budgets.some((b) => b.category === c.id));
  const anyOver = budgets.some((b) => spentByCategory(b.category) > budgetLimit(b, monthlyIncome));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">ميزانية الشهر</span>
          {monthlyIncome ? (
            <span className="text-[10px] text-gray-400">💼 دخلك {formatAmount(monthlyIncome)} ر.س</span>
          ) : null}
        </div>
        {availableCats.length > 0 && (
          <button onClick={() => { setAdding(!adding); setCat(availableCats[0].id); }} className="text-finance p-1">
            <Plus size={16} />
          </button>
        )}
      </div>

      {budgets.length === 0 && !adding && (
        <p className="text-xs text-gray-400 text-center py-3">
          حدّد سقفاً لكل قسم — مبلغاً ثابتاً أو نسبة من دخلك (مثلاً: أساسيات 50٪) — وشاهد الفانوس يمتلئ كل ما اقتربت منه.
        </p>
      )}

      {adding && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-2.5">
          <select
            value={cat} onChange={(e) => setCat(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-finance/40"
          >
            {availableCats.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
            ))}
          </select>

          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {([["pct", "٪ من الدخل"], ["fixed", "مبلغ ثابت"]] as [CapMode, string][]).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-all",
                  mode === m ? "bg-white text-finance shadow-sm" : "text-gray-400"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "pct" ? (
            <div className="space-y-2">
              {!monthlyIncome && (
                <input
                  type="number" value={income} onChange={(e) => setIncome(e.target.value)}
                  placeholder="دخلك الشهري (مرة وحدة)" inputMode="decimal"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
                />
              )}
              <div className="flex gap-1.5 items-center">
                {PCT_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPct(String(p))}
                    className={cn(
                      "text-xs font-bold rounded-lg px-2.5 py-1.5 border transition-colors",
                      parsedPct === p
                        ? "bg-finance text-white border-finance"
                        : "bg-white text-gray-500 border-gray-200 hover:border-finance/40"
                    )}
                  >
                    {p}٪
                  </button>
                ))}
                <input
                  type="number" value={pct} onChange={(e) => setPct(e.target.value)}
                  placeholder="٪" inputMode="numeric" min={1} max={100}
                  className="w-14 text-xs text-center border border-gray-200 rounded-lg py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40"
                  aria-label="نسبة مخصصة"
                />
              </div>
              {previewCap > 0 && (
                <p className="text-[11px] text-gray-500 text-center bg-finance/5 rounded-lg py-1.5">
                  {formatAmount(parsedIncome)} × {parsedPct}٪ = <strong className="text-finance">{formatAmount(previewCap)} ر.س</strong> شهرياً
                </p>
              )}
            </div>
          ) : (
            <input
              type="number" value={limit} onChange={(e) => setLimit(e.target.value)}
              placeholder="السقف بالريال" inputMode="decimal"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
            />
          )}

          <button onClick={handleAdd} className="w-full bg-finance text-white text-sm py-1.5 rounded-lg hover:bg-finance/90">
            إضافة
          </button>
        </div>
      )}

      {budgets.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {budgets.map((b) => {
            const cap = budgetLimit(b, monthlyIncome);
            const spent = spentByCategory(b.category);
            const pctFill = cap > 0 ? Math.min((spent / cap) * 100, 100) : 0;
            const over = cap > 0 && spent > cap;
            const near = !over && pctFill >= 80;
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
                      style={{ height: `${pctFill}%`, backgroundColor: fillColor, opacity: 0.85 }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center text-lg">
                      {info.icon}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-gray-500 text-center leading-tight">
                  {info.label}
                  {b.pct ? <span className="block text-[9px] text-finance font-bold">{b.pct}٪ من الدخل</span> : null}
                </div>
                <div className={`text-[11px] font-semibold text-center ${over ? "text-red-500" : "text-gray-700"}`}>
                  {formatAmount(spent)}<span className="text-gray-400 font-normal">/{formatAmount(cap)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {anyOver && (
        <p className="text-[11px] text-red-500 text-center">⚠️ تجاوزت السقف في بعض الأقسام</p>
      )}
    </div>
  );
}
