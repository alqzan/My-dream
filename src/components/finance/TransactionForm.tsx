"use client";
import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { Transaction, ReserveSplit } from "@/lib/types";
import { uid, today, formatAmount, getSubCategories, reserveBalance, budgetWarningFor, cn } from "@/lib/utils";
import { suggestCategory } from "@/lib/bankParser";
import { showToast } from "@/components/ui/UndoToast";
import { Button } from "@/components/ui/Button";
import { NumberInput } from "@/components/ui/NumberInput";
import { PiggyBank } from "lucide-react";

interface TransactionFormProps {
  onClose: () => void;
  initial?: Transaction;
}

export function TransactionForm({ onClose, initial }: TransactionFormProps) {
  const { categories, reserves, transactions, budgets, monthlyIncome, merchantRules, addTransaction, updateTransaction, addCategory, rememberMerchant } = useAppStore();
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
  const [splits, setSplits] = useState<ReserveSplit[]>(initial?.reserveSplits ?? []);
  const [addingSub, setAddingSub] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  // Once the user picks a category by hand we stop auto-suggesting from the note.
  const [touchedCat, setTouchedCat] = useState(false);
  const [showCats, setShowCats] = useState(!!initial); // شبكة التصنيفات (مطويّة حتى يُكتب التاجر)
  const [showDetails, setShowDetails] = useState(false); // التاريخ ومصدر الصرف

  // Auto-classify from the note while adding a new expense: learned merchant
  // rules first, then keyword guess. Silently pre-selects the section/sub so
  // it's تلقائي — the user can still tap another to override (which locks it).
  useEffect(() => {
    if (initial || touchedCat) return;
    const n = note.trim();
    if (!n) return;
    const id = suggestCategory(n, categories, merchantRules);
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    if (cat.parentId) {
      setMainCat(cat.parentId);
      setSubCat(cat.id);
    } else {
      setMainCat(cat.id);
      setSubCat("");
    }
  }, [note, initial, touchedCat, categories, merchantRules]);

  const selectedMain = categories.find((c) => c.id === mainCat);
  const subs = getSubCategories(categories, mainCat);
  const parsedAmount = parseFloat(amount) || 0;
  const reservedPct = Math.min(100, splits.reduce((s, sp) => s + sp.pct, 0));
  const dailyPct = 100 - reservedPct;

  const balances = useMemo(
    () => new Map(reserves.map((f) => [f.id, reserveBalance(f, transactions)])),
    [reserves, transactions]
  );

  // آخر 5 متاجر/ملاحظات مميّزة (اختصارات سريعة) وآخر مصروف (للتكرار).
  const sortedTx = useMemo(() => [...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), [transactions]);
  const recentMerchants = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of sortedTx) {
      const n = t.note?.trim();
      if (!n || seen.has(n)) continue;
      seen.add(n); out.push(n);
      if (out.length >= 5) break;
    }
    return out;
  }, [sortedTx]);
  const lastTx = sortedTx[0];

  function pickCategoryFor(catId: string) {
    const cat = categories.find((c) => c.id === catId);
    if (cat?.parentId) { setMainCat(cat.parentId); setSubCat(cat.id); }
    else { setMainCat(catId); setSubCat(""); }
  }
  // «كرّر آخر مصروف» — يملأ الحقول دون حفظٍ تلقائي.
  function repeatLast() {
    if (!lastTx) return;
    setAmount(String(lastTx.amount));
    setNote(lastTx.note ?? "");
    pickCategoryFor(lastTx.category);
    setTouchedCat(true);
    setSplits(lastTx.reserveSplits ?? []);
  }

  // اقتراح التصنيف من التاجر (يظهر بعد كتابته وقبل اختيارٍ يدوي).
  const suggestionLabel = (() => {
    if (initial || touchedCat || !note.trim() || !selectedMain) return null;
    const subLabel = subCat ? categories.find((c) => c.id === subCat)?.label : null;
    return subLabel ? `${selectedMain.label} ← ${subLabel}` : selectedMain.label;
  })();

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
      reserveSplits: splits.length ? splits : undefined,
    };
    if (initial) {
      updateTransaction(initial.id, tx);
    } else {
      addTransaction(tx);
    }
    // Learn this merchant → category so the next one is auto-classified.
    if (note.trim()) rememberMerchant(note, tx.category);
    // Live budget alert: warn the moment a category crosses 80% / its cap.
    const w = budgetWarningFor(tx.category, budgets, useAppStore.getState().transactions, categories, monthlyIncome);
    if (w) {
      showToast(
        w.over ? `📛 تجاوزت سقف «${w.label}»` : `⚠️ وصلت ${w.pct}% من سقف «${w.label}»`,
        "warning"
      );
    }
    onClose();
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">المبلغ (ريال)</label>
        <NumberInput
          value={amount}
          onChange={setAmount}
          placeholder="0.00"
          // Land the cursor on the amount when the form opens — the task is to
          // type a number, not to hunt for the field (or focus the close button
          // the modal would otherwise focus first). Only when adding, so an edit
          // doesn't yank focus/scroll on mount.
          autoFocus={!initial}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-2xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-finance/40"
          inputMode="decimal"
        />
      </div>

      {/* المتجر/الملاحظة — ثانياً، ليخدم التصنيف التلقائي */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">المتجر أو الملاحظة</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="مثل: قهوة، بنزين، بقالة…"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
        />
        {/* اختصارات: آخر المتاجر + كرّر آخر مصروف */}
        {!initial && (recentMerchants.length > 0 || lastTx) && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {lastTx && (
              <button onClick={repeatLast} className="text-[11px] font-semibold text-finance bg-finance/10 hover:bg-finance/20 rounded-full px-2.5 py-1 press">
                ↻ كرّر آخر مصروف
              </button>
            )}
            {recentMerchants.map((m) => (
              <button key={m} onClick={() => { setNote(m); setTouchedCat(false); }} className="text-[11px] text-gray-500 bg-gray-100 dark:bg-[#382c1d] hover:bg-gray-200 rounded-full px-2.5 py-1 press truncate max-w-[8rem]">
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* اقتراح التصنيف بعد كتابة التاجر — قبولٌ أو تغيير */}
      {suggestionLabel && !showCats && (
        <div className="flex items-center gap-2 bg-finance/5 border border-finance/20 rounded-xl px-3 py-2.5">
          <span className="text-lg">{selectedMain?.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-gray-400">نقترح تصنيفه</div>
            <div className="text-sm font-bold text-finance truncate">{suggestionLabel}</div>
          </div>
          <button onClick={() => setTouchedCat(true)} className="text-[11px] font-bold text-white bg-finance rounded-lg px-2.5 py-1.5 press">أقبل</button>
          <button onClick={() => setShowCats(true)} className="text-[11px] font-semibold text-gray-500 press">غيّر</button>
        </div>
      )}

      {/* شبكة التصنيفات — متاحة دائماً، لكن لا تُجبر قبل كتابة التاجر */}
      {(showCats || !suggestionLabel) && (
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-gray-500">القسم الرئيسي</label>
          {suggestionLabel && (
            <button onClick={() => { setShowCats(false); setTouchedCat(false); }} className="text-[11px] text-gray-400 press">استخدم الاقتراح</button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {mains.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setMainCat(cat.id); setSubCat(""); setAddingSub(false); setTouchedCat(true); }}
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
                onClick={() => { setSubCat(""); setTouchedCat(true); }}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  !subCat ? "border-finance bg-finance text-white font-semibold" : "border-gray-200 text-gray-500 bg-white"
                }`}
              >
                عام
              </button>
              {subs.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => { setSubCat(sub.id); setTouchedCat(true); }}
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
      )}

      {/* تفاصيل: التاريخ ومصدر الصرف — مطويّة للمصروف العادي */}
      <button type="button" onClick={() => setShowDetails((v) => !v)} className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 press pt-1">
        <span>تفاصيل (التاريخ ومصدر الصرف)</span>
        <span className="text-gray-400">{showDetails ? "▲" : "▼"}</span>
      </button>

      {showDetails && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">التاريخ</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
          />
        </div>
      )}

      {showDetails && reserves.length > 0 && (
        <div className="bg-finance/5 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-finance">
              <PiggyBank size={14} /> مصدر الصرف
            </span>
            <span className={cn("text-[11px] font-bold", dailyPct === 100 ? "text-gray-400" : "text-finance")}>
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
                            ? "bg-finance text-white border-finance"
                            : "bg-white text-gray-500 border-gray-200 hover:border-finance/40"
                        )}
                      >
                        {p === 0 ? "٠" : `${p}%`}
                      </button>
                    ))}
                    <NumberInput
                      value={pct || ""}
                      onChange={(v) => setSplitPct(fund.id, parseInt(v) || 0)}
                      placeholder="%"
                      inputMode="numeric"
                      className="w-11 text-[10px] text-center border border-gray-200 rounded-lg py-1 focus:outline-none focus:ring-1 focus:ring-finance/40"
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

      <div className="flex gap-2">
        <Button onClick={handleSave} className="flex-1 bg-finance hover:bg-finance/90">
          {initial ? "حفظ" : "إضافة"}
        </Button>
        <Button variant="secondary" onClick={onClose}>إلغاء</Button>
      </div>
    </div>
  );
}
