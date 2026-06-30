"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { Transaction, FinanceCategory, FinanceType } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { uid, today } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface TransactionFormProps {
  onClose: () => void;
  initial?: Transaction;
}

const INCOME_CATS: FinanceCategory[] = ["راتب", "استثمارات_دخل"];
const EXPENSE_CATS: FinanceCategory[] = [
  "إيجار", "مواصلات", "طعام", "صحة", "تعليم",
  "كمالي", "سفر", "ادخار", "استثمار", "أخرى",
];

export function TransactionForm({ onClose, initial }: TransactionFormProps) {
  const { addTransaction, updateTransaction } = useAppStore();
  const [type, setType] = useState<FinanceType>(initial?.type ?? "مصروف");
  const [category, setCategory] = useState<FinanceCategory>(initial?.category ?? "طعام");
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [date, setDate] = useState(initial?.date ?? today());

  const cats = type === "دخل" ? INCOME_CATS : EXPENSE_CATS;

  function handleSave() {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;
    const tx: Transaction = {
      id: initial?.id ?? uid(),
      date,
      amount: parsed,
      type,
      category,
      note,
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
      <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
        {(["مصروف", "دخل"] as FinanceType[]).map((t) => (
          <button
            key={t}
            onClick={() => { setType(t); setCategory(t === "دخل" ? "راتب" : "طعام"); }}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              type === t
                ? t === "دخل"
                  ? "bg-white text-finance shadow-sm"
                  : "bg-white text-red-500 shadow-sm"
                : "text-gray-500"
            }`}
          >
            {t === "دخل" ? "دخل +" : "مصروف -"}
          </button>
        ))}
      </div>

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
          {cats.map((cat) => {
            const info = CATEGORY_LABELS[cat];
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`flex flex-col items-center gap-1 py-2 px-2 rounded-xl border text-xs transition-colors ${
                  category === cat
                    ? "border-finance bg-finance/5 text-finance font-semibold"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                <span className="text-xl">{info.icon}</span>
                <span>{info.label}</span>
              </button>
            );
          })}
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

      <div className="flex gap-2">
        <Button onClick={handleSave} className="flex-1 bg-finance hover:bg-finance/90">
          {initial ? "حفظ" : "إضافة"}
        </Button>
        <Button variant="secondary" onClick={onClose}>إلغاء</Button>
      </div>
    </div>
  );
}
