"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { Transaction } from "@/lib/types";
import { uid, today } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface TransactionFormProps {
  onClose: () => void;
  initial?: Transaction;
}

export function TransactionForm({ onClose, initial }: TransactionFormProps) {
  const { categories, addTransaction, updateTransaction } = useAppStore();
  const [category, setCategory] = useState<string>(initial?.category ?? categories[0]?.id ?? "");
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [date, setDate] = useState(initial?.date ?? today());
  const [big, setBig] = useState(initial?.big ?? false);

  function handleSave() {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;
    const tx: Transaction = {
      id: initial?.id ?? uid(),
      date,
      amount: parsed,
      category,
      note,
      big,
    };
    if (initial) {
      updateTransaction(initial.id, tx);
    } else {
      addTransaction(tx);
    }
    onClose();
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">المبلغ (ريال)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-2xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-finance/40"
          inputMode="decimal"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 mb-2">التصنيف</label>
        <div className="grid grid-cols-3 gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`flex flex-col items-center gap-1 py-2 px-2 rounded-xl border text-xs transition-colors ${
                category === cat.id
                  ? "border-finance bg-finance/5 text-finance font-semibold"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              <span className="text-xl">{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">التاريخ</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">ملاحظة</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="اختياري"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
          />
        </div>
      </div>

      <label className="flex items-center gap-2.5 bg-amber-50 rounded-xl p-3 cursor-pointer">
        <input
          type="checkbox"
          checked={big}
          onChange={(e) => setBig(e.target.checked)}
          className="w-4 h-4 accent-brand-600"
        />
        <span className="text-xs text-amber-700 leading-relaxed">
          <strong>صرف كبير</strong> (قرض، استثمار كبير...) — ما يأثر على ميزانيتك اليومية، وله عرض خاص في "الالتزامات الكبيرة"
        </span>
      </label>

      <div className="flex gap-2">
        <Button onClick={handleSave} className="flex-1 bg-finance hover:bg-finance/90">
          {initial ? "حفظ" : "إضافة"}
        </Button>
        <Button variant="secondary" onClick={onClose}>إلغاء</Button>
      </div>
    </div>
  );
}
