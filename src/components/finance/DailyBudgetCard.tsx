"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { computeDailyBudgetStatus, formatAmount } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Settings2 } from "lucide-react";

// A cumulative daily allowance instead of a monthly cap: spend less than
// the daily rate today and it cushions tomorrow, spend more and it eats
// into your running balance. "big" transactions are excluded on purpose —
// see TransactionForm/RecurringManager.
export function DailyBudgetCard() {
  const { dailyBudget, transactions, setDailyBudget, removeDailyBudget } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(dailyBudget?.amount?.toString() ?? "");

  function handleSave() {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;
    setDailyBudget(parsed);
    setEditing(false);
  }

  if (!dailyBudget || editing) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div>
          <span className="text-sm font-semibold text-gray-700">الميزانية اليومية المتراكمة</span>
          <p className="text-xs text-gray-400 mt-0.5">
            حدّد مبلغاً يومياً — لو صرفت أقل ينضاف الفرق ليومك الجاي، ولو صرفت أكثر يتخصم منه.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="مثلاً 500"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
          />
          <button onClick={handleSave} className="bg-finance text-white text-sm px-4 py-2 rounded-lg hover:bg-finance/90 shrink-0">
            {dailyBudget ? "تحديث" : "ابدأ"}
          </button>
          {editing && (
            <button onClick={() => setEditing(false)} className="text-sm px-3 py-2 rounded-lg text-gray-500 bg-gray-100 shrink-0">إلغاء</button>
          )}
        </div>
        {dailyBudget && editing && (
          <button onClick={() => { removeDailyBudget(); setEditing(false); }} className="text-[11px] text-red-400 hover:text-red-500">
            إيقاف الميزانية اليومية
          </button>
        )}
      </div>
    );
  }

  const status = computeDailyBudgetStatus(dailyBudget, transactions);
  const over = status.balance < 0;
  const excludedBig = transactions
    .filter((t) => t.big && t.date >= dailyBudget.startDate)
    .reduce((s, t) => s + t.amount, 0);

  return (
    <div className={`rounded-2xl p-4 space-y-2 ${over ? "bg-red-50" : "bg-prayer/5"}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">الميزانية اليومية المتراكمة</span>
        <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-gray-600 p-1">
          <Settings2 size={15} />
        </button>
      </div>
      <div className="text-center py-1">
        <div className={`text-3xl font-bold ${over ? "text-red-500" : "text-prayer"}`}>
          {over ? "-" : "+"}<AnimatedNumber value={Math.abs(status.balance)} format={formatAmount} />
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5">ر.س {over ? "بالسالب" : "رصيدك متراكم"}</div>
      </div>
      <p className="text-xs text-gray-500 text-center leading-relaxed">
        {formatAmount(dailyBudget.amount)} ر.س × {status.days} يوم = {formatAmount(status.allowance)} ر.س متاح — صرفت {formatAmount(status.spent)} ر.س
        {excludedBig > 0 && ` (باستثناء ${formatAmount(excludedBig)} ر.س التزامات كبيرة)`}
      </p>
    </div>
  );
}
