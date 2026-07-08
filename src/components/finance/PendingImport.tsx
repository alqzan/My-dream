"use client";
import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { parseBankSmsBulk, suggestCategory, learnedCategory, isLikelyDuplicate } from "@/lib/bankParser";
import { deleteInboxItem, type InboxItem } from "@/lib/sync";
import { today, formatAmount, getCategoryInfo, budgetWarningFor, cn, uid } from "@/lib/utils";
import { showToast } from "@/components/ui/UndoToast";
import { Button } from "@/components/ui/Button";
import { Sparkles, BrainCircuit, Check, Copy, Plus, X } from "lucide-react";
import type { FinanceCategoryDef, Transaction } from "@/lib/types";

interface Pending {
  key: string;
  amount: number;
  note: string;
  date: string;
  catId: string;
  learned: boolean;
  dup: boolean;       // looks already-recorded
  included: boolean;  // will be added on confirm
}

// Review queue for bank messages that arrived automatically (via the iOS
// Automation → cloud inbox). Each row is pre-classified with the smart
// suggestion; the user just confirms or changes the section, then adds.
export function PendingImport({ items, onClose }: { items: InboxItem[]; onClose: () => void }) {
  const { categories, merchantRules, transactions, budgets, monthlyIncome, addTransaction, addCategory, rememberMerchant } = useAppStore();
  // Which row is currently showing the inline "new category" form (by key).
  const [addingFor, setAddingFor] = useState<string | null>(null);

  const initial = useMemo<Pending[]>(() => {
    const out: Pending[] = [];
    for (const item of items) {
      const { transactions: parsed } = parseBankSmsBulk(item.text, today());
      parsed.forEach((r, i) => {
        const known = learnedCategory(r.note ?? "", categories, merchantRules);
        const dup = isLikelyDuplicate(r.amount, r.date, r.note ?? "", transactions);
        out.push({
          key: `${item.id}-${i}`,
          amount: r.amount,
          note: r.note,
          date: r.date,
          catId: known ?? suggestCategory(r.note ?? "", categories, merchantRules),
          learned: !!known,
          dup,
          included: !dup, // suspected duplicates start unchecked
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

  function toggleInclude(key: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, included: !r.included } : r)));
  }

  const chosen = rows.filter((r) => r.included);

  async function handleAdd() {
    for (const r of chosen) {
      const tx: Transaction = { id: Math.random().toString(36).slice(2), date: r.date, amount: r.amount, category: r.catId, note: r.note };
      addTransaction(tx);
      if (r.note.trim()) rememberMerchant(r.note, r.catId);
    }
    // Live budget alert for any category these expenses pushed to its limit.
    const fresh = useAppStore.getState().transactions;
    const seen = new Set<string>();
    let warn: { label: string; over: boolean; pct: number } | null = null;
    for (const r of chosen) {
      const w = budgetWarningFor(r.catId, budgets, fresh, categories, monthlyIncome);
      if (w && !seen.has(w.label)) {
        seen.add(w.label);
        if (!warn || (w.over && !warn.over)) warn = w;
      }
    }
    if (warn) {
      showToast(
        warn.over ? `📛 تجاوزت سقف «${warn.label}»` : `⚠️ وصلت ${warn.pct}% من سقف «${warn.label}»`,
        "warning"
      );
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
        <Sparkles size={15} /> وصلتك {rows.length} معاملة — علّم اللي تبي تضيفه. المكرّر مستبعَد تلقائياً.
      </div>

      <div className="max-h-[52vh] overflow-y-auto space-y-2 pr-0.5">
        {rows.map((r) => {
          const info = getCategoryInfo(categories, r.catId);
          return (
            <div
              key={r.key}
              className={cn(
                "rounded-xl p-2.5 space-y-2 transition-opacity",
                r.included ? "bg-gray-50" : "bg-gray-50/50 opacity-55"
              )}
              style={{ borderRight: `3px solid ${info.color}` }}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleInclude(r.key)}
                  aria-label={r.included ? "استبعاد" : "تضمين"}
                  className={cn(
                    "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                    r.included ? "bg-finance border-finance text-white" : "bg-white border-gray-300 text-transparent"
                  )}
                >
                  <Check size={13} strokeWidth={3} />
                </button>
                <span className="text-lg shrink-0">{info.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-gray-700 truncate">{r.note || "مصروف"}</span>
                    {r.dup && (
                      <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-600 bg-amber-100 rounded-full px-1.5 py-0.5 shrink-0">
                        <Copy size={9} /> مكرّر؟
                      </span>
                    )}
                    {r.learned && (
                      <span className="flex items-center gap-0.5 text-[9px] font-bold text-finance bg-finance/10 rounded-full px-1.5 py-0.5 shrink-0">
                        <BrainCircuit size={9} /> متعلّم
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400">{r.date}</div>
                </div>
                <span className="text-sm font-bold text-red-500 shrink-0">-{formatAmount(r.amount)}</span>
              </div>
              {addingFor === r.key ? (
                <NewCategoryInline
                  categories={categories}
                  onCancel={() => setAddingFor(null)}
                  onCreate={(def) => {
                    addCategory(def);
                    setCat(r.key, def.id);
                    setAddingFor(null);
                  }}
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 min-w-0">
                    <CategorySelect categories={categories} value={r.catId} onChange={(id) => setCat(r.key, id)} />
                  </div>
                  <button
                    onClick={() => setAddingFor(r.key)}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-finance bg-finance/10 rounded-lg px-2 py-2 press"
                    aria-label="إضافة قسم جديد"
                    title="أضف قسماً جديداً"
                  >
                    <Plus size={13} /> قسم
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={handleAdd} disabled={!chosen.length} className="flex-1 bg-finance hover:bg-finance/90 disabled:opacity-40">
          {chosen.length ? `أضف ${chosen.length} معاملة ✓` : "لا شيء محدّد"}
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

// A few warm-palette icons/colors so a category made on the fly still looks
// at home; it can be fully re-styled later from «تصنيفاتي».
const QUICK_ICONS = ["🏷️", "🧺", "✨", "🍽️", "☕", "🚗", "🏠", "💊", "🎁", "📌"];
const QUICK_COLORS = ["#c1663f", "#c9852a", "#3d9640", "#1f7a6c", "#8a6fb0", "#c94f6d"];

function firstGrapheme(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const s of seg.segment(trimmed)) return s.segment;
  }
  return [...trimmed][0] ?? "";
}

// Inline "add a category" form shown right on a bank row, so a message that
// fits nothing existing can get its own section without leaving the review.
// You can make it a standalone main category, or nest it under a section that
// takes sub-categories (أساسيات/كماليات) — a sub inherits its parent's color.
function NewCategoryInline({
  categories,
  onCreate,
  onCancel,
}: {
  categories: FinanceCategoryDef[];
  onCreate: (def: FinanceCategoryDef) => void;
  onCancel: () => void;
}) {
  const subTargets = categories.filter((c) => !c.parentId && c.allowSubs);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(QUICK_ICONS[0]);
  const [parent, setParent] = useState(""); // "" = standalone main
  const [color, setColor] = useState(QUICK_COLORS[0]);

  function submit() {
    const label = name.trim();
    if (!label) return;
    const parentMain = parent ? categories.find((c) => c.id === parent) : null;
    onCreate({
      id: uid(),
      label,
      icon,
      color: parentMain ? parentMain.color : color,
      parentId: parent || undefined,
    });
  }

  return (
    <div className="rounded-xl bg-white border border-finance/30 p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 shrink-0 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-base">
          {icon}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="اسم القسم الجديد"
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-finance/40"
          autoFocus
        />
        <button onClick={onCancel} className="p-1 text-gray-300 hover:text-red-400 shrink-0" aria-label="إلغاء">
          <X size={15} />
        </button>
      </div>

      <div className="flex gap-1 flex-wrap items-center">
        {QUICK_ICONS.map((ic) => (
          <button
            key={ic}
            onClick={() => setIcon(ic)}
            className={cn("text-sm p-1 rounded-lg", icon === ic ? "bg-finance/10 ring-1 ring-finance" : "hover:bg-gray-100")}
          >
            {ic}
          </button>
        ))}
        <input
          value=""
          onChange={(e) => {
            const emoji = firstGrapheme(e.target.value);
            if (emoji) setIcon(emoji);
          }}
          placeholder="إيموجي"
          className="w-16 text-[11px] border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-finance/40"
          aria-label="إيموجي مخصص"
        />
      </div>

      {subTargets.length > 0 && (
        <select
          value={parent}
          onChange={(e) => setParent(e.target.value)}
          className="w-full text-[11px] bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-finance/40"
          aria-label="مكان القسم"
        >
          <option value="">قسم رئيسي مستقل</option>
          {subTargets.map((t) => (
            <option key={t.id} value={t.id}>تحت {t.icon} {t.label}</option>
          ))}
        </select>
      )}

      {!parent && (
        <div className="flex gap-1.5 flex-wrap">
          {QUICK_COLORS.map((c, i) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={cn("w-5 h-5 rounded-full", color === c ? "ring-2 ring-offset-1 ring-gray-400" : "")}
              style={{ backgroundColor: c }}
              aria-label={`اللون ${i + 1}`}
              aria-pressed={color === c}
            />
          ))}
        </div>
      )}

      <button
        onClick={submit}
        disabled={!name.trim()}
        className="w-full flex items-center justify-center gap-1 text-xs font-bold text-white bg-finance rounded-lg py-2 press disabled:opacity-40"
      >
        <Plus size={13} /> أضف القسم وصنّف عليه
      </button>
    </div>
  );
}
