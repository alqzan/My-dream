"use client";
import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { parseBankSmsBulk, suggestCategory, learnedCategory } from "@/lib/bankParser";
import { deleteInboxItem, type InboxItem } from "@/lib/sync";
import { today, formatAmount, getCategoryInfo } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Trash2, Sparkles, BrainCircuit } from "lucide-react";
import type { Transaction } from "@/lib/types";

interface Pending {
  key: string;
  amount: number;
  note: string;
  date: string;
  catId: string;
  learned: boolean;
}

// Review queue for bank messages that arrived automatically (via the iOS
// Automation → cloud inbox). Each row is pre-classified with the smart
// suggestion; the user just confirms or changes the section, then adds.
export function PendingImport({ items, onClose }: { items: InboxItem[]; onClose: () => void }) {
  const { categories, merchantRules, addTransaction, rememberMerchant } = useAppStore();

  const initial = useMemo<Pending[]>(() => {
    const out: Pending[] = [];
    for (const item of items) {
      const { transactions } = parseBankSmsBulk(item.text, today());
      transactions.forEach((r, i) => {
        const known = learnedCategory(r.note ?? "", categories, merchantRules);
        out.push({
          key: `${item.id}-${i}`,
          amount: r.amount,
          note: r.note,
          date: r.date,
          catId: known ?? suggestCategory(r.note ?? "", categories, merchantRules),
          learned: !!known,
        });
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [rows, setRows] = useState<Pending[]>(initial);

  async function clearInbox() {
    await Promise.all(items.map((it) => deleteInboxItem(it.id).catch(() => {})));
  }

  function setCat(key: string, catId: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, catId } : r)));
  }

  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  async function handleAdd() {
    for (const r of rows) {
      const tx: Transaction = { id: Math.random().toString(36).slice(2), date: r.date, amount: r.amount, category: r.catId, note: r.note };
      addTransaction(tx);
      if (r.note.trim()) rememberMerchant(r.note, r.catId);
    }
    await clearInbox();
    onClose();
  }

  async function handleDiscard() {
    await clearInbox();
    onClose();
  }

  if (!rows.length) {
    return (
      <div className="text-center py-6 space-y-3">
        <p className="text-sm text-gray-500">ما فيه مصاريف جديدة للمراجعة.</p>
        <Button onClick={handleDiscard} className="w-full">تم</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 bg-finance/10 text-finance rounded-xl px-3 py-2 text-xs font-semibold">
        <Sparkles size={15} /> وصلتك {rows.length} معاملة — التجار المعروفون («متعلّم») مصنّفون مسبقاً، بس وافق.
      </div>

      <div className="max-h-[52vh] overflow-y-auto space-y-2 pr-0.5">
        {rows.map((r) => {
          const info = getCategoryInfo(categories, r.catId);
          return (
            <div key={r.key} className="bg-gray-50 rounded-xl p-2.5 space-y-2" style={{ borderRight: `3px solid ${info.color}` }}>
              <div className="flex items-center gap-2">
                <span className="text-lg shrink-0">{info.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-700 truncate">{r.note || "مصروف"}</span>
                    {r.learned && (
                      <span className="flex items-center gap-0.5 text-[9px] font-bold text-finance bg-finance/10 rounded-full px-1.5 py-0.5 shrink-0">
                        <BrainCircuit size={9} /> متعلّم
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400">{r.date}</div>
                </div>
                <span className="text-sm font-bold text-red-500 shrink-0">-{formatAmount(r.amount)}</span>
                <button onClick={() => removeRow(r.key)} className="p-1 text-gray-300 hover:text-red-400 shrink-0" aria-label="تجاهل">
                  <Trash2 size={14} />
                </button>
              </div>
              <CategorySelect categories={categories} value={r.catId} onChange={(id) => setCat(r.key, id)} />
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={handleAdd} className="flex-1 bg-finance hover:bg-finance/90">
          أضف {rows.length} معاملة ✓
        </Button>
        <Button variant="secondary" onClick={handleDiscard}>تجاهل الكل</Button>
      </div>
    </div>
  );
}

// A single dropdown of every category: each main, then its subs indented.
function CategorySelect({
  categories,
  value,
  onChange,
}: {
  categories: { id: string; label: string; icon: string; parentId?: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const mains = categories.filter((c) => !c.parentId);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-xs bg-white border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-finance/40"
    >
      {mains.map((m) => {
        const subs = categories.filter((c) => c.parentId === m.id);
        return (
          <optgroup key={m.id} label={`${m.icon} ${m.label}`}>
            <option value={m.id}>{m.icon} {m.label} (عام)</option>
            {subs.map((s) => (
              <option key={s.id} value={s.id}>&nbsp;&nbsp;↳ {s.icon} {s.label}</option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
