"use client";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { uid, today, formatAmount, formatDateShort, reserveBalance, reserveSpent, cn } from "@/lib/utils";
import type { ReserveFund, Transaction } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { NumberInput } from "@/components/ui/NumberInput";
import { Plus, Trash2, PiggyBank, ArrowDownToLine, ArrowUpFromLine, X } from "lucide-react";

const ICONS = ["🏠", "✈️", "🎁", "🚗", "💍", "🎓", "🛠️", "🏥", "🐪", "⛱️", "📦", "💰"];
const COLORS = ["#1f7a6c", "#3d9640", "#c9852a", "#8a6fb0", "#4a9fbd", "#c1663f"];

// حدّ ذهبي رفيع كأخوات الأداة (PrayerOrbit/مدار السنة)؛ الرصيد الصحّي أخضر ماليّ،
// والمستنفد أحمر — بلا فيروزي في المصاريف.
const GOLD = "#c9852a";
const GOLD_TIP = "#e8b15a";
const DRAINED = "#e05555";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

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

// الاحتياطي: قافلةٌ من الأهداف تسير على خيطٍ ذهبي — كل هدف قُرصٌ دائري يمتلئ
// بنسبة (الرصيد ÷ الهدف)، وأيقونته راكبةٌ على مدار القرص نحو غايتها في الأعلى.
// أخضرُ ما دام ممتلئاً، أحمرُ حين ينفد/يسلب. اضغط الهدف لتفتح تعبئته/سحبه في
// مكانه (نفس منطق الإيداع/السحب القديم — بلا حساب جديد).
export function ReserveFunds() {
  const { reserves, transactions, addReserve, deleteReserve, addReserveDeposit } = useAppStore();
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const openFund = reserves.find((f) => f.id === expanded) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PiggyBank size={16} className="text-finance" />
          <span className="text-sm font-semibold text-gray-700">الاحتياطي</span>
          {reserves.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-finance/10 text-finance">
              {formatAmount(reserves.reduce((s, f) => s + reserveBalance(f, transactions), 0))} ر.س
            </span>
          )}
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="text-finance hover:text-finance/80 p-1.5 press"
          aria-label="إضافة احتياطي"
        >
          <Plus size={16} />
        </button>
      </div>

      {adding && <AddFundForm onDone={() => setAdding(false)} onAdd={addReserve} onDeposit={addReserveDeposit} />}

      {reserves.length === 0 && !adding && (
        <button
          onClick={() => setAdding(true)}
          className="w-full py-5 rounded-xl border-2 border-dashed border-finance/30 text-finance text-sm font-medium hover:bg-finance/5 press"
        >
          🪺 خصّص مبلغاً لهدف — إيجار، سفرة، هدايا...
        </button>
      )}

      {reserves.length > 0 && (
        <div className="overflow-x-auto scrollbar-none -mx-1 px-1 pt-1">
          <div className="relative flex gap-1.5 w-max min-w-full">
            {/* خيط القافلة الذهبي يمرّ خلف الأقراص */}
            <div
              className="pointer-events-none absolute inset-x-2 h-px bg-gradient-to-l from-transparent via-[#c9852a]/45 to-transparent"
              style={{ top: Math.round(DIAL * 0.72) }}
            />
            {reserves.map((fund) => (
              <FundDial
                key={fund.id}
                fund={fund}
                transactions={transactions}
                active={expanded === fund.id}
                onTap={() => setExpanded(expanded === fund.id ? null : fund.id)}
              />
            ))}
          </div>
        </div>
      )}

      {openFund && <FundDetail key={openFund.id} fund={openFund} onClose={() => setExpanded(null)} />}
    </div>
  );
}

// ————————————————————————————————————————————————————————————————
// قرص الهدف: أداةٌ صغيرة بحدٍّ ذهبي، تمتلئ نحو الهدف بلون صحّي أخضر/أحمر.
const DIAL = 76;
const STROKE = 5;
const R = (DIAL - STROKE) / 2 - 2;
const CIRC = 2 * Math.PI * R;

function FundDial({
  fund,
  transactions,
  active,
  onTap,
}: {
  fund: ReserveFund;
  transactions: Transaction[];
  active: boolean;
  onTap: () => void;
}) {
  const balance = reserveBalance(fund, transactions);
  const healthy = balance > 0;
  const pct = fund.target ? Math.min(100, Math.round((balance / fund.target) * 100)) : null;
  const hasTarget = pct !== null;
  const targetFrac = hasTarget ? Math.max(0, pct!) : 0;

  const [anim, setAnim] = useState(() => (prefersReducedMotion() ? targetFrac : 0));
  useEffect(() => {
    if (prefersReducedMotion()) {
      setAnim(targetFrac);
      return;
    }
    const t = requestAnimationFrame(() => setAnim(targetFrac));
    return () => cancelAnimationFrame(t);
  }, [targetFrac]);

  const on = (CIRC * anim) / 100;
  const angle = (anim / 100) * 360 - 90; // يبدأ من الأعلى (الغاية) ويطوف
  const dotX = DIAL / 2 + R * Math.cos((angle * Math.PI) / 180);
  const dotY = DIAL / 2 + R * Math.sin((angle * Math.PI) / 180);
  const done = hasTarget && pct! >= 100;

  return (
    <button
      onClick={onTap}
      className={cn(
        "relative z-10 shrink-0 w-[82px] flex flex-col items-center gap-1 rounded-2xl px-1 py-1.5 press transition-colors",
        active && "bg-[#c9852a]/[0.06] ring-1 ring-[#c9852a]/30"
      )}
      aria-pressed={active}
      aria-label={`${fund.name} — ${formatAmount(balance)} ريال${hasTarget ? ` · ${pct}٪ من الهدف` : ""}`}
      title={fund.name}
    >
      <div className="relative" style={{ width: DIAL, height: DIAL }}>
        <svg width={DIAL} height={DIAL} className="overflow-visible">
          <defs>
            <linearGradient id="reserveGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5cb85f" />
              <stop offset="100%" stopColor="#2f7a33" />
            </linearGradient>
          </defs>
          <g style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}>
            {/* مسار القرص */}
            <circle
              cx={DIAL / 2}
              cy={DIAL / 2}
              r={R}
              fill="none"
              stroke="currentColor"
              className="text-gray-200 dark:text-[#3a2e1e]"
              strokeWidth={STROKE}
            />
            {!healthy ? (
              // منفدٌ/سالب → حلقة حمراء كاملة واضحة
              <circle
                cx={DIAL / 2}
                cy={DIAL / 2}
                r={R}
                fill="none"
                stroke={DRAINED}
                strokeOpacity={0.75}
                strokeWidth={STROKE}
              />
            ) : hasTarget ? (
              <circle
                cx={DIAL / 2}
                cy={DIAL / 2}
                r={R}
                fill="none"
                stroke="url(#reserveGreen)"
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${on} ${CIRC - on}`}
                style={prefersReducedMotion() ? undefined : { transition: "stroke-dasharray 1.2s cubic-bezier(0.16,1,0.3,1)" }}
              />
            ) : (
              // بلا هدف → قرصٌ محايد ممتلئ بحدٍّ ذهبي رفيع
              <circle
                cx={DIAL / 2}
                cy={DIAL / 2}
                r={R}
                fill="none"
                stroke={GOLD}
                strokeOpacity={0.4}
                strokeWidth={STROKE}
              />
            )}
          </g>
          {/* راكب المدار عند رأس التقدّم */}
          {healthy && hasTarget && anim > 0 && (
            <circle
              cx={dotX}
              cy={dotY}
              r={3}
              fill={done ? "#2f7a33" : GOLD_TIP}
              stroke="#fff"
              strokeWidth={1.2}
              style={prefersReducedMotion() ? undefined : { transition: "cx 1.2s cubic-bezier(0.16,1,0.3,1), cy 1.2s cubic-bezier(0.16,1,0.3,1)" }}
            />
          )}
          {/* علامة الغاية في الأعلى */}
          {healthy && hasTarget && (
            <circle cx={DIAL / 2} cy={2} r={1.1} fill={GOLD} opacity={0.75} />
          )}
        </svg>
        <span
          className="absolute inset-0 m-auto w-9 h-9 rounded-full flex items-center justify-center text-xl"
          style={{ backgroundColor: fund.color + "1f" }}
        >
          {fund.icon}
        </span>
      </div>
      <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 truncate max-w-full leading-tight">
        {fund.name}
      </span>
      <span className={cn("text-[11px] font-bold tabular-nums leading-none", healthy ? "text-green-700 dark:text-green-400" : "text-red-500")}>
        {formatAmount(balance)}
      </span>
      <span
        className={cn(
          "text-[9px] leading-none",
          !healthy ? "text-red-500 font-semibold" : done ? "text-finance font-bold" : "text-gray-400"
        )}
      >
        {!healthy ? "مستنفد" : done ? "اكتمل ✓" : hasTarget ? `${pct}٪ من الهدف` : "متوفّر"}
      </span>
    </button>
  );
}

// ————————————————————————————————————————————————————————————————
// تفاصيل الهدف المفتوح — نفس نموذج التعبئة/السحب والحذف القديم بالحرف.
function FundDetail({ fund, onClose }: { fund: ReserveFund; onClose: () => void }) {
  const { transactions, deleteReserve, addReserveDeposit } = useAppStore();
  const [amount, setAmount] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const balance = reserveBalance(fund, transactions);
  const spent = reserveSpent(fund, transactions);
  const deposited = fund.deposits.reduce((s, d) => s + d.amount, 0);
  const healthy = balance > 0;

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
        "rounded-2xl border p-3 space-y-2.5 animate-fade-up",
        healthy
          ? "border-green-200 bg-gradient-to-br from-green-50/80 to-emerald-50/40 dark:from-green-500/10 dark:to-transparent dark:border-green-500/20"
          : "border-red-200 bg-gradient-to-br from-red-50/80 to-rose-50/40 dark:from-red-500/10 dark:to-transparent dark:border-red-500/20"
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: fund.color + "1a" }}
        >
          {fund.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{fund.name}</span>
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
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 press shrink-0" aria-label="إغلاق">
          <X size={16} />
        </button>
      </div>

      {fund.target ? (
        <div>
          <div className="h-1.5 bg-white/70 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.max(0, Math.min(100, Math.round((balance / fund.target!) * 100)))}%`,
                backgroundColor: healthy ? "#3d9640" : DRAINED,
              }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-gray-400 mt-1">
            <span>{Math.min(100, Math.round((balance / fund.target!) * 100))}% من الهدف</span>
            <span>{formatAmount(fund.target!)} ر.س</span>
          </div>
        </div>
      ) : null}

      <div className="flex gap-1.5">
        <NumberInput
          value={amount}
          onChange={setAmount}
          placeholder="المبلغ"
          inputMode="decimal"
          className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40"
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
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-finance/40"
        />
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {ICONS.map((ic) => (
          <button
            key={ic}
            onClick={() => setIcon(ic)}
            className={`text-lg p-1 rounded-lg press ${icon === ic ? "bg-finance/10 ring-1 ring-finance" : "hover:bg-gray-200"}`}
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
          className="w-24 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40"
          aria-label="إيموجي مخصص"
        />
      </div>
      <div className="flex gap-1.5 items-center">
        {COLORS.map((c, i) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={cn("w-6 h-6 rounded-full press transition-transform", color === c && "scale-110 ring-2 ring-offset-1")}
            style={{ backgroundColor: c, ["--tw-ring-color" as string]: c }}
            aria-label={`اللون ${i + 1}`}
            aria-pressed={color === c}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">الهدف (اختياري)</label>
          <NumberInput
            value={target} onChange={setTarget}
            placeholder="مثلاً 30000" inputMode="decimal"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-finance/40"
          />
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">رصيد افتتاحي (اختياري)</label>
          <NumberInput
            value={initial} onChange={setInitial}
            placeholder="مثلاً 5000" inputMode="decimal"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-finance/40"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleAdd} className="flex-1 bg-finance hover:bg-finance/90">إضافة</Button>
        <Button size="sm" variant="secondary" onClick={onDone}>إلغاء</Button>
      </div>
    </div>
  );
}
