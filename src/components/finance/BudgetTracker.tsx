"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { formatAmount, getCategoryInfo, budgetLimit, cn, today, formatDate } from "@/lib/utils";
import { spendWindow, cycleDays } from "@/lib/budgetCycle";
import { budgetStatuses } from "@/lib/budgetStatus";
import { NumberInput } from "@/components/ui/NumberInput";
import { Plus, X, Pencil, Check } from "lucide-react";

type CapMode = "pct" | "fixed";

const PCT_PRESETS = [10, 20, 30, 50];

// Each budget renders as a little lantern that fills up as you spend —
// empty and glowing gold when you're safe, amber as you approach the cap,
// red once it overflows past the rim. A cap is either a fixed amount or a
// percentage of the monthly income (and then it follows the income).
export function BudgetTracker() {
  const {
    categories, budgets, transactions, monthlyIncome, salaryDay, lastSalaryConfirm, budgetWindow,
    setBudget, removeBudget, setMonthlyIncome,
  } = useAppStore();
  const [adding, setAdding] = useState(false);
  // تعديل سقفٍ قائم في مكانه — بلا حذفٍ وإعادة إضافة.
  const [editCat, setEditCat] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<CapMode>("fixed");
  const [editValue, setEditValue] = useState("");
  const [cat, setCat] = useState<string>(categories[0]?.id ?? "");
  const [mode, setMode] = useState<CapMode>("pct");
  const [limit, setLimit] = useState("");
  const [pct, setPct] = useState("30");
  const [income, setIncome] = useState(monthlyIncome?.toString() ?? "");

  // نافذة الحساب يختارها المالك من الإعدادات: دورة الراتب (الافتراضي — تبدأ من
  // تأكيد «نزل الراتب»، أو آخر يوم راتبٍ مرّ إن لم يؤكّد بعد) أو الشهر الميلادي.
  const todayStr = today();
  const byMonth = budgetWindow === "month";
  const win = spendWindow(budgetWindow, lastSalaryConfirm, salaryDay ?? 27, todayStr);
  const daysIn = byMonth ? Number(todayStr.slice(8)) : cycleDays(win, todayStr);

  // حالة كل سقفٍ من المصدر الوحيد (`budgetStatus.ts`) — نفس ما تقرأه شارة
  // الصفحة وبوصلة مدار والتنبيه الحيّ، فلا تختلف شاشتان في الرقم نفسه.
  const statuses = budgetStatuses(budgets, transactions, categories, monthlyIncome, win);
  const statusOf = (category: string) => statuses.find((s) => s.category === category);

  function startEdit(category: string) {
    const b = budgets.find((x) => x.category === category);
    if (!b) return;
    setEditCat(category);
    setEditMode(b.pct ? "pct" : "fixed");
    setEditValue(String(b.pct ?? b.limit ?? ""));
    setAdding(false);
  }

  function saveEdit(category: string) {
    const v = parseFloat(editValue);
    if (!v || v <= 0) return;
    setBudget(category, editMode === "pct" ? { pct: v } : { limit: v });
    setEditCat(null);
  }

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
  const anyOver = statuses.some((s) => s.state === "over");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-700">{byMonth ? "ميزانية الشهر" : "ميزانية الدورة"}</span>
          {monthlyIncome ? (
            <span className="text-[10px] text-gray-400">💼 دخلك {formatAmount(monthlyIncome)} ر.س</span>
          ) : null}
        </div>
        {availableCats.length > 0 && (
          <button onClick={() => { setAdding(!adding); setCat(availableCats[0].id); }} aria-label="إضافة سقف لتصنيف" className="text-finance h-11 w-11 flex items-center justify-center -me-2">
            <Plus size={16} />
          </button>
        )}
      </div>

      {budgets.length > 0 && (
        <p className="text-[10px] text-gray-400">
          {byMonth
            ? `📅 الحساب على الشهر الميلادي — اليوم ${daysIn} من الشهر، ويتصفّر أوّل كل شهر.`
            : `🔄 الحساب من نزول الراتب (${formatDate(win)}) — اليوم ${daysIn} من الدورة، ويتصفّر عند تأكيد «نزل الراتب».`}
          {" "}السقوف نفسها تبقى وتُعدَّل متى شئت (بدّل النافذة من الإعدادات).
        </p>
      )}

      {budgets.length === 0 && !adding && (
        <p className="text-xs text-gray-400 text-center py-3">
          حدّد سقفاً لكل قسم — مبلغاً ثابتاً أو نسبة من دخلك (مثلاً: أساسيات 50٪) — وننبّهك كل ما اقتربت منه. 🎯
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
                <NumberInput
                  value={income} onChange={setIncome}
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
                <NumberInput
                  value={pct} onChange={setPct}
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
            <NumberInput
              value={limit} onChange={setLimit}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {budgets.map((b) => {
            const st = statusOf(b.category);
            const cap = st?.cap ?? budgetLimit(b, monthlyIncome);
            const spent = st?.spent ?? 0;
            const pctFill = cap > 0 ? Math.min((spent / cap) * 100, 100) : 0;
            const over = st?.state === "over";
            const near = st?.state === "near";
            const info = getCategoryInfo(categories, b.category);
            const barColor = over ? "#e05555" : near ? "#e07b39" : info.color;
            const remaining = cap - spent;

            return (
              <div key={b.category} className="rounded-2xl border border-gray-100 bg-gray-50 p-3 space-y-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: `${info.color}22` }}
                  >
                    {info.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-gray-800 truncate">{info.label}</p>
                      {b.pct ? (
                        <span className="text-[9px] font-bold text-finance bg-finance/10 px-1.5 py-0.5 rounded-full shrink-0">
                          {b.pct}٪ من الدخل
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {formatAmount(spent)} / {formatAmount(cap)} ر.س
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className="text-xs font-black tabular-nums"
                      style={{ color: over ? "#e05555" : info.color }}
                    >
                      {over ? `تجاوز ${formatAmount(spent - cap)}` : `باقي ${formatAmount(remaining)}`}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => (editCat === b.category ? setEditCat(null) : startEdit(b.category))}
                        className="text-gray-300 hover:text-finance p-0.5 press"
                        title="تعديل السقف"
                        aria-label={`تعديل سقف ${info.label}`}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => removeBudget(b.category)}
                        className="text-gray-300 hover:text-red-400 p-0.5 press"
                        title="حذف السقف"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                </div>

                {editCat === b.category && (
                  <div className="bg-white dark:bg-white/5 rounded-xl p-2 space-y-2 animate-fade-up">
                    <div className="flex bg-gray-100 rounded-lg p-0.5">
                      {([["pct", "٪ من الدخل"], ["fixed", "مبلغ ثابت"]] as [CapMode, string][]).map(([m, label]) => (
                        <button
                          key={m}
                          onClick={() => setEditMode(m)}
                          className={cn(
                            "flex-1 text-[11px] font-semibold py-1 rounded-md transition-all",
                            editMode === m ? "bg-white text-finance shadow-sm" : "text-gray-400"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <NumberInput
                        value={editValue} onChange={setEditValue}
                        placeholder={editMode === "pct" ? "٪" : "السقف بالريال"}
                        inputMode="decimal"
                        aria-label={`سقف ${info.label}`}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
                      />
                      <button
                        onClick={() => saveEdit(b.category)}
                        className="bg-finance text-white text-xs px-3 rounded-lg hover:bg-finance/90 press inline-flex items-center gap-1"
                      >
                        <Check size={13} /> حفظ
                      </button>
                    </div>
                    {editMode === "pct" && !monthlyIncome && (
                      <p className="text-[10px] text-orange-500">حدّد دخلك الشهري أولاً حتى تعمل النسبة.</p>
                    )}
                  </div>
                )}
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden ring-1 ring-black/5 dark:ring-white/5">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.max(pctFill, 2)}%`,
                      background: `linear-gradient(to left, ${barColor}, ${barColor}bb)`,
                    }}
                  />
                </div>
                {near && !over && (
                  <p className="text-[10px] text-orange-500">⚠️ اقتربت من السقف ({Math.round(pctFill)}%)</p>
                )}
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
