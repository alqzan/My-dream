"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { uid, today, formatAmount, formatDateShort, reserveBalance, reserveSpent, cn } from "@/lib/utils";
import type { ReserveFund } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Plus, Trash2, ChevronDown, PiggyBank, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";

const ICONS = ["🏠", "✈️", "🎁", "🚗", "💍", "🎓", "🛠️", "🏥", "🐪", "⛱️", "📦", "💰"];
const COLORS = ["#1f7a6c", "#3d9640", "#c9852a", "#8a6fb0", "#4a9fbd", "#c1663f"];

// First full emoji of whatever the user types — any emoji is welcome.
function firstGrapheme(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const s of seg.segment(trimmed)) return s.segment;
  }
  return [...trimmed][0] ?? "";
}

// الاحتياطي: labeled envelopes of money set aside for a purpose (الإيجار،
// سفرة الصيف...). Green while funded, red when drained/overdrawn. Expenses
// can be split onto a fund from TransactionForm (e.g. هدية 50/50 بين
// اليومية والاحتياطي).
export function ReserveFunds() {
  const { reserves, transactions, addReserve, deleteReserve, addReserveDeposit } = useAppStore();
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiggyBank size={16} className="text-prayer" />
          <span className="text-sm font-semibold text-gray-700">الاحتياطي</span>
          {reserves.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-prayer/10 text-prayer">
              {formatAmount(reserves.reduce((s, f) => s + reserveBalance(f, transactions), 0))} ر.س
            </span>
          )}
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="text-prayer hover:text-prayer/80 p-1.5 press"
          aria-label="إضافة احتياطي"
        >
          <Plus size={16} />
        </button>
      </div>

      {adding && <AddFundForm onDone={() => setAdding(false)} onAdd={addReserve} onDeposit={addReserveDeposit} />}

      {reserves.length === 0 && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="w-full py-5 rounded-xl border-2 border-dashed border-prayer/30 text-prayer text-sm font-medium hover:bg-prayer/5 press"
        >
          🪺 خصّص مبلغاً لهدف — إيجار، سفرة، هدايا...
        </button>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {reserves.map((fund) => (
          <FundCard
            key={fund.id}
            fund={fund}
            expanded={expanded === fund.id}
            onToggle={() => setExpanded(expanded === fund.id ? null : fund.id)}
          />
        ))}
      </div>
    </div>
  );
}

function AddFundForm({
  onDone,
  onAdd,
  onDeposit,
}: {
  onDone: () => void;
  onAdd: (f: ReserveFund) => void;
  onDeposit: (fundId: string, d: { id: string; date: string; amount: number; note?: string }) => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏠");
  const [color, setColor] = useState(COLORS[0]);
  const [target, setTarget] = useState("");
  const [initial, setInitial] = useState("");

  function handleAdd() {
    if (!name.trim()) return;
    const fund: ReserveFund = {
      id: uid(),
      name: name.trim(),
      icon,
      color,
      target: parseFloat(target) > 0 ? parseFloat(target) : undefined,
      deposits: [],
      createdAt: today(),
    };
    onAdd(fund);
    const first = parseFloat(initial);
    if (first > 0) {
      onDeposit(fund.id, { id: uid(), date: today(), amount: first, note: "رصيد افتتاحي" });
    }
    onDone();
  }

  return (
    <div className="bg-gray-50 rounded-xl p-3 space-y-2.5 animate-fade-up">
      <div className="flex items-center gap-2">
        <span className="w-11 h-11 shrink-0 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-2xl">
          {icon}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مخصص لـ... (الإيجار، سفرة الصيف)"
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-prayer/40"
        />
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {ICONS.map((ic) => (
          <button
            key={ic}
            onClick={() => setIcon(ic)}
            className={`text-lg p-1 rounded-lg press ${icon === ic ? "bg-prayer/10 ring-1 ring-prayer" : "hover:bg-gray-200"}`}
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
          placeholder="أو أي إيموجي"
          className="w-24 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-prayer/40"
          aria-label="إيموجي مخصص"
        />
      </div>
      <div className="flex gap-1.5 items-center">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={cn("w-6 h-6 rounded-full press transition-transform", color === c && "scale-110 ring-2 ring-offset-1")}
            style={{ backgroundColor: c, ["--tw-ring-color" as string]: c }}
            aria-label={c}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">الهدف (اختياري)</label>
          <input
            type="number" value={target} onChange={(e) => setTarget(e.target.value)}
            placeholder="مثلاً 30000" inputMode="decimal"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-prayer/40"
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">رصيد افتتاحي (اختياري)</label>
          <input
            type="number" value={initial} onChange={(e) => setInitial(e.target.value)}
            placeholder="مثلاً 5000" inputMode="decimal"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-prayer/40"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleAdd} className="flex-1 bg-prayer hover:bg-prayer/90">إضافة</Button>
        <Button size="sm" variant="secondary" onClick={onDone}>إلغاء</Button>
      </div>
    </div>
  );
}

function FundCard({ fund, expanded, onToggle }: { fund: ReserveFund; expanded: boolean; onToggle: () => void }) {
  const { transactions, deleteReserve, addReserveDeposit } = useAppStore();
  const [amount, setAmount] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const balance = reserveBalance(fund, transactions);
  const spent = reserveSpent(fund, transactions);
  const deposited = fund.deposits.reduce((s, d) => s + d.amount, 0);
  const healthy = balance > 0;
  const pct = fund.target ? Math.min(100, Math.round((balance / fund.target) * 100)) : null;

  // The transactions that took a share of this envelope, newest first.
  const charges = transactions
    .filter((t) => t.reserveSplits?.some((sp) => sp.fundId === fund.id))
    .slice(0, 5);

  function move(dir: 1 | -1) {
    let parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;
    // A withdrawal can't take out more than the envelope holds.
    if (dir === -1) {
      if (balance <= 0) return;
      parsed = Math.min(parsed, balance);
    }
    addReserveDeposit(fund.id, {
      id: uid(),
      date: today(),
      amount: dir * parsed,
      note: dir === 1 ? "تعبئة" : "سحب يدوي",
    });
    setAmount("");
  }

  return (
    <div
      className={cn(
        "rounded-2xl border p-3 transition-all",
        healthy
          ? "border-green-200 bg-gradient-to-br from-green-50/80 to-emerald-50/40 dark:from-green-500/10 dark:to-transparent dark:border-green-500/20"
          : "border-red-200 bg-gradient-to-br from-red-50/80 to-rose-50/40 dark:from-red-500/10 dark:to-transparent dark:border-red-500/20"
      )}
    >
      <button onClick={onToggle} className="w-full text-right">
        <div className="flex items-center gap-2.5">
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{ backgroundColor: fund.color + "1a" }}
          >
            {fund.icon}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-gray-800 truncate">{fund.name}</span>
              <span
                className={cn(
                  "text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                  healthy ? "bg-green-100 text-green-700 dark:bg-green-500/20" : "bg-red-100 text-red-600 dark:bg-red-500/20"
                )}
              >
                {healthy ? "متوفر" : "مستنفد"}
              </span>
            </div>
            <div className={cn("text-lg font-bold tabular-nums mt-0.5", healthy ? "text-green-700 dark:text-green-400" : "text-red-500")}>
              {formatAmount(balance)} <span className="text-[10px] font-normal text-gray-400">ر.س</span>
            </div>
          </div>
          <ChevronDown size={15} className={cn("text-gray-400 transition-transform shrink-0", expanded && "rotate-180")} />
        </div>

        {pct !== null && (
          <div className="mt-2">
            <div className="h-1.5 bg-white/70 dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.max(0, pct)}%`, backgroundColor: healthy ? fund.color : "#e05555" }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-gray-400 mt-1">
              <span>{pct}% من الهدف</span>
              <span>{formatAmount(fund.target!)} ر.س</span>
            </div>
          </div>
        )}
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2.5 animate-fade-up">
          <div className="flex gap-1.5">
            <input
              type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="المبلغ" inputMode="decimal"
              className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-prayer/40"
            />
            <button
              onClick={() => move(1)}
              className="flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-100 dark:bg-green-500/20 rounded-lg px-2.5 press shrink-0"
            >
              <ArrowDownToLine size={12} /> تعبئة
            </button>
            <button
              onClick={() => move(-1)}
              className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-500/20 rounded-lg px-2.5 press shrink-0"
            >
              <ArrowUpFromLine size={12} /> سحب
            </button>
          </div>

          <div className="flex justify-between text-[10px] text-gray-400">
            <span>الإيداعات: {formatAmount(deposited)} ر.س</span>
            <span>المصروف منه: {formatAmount(spent)} ر.س</span>
          </div>

          {charges.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-gray-500">آخر المصاريف من هذا الاحتياطي</div>
              {charges.map((t) => {
                const share = t.reserveSplits!.find((sp) => sp.fundId === fund.id)!;
                return (
                  <div key={t.id} className="flex items-center justify-between text-[11px] text-gray-500 bg-white/60 dark:bg-white/5 rounded-lg px-2 py-1">
                    <span className="truncate">{t.note || "مصروف"} · {formatDateShort(t.date)}</span>
                    <span className="font-bold shrink-0 tabular-nums">
                      {formatAmount((t.amount * share.pct) / 100)} ر.س
                      <span className="font-normal text-gray-400"> ({share.pct}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {confirmDelete ? (
            <div className="flex items-center justify-between gap-2 bg-red-50 dark:bg-red-500/10 rounded-lg px-2.5 py-2">
              <span className="text-[11px] text-red-600">حذف «{fund.name}»؟ المصاريف المرتبطة تنتقل لليومية.</span>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => deleteReserve(fund.id)} className="text-[11px] font-bold text-white bg-red-500 rounded-lg px-2 py-1 press">حذف</button>
                <button onClick={() => setConfirmDelete(false)} className="text-[11px] text-gray-500 bg-gray-100 rounded-lg px-2 py-1 press">تراجع</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-400 press"
            >
              <Trash2 size={12} /> حذف الاحتياطي
            </button>
          )}
        </div>
      )}
    </div>
  );
}
