"use client";
import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { Transaction, ReserveSplit } from "@/lib/types";
import { uid, today, formatAmount, getSubCategories, reserveBalance, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { PiggyBank } from "lucide-react";

interface TransactionFormProps {
  onClose: () => void;
  initial?: Transaction;
}

export function TransactionForm({ onClose, initial }: TransactionFormProps) {
  const { categories, reserves, transactions, addTransaction, updateTransaction, addCategory } = useAppStore();
  const mains = categories.filter((c) => !c.parentId);

  // If editing a transaction whose category is a sub, pre-select its parent
  // as the main and the sub itself.
  const initialCat = categories.find((c) => c.id === initial?.category);
  const [mainCat, setMainCat] = useState<string>(
    initialCat?.parentId ?? initialCat?.id ?? mains[0]?.id ?? ""
  );
  const [subCat, setSubCat] = useState<string>(initialCat?.parentId ? initialCat.id : "");
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [date, setDate] = useState(initial?.date ?? today());
  const [big, setBig] = useState(initial?.big ?? false);
  const [splits, setSplits] = useState<ReserveSplit[]>(initial?.reserveSplits ?? []);
  const [addingSub, setAddingSub] = useState(false);
  const [newSubName, setNewSubName] = useState("");

  const selectedMain = categories.find((c) => c.id === mainCat);
  const subs = getSubCategories(categories, mainCat);
  const parsedAmount = parseFloat(amount) || 0;
  const reservedPct = Math.min(100, splits.reduce((s, sp) => s + sp.pct, 0));
  const dailyPct = 100 - reservedPct;

  const balances = useMemo(
    () => new Map(reserves.map((f) => [f.id, reserveBalance(f, transactions)])),
    [reserves, transactions]
  );

  function setSplitPct(fundId: string, pct: number) {
    setSplits((prev) => {
      const others = prev.filter((s) => s.fundId !== fundId);
      const othersPct = others.reduce((s, sp) => s + sp.pct, 0);
      const clamped = Math.max(0, Math.min(pct, 100 - othersPct));
      return clamped === 0 ? others : [...others, { fundId, pct: clamped }];
    });
  }

  // Create a sub-category inline (under the selected main) and pick it
  // right away — no detour through "تصنيفاتي".
  function handleAddSub() {
    const label = newSubName.trim();
    if (!label || !selectedMain) return;
    const id = uid();
    addCategory({ id, label, icon: selectedMain.icon, color: selectedMain.color, parentId: selectedMain.id });
    setSubCat(id);
    setNewSubName("");
    setAddingSub(false);
  }

  function handleSave() {
    if (!parsedAmount || parsedAmount <= 0) return;
    const tx: Transaction = {
      id: initial?.id ?? uid(),
      date,
      amount: parsedAmount,
      category: subCat || mainCat,
      note,
      big,
      // "big" commitments live outside both the daily budget and the
      // envelopes, so a hidden leftover split must not survive the save.
      reserveSplits: !big && splits.length ? splits : undefined,
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
        <label className="block text-xs font-medium text-gray-500 mb-2">القسم الرئيسي</label>
        <div className="grid grid-cols-3 gap-2">
          {mains.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setMainCat(cat.id); setSubCat(""); setAddingSub(false); }}
              className={`flex flex-col items-center gap-1 py-2 px-2 rounded-xl border text-xs transition-colors ${
                mainCat === cat.id
                  ? "border-finance bg-finance/5 text-finance font-semibold"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              <span className="text-xl">{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {selectedMain?.allowSubs && (
          <div className="mt-2 bg-gray-50 rounded-xl p-2 animate-fade-up">
            <div className="text-[10px] font-medium text-gray-400 mb-1.5">القسم الفرعي (اختياري)</div>
            <div className="flex gap-1.5 flex-wrap items-center">
              <button
                onClick={() => setSubCat("")}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  !subCat ? "border-finance bg-finance text-white font-semibold" : "border-gray-200 text-gray-500 bg-white"
                }`}
              >
                عام
              </button>
              {subs.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setSubCat(sub.id)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    subCat === sub.id ? "border-finance bg-finance text-white font-semibold" : "border-gray-200 text-gray-500 bg-white"
                  }`}
                >
                  {sub.icon} {sub.label}
                </button>
              ))}
              {!addingSub && (
                <button
                  onClick={() => setAddingSub(true)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-dashed border-finance/50 text-finance bg-white font-semibold"
                >
                  + فرعي جديد
                </button>
              )}
            </div>
            {addingSub && (
              <div className="flex gap-1.5 mt-2 animate-fade-up">
                <input
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  placeholder="اكتب اسم القسم الفرعي... (بنزين، فواتير)"
                  className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40"
                  onKeyDown={(e) => e.key === "Enter" && handleAddSub()}
                  autoFocus
                />
                <button
                  onClick={handleAddSub}
                  className="text-[11px] font-bold text-white bg-finance rounded-lg px-3 press shrink-0"
                >
                  إضافة
                </button>
                <button
                  onClick={() => { setAddingSub(false); setNewSubName(""); }}
                  className="text-[11px] text-gray-400 bg-gray-100 rounded-lg px-2 press shrink-0"
                >
                  إلغاء
                </button>
              </div>
            )}
          </div>
        )}
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

      {reserves.length > 0 && !big && (
        <div className="bg-prayer/5 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-prayer">
              <PiggyBank size={14} /> مصدر الصرف
            </span>
            <span className={cn("text-[11px] font-bold", dailyPct === 100 ? "text-gray-400" : "text-prayer")}>
              {dailyPct}% يومية · {reservedPct}% احتياطي
            </span>
          </div>

          {/* Visual split bar */}
          <div className="h-2 rounded-full overflow-hidden flex bg-gray-100">
            <div className="h-full bg-finance transition-all duration-300" style={{ width: `${dailyPct}%` }} />
            {splits.map((sp) => {
              const fund = reserves.find((f) => f.id === sp.fundId);
              return (
                <div
                  key={sp.fundId}
                  className="h-full transition-all duration-300"
                  style={{ width: `${sp.pct}%`, backgroundColor: fund?.color ?? "#1f7a6c" }}
                />
              );
            })}
          </div>

          <div className="space-y-1.5">
            {reserves.map((fund) => {
              const sp = splits.find((s) => s.fundId === fund.id);
              const pct = sp?.pct ?? 0;
              const share = (parsedAmount * pct) / 100;
              const bal = balances.get(fund.id) ?? 0;
              return (
                <div key={fund.id} className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ backgroundColor: fund.color + "1a" }}>
                    {fund.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-700 truncate">{fund.name}</div>
                    <div className="text-[9px] text-gray-400">
                      متاح {formatAmount(bal)} ر.س{pct > 0 && parsedAmount > 0 ? ` — يتحمّل ${formatAmount(share)} ر.س` : ""}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {[0, 25, 50, 100].map((p) => (
                      <button
                        key={p}
                        onClick={() => setSplitPct(fund.id, p)}
                        className={cn(
                          "text-[10px] font-bold rounded-lg px-1.5 py-1 border transition-colors",
                          pct === p
                            ? "bg-prayer text-white border-prayer"
                            : "bg-white text-gray-500 border-gray-200 hover:border-prayer/40"
                        )}
                      >
                        {p === 0 ? "٠" : `${p}%`}
                      </button>
                    ))}
                    <input
                      type="number"
                      value={pct || ""}
                      onChange={(e) => setSplitPct(fund.id, parseInt(e.target.value) || 0)}
                      placeholder="%"
                      inputMode="numeric"
                      className="w-11 text-[10px] text-center border border-gray-200 rounded-lg py-1 focus:outline-none focus:ring-1 focus:ring-prayer/40"
                      aria-label={`نسبة ${fund.name}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 leading-relaxed">
            مثال: هدية ٥٠٪ من اليومية و٥٠٪ من احتياطي الهدايا — كل جزء يتخصم من مصدره.
          </p>
        </div>
      )}

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
