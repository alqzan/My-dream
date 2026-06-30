"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { RecurringTransaction, FinanceCategory, FinanceType, RecurringFrequency } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Plus, Trash2, Power } from "lucide-react";

const EXPENSE_CATS: FinanceCategory[] = ["إيجار", "مواصلات", "طعام", "صحة", "تعليم", "كمالي", "سفر", "ادخار", "استثمار", "أخرى"];
const INCOME_CATS: FinanceCategory[] = ["راتب", "استثمارات_دخل"];

export function RecurringManager({ onClose }: { onClose: () => void }) {
  const { recurring, addRecurring, deleteRecurring, updateRecurring, runRecurring } = useAppStore();
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<FinanceType>("مصروف");
  const [category, setCategory] = useState<FinanceCategory>("إيجار");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [frequency, setFrequency] = useState<RecurringFrequency>("شهري");
  const [dayOfMonth, setDayOfMonth] = useState("1");

  const cats = type === "دخل" ? INCOME_CATS : EXPENSE_CATS;

  function handleAdd() {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;
    const r: RecurringTransaction = {
      id: uid(),
      amount: parsed,
      type,
      category,
      note,
      frequency,
      dayOfMonth: parseInt(dayOfMonth) || 1,
      active: true,
    };
    addRecurring(r);
    // Immediately generate any due instance
    setTimeout(() => runRecurring(), 0);
    setAdding(false);
    setAmount(""); setNote("");
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 leading-relaxed">
        المعاملات المتكررة تُضاف <strong>تلقائياً</strong> في موعدها كل شهر/أسبوع — مثل الإيجار والراتب والاشتراكات. ما عاد تحتاج تسجّلها يدوياً.
      </div>

      {/* List */}
      <div className="space-y-2">
        {recurring.length === 0 && !adding && (
          <p className="text-center text-sm text-gray-400 py-4">لا توجد معاملات متكررة</p>
        )}
        {recurring.map((r) => {
          const info = CATEGORY_LABELS[r.category];
          return (
            <div key={r.id} className={`flex items-center gap-2 rounded-xl p-3 border ${r.active ? "bg-white border-gray-100" : "bg-gray-50 border-gray-100 opacity-60"}`}>
              <span className="text-lg">{info.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-700 truncate">{r.note || info.label}</div>
                <div className="text-[11px] text-gray-400">
                  {r.frequency} · يوم {r.dayOfMonth} · {info.label}
                </div>
              </div>
              <span className={`text-sm font-bold ${r.type === "دخل" ? "text-finance" : "text-red-500"}`}>
                {r.type === "دخل" ? "+" : "-"}{r.amount.toLocaleString("ar-SA")}
              </span>
              <button
                onClick={() => updateRecurring(r.id, { active: !r.active })}
                className={`p-1 rounded-lg ${r.active ? "text-finance" : "text-gray-300"}`}
                title={r.active ? "إيقاف" : "تفعيل"}
              >
                <Power size={15} />
              </button>
              <button onClick={() => deleteRecurring(r.id)} className="p-1 text-gray-300 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add form */}
      {adding ? (
        <div className="bg-gray-50 rounded-xl p-3 space-y-3">
          <div className="flex gap-2 p-1 bg-white rounded-lg">
            {(["مصروف", "دخل"] as FinanceType[]).map((t) => (
              <button
                key={t}
                onClick={() => { setType(t); setCategory(t === "دخل" ? "راتب" : "إيجار"); }}
                className={`flex-1 py-1.5 rounded-md text-sm font-semibold ${type === t ? (t === "دخل" ? "bg-finance/10 text-finance" : "bg-red-50 text-red-500") : "text-gray-400"}`}
              >
                {t === "دخل" ? "دخل +" : "مصروف -"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {cats.map((cat) => {
              const info = CATEGORY_LABELS[cat];
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`flex flex-col items-center gap-0.5 py-1.5 rounded-lg border text-[11px] ${category === cat ? "border-finance bg-finance/5 text-finance" : "border-gray-200 text-gray-500"}`}
                >
                  <span className="text-base">{info.icon}</span>
                  {info.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="المبلغ"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
            />
            <input
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="الوصف (إيجار...)"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
            >
              <option value="شهري">شهري</option>
              <option value="أسبوعي">أسبوعي</option>
              <option value="سنوي">سنوي</option>
            </select>
            <input
              type="number" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)}
              placeholder="اليوم"
              min={1} max={28}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleAdd} className="flex-1 bg-finance hover:bg-finance/90" size="sm">حفظ</Button>
            <Button variant="secondary" size="sm" onClick={() => setAdding(false)}>إلغاء</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setAdding(true)} variant="secondary" className="w-full gap-1.5">
          <Plus size={16} /> إضافة معاملة متكررة
        </Button>
      )}

      <Button onClick={onClose} className="w-full">تم</Button>
    </div>
  );
}
