"use client";
import { useEffect, useMemo, useState } from "react";
import type { Transaction, FinanceCategoryDef } from "@/lib/types";
import { formatAmount, getMainCategory, getCategoryInfo, buzz } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const ESS = "cat-essentials";
const LUX = "cat-luxuries";

// Finance identity palette for the instrument — green (أساسي) + gold (كمالي).
// No teal (teal belongs to prayer only). The category defs still supply the
// icons/labels; only the two-arc gauge is fixed to the section palette.
const ESS_COLOR = "#3d9640"; // finance green — the necessary spend
const LUX_COLOR = "#c9852a"; // brand gold — the discretionary spend
const GOLD_LINE = "#e8b15a"; // thin warm gold line-work (frame · needle · marks)

function sumEssLux(txs: Transaction[], categories: FinanceCategoryDef[]) {
  let ess = 0;
  let lux = 0;
  for (const t of txs) {
    const main = getMainCategory(categories, t.category).id;
    if (main === ESS) ess += t.amount;
    else if (main === LUX) lux += t.amount;
  }
  return { ess, lux };
}

function prevMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// ————————————————————————————————————————————————————————————————
// نمط الصرف: نصف قوسٍ (مقياس) يقسمه الأساسي (أخضر) والكمالي (ذهبي) بحسب
// المبلغين اللذين تحسبهما البطاقة أصلاً — بخطٍّ ذهبي رفيع وإبرة عند الفصل.
// اضغط نصفاً (أو بطاقته) لتكشف أعلى تصنيفاته أسفل المقياس.
const VB_W = 100;
const VB_H = 56;
const CX = 50;
const CY = 50;
const R = 38;
const STROKE = 11;

// t in [0,1] maps left→right across the top of the semicircle.
function ptOnArc(t: number) {
  const ang = Math.PI * (1 - t);
  return { x: CX + R * Math.cos(ang), y: CY - R * Math.sin(ang) };
}
function arcPath(t0: number, t1: number) {
  const a = ptOnArc(t0);
  const b = ptOnArc(t1);
  return `M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`;
}

// Essentials vs luxuries at a glance: a tappable half-donut gauge sized by the
// two amounts, the luxuries-share trend vs last month, and — inline on tap —
// the top categories the tapped group's money went to.
export function SpendingPatternCard({
  transactions,
  categories,
  monthFilter,
}: {
  transactions: Transaction[];
  categories: FinanceCategoryDef[];
  monthFilter: string;
}) {
  const essDef = categories.find((c) => c.id === ESS);
  const luxDef = categories.find((c) => c.id === LUX);

  const view = useMemo(() => {
    const month = transactions.filter((t) => t.date.startsWith(monthFilter));
    const prev = transactions.filter((t) => t.date.startsWith(prevMonthOf(monthFilter)));
    const now = sumEssLux(month, categories);
    const before = sumEssLux(prev, categories);
    const total = now.ess + now.lux;
    const essPct = total ? Math.round((now.ess / total) * 100) : 0;
    const luxPct = total ? 100 - essPct : 0;
    const prevTotal = before.ess + before.lux;
    const prevLuxPct = prevTotal ? Math.round((before.lux / prevTotal) * 100) : null;
    const luxDelta = prevLuxPct == null ? null : luxPct - prevLuxPct;

    // Top spend per group this month, grouped by its category (sub-category
    // when set, otherwise the main) — cleaner than merchant text. Same grouping
    // the card already used for luxuries, now computed for both halves.
    function topOf(mainId: string) {
      const byCat = new Map<string, { label: string; icon: string; amount: number }>();
      for (const t of month) {
        if (getMainCategory(categories, t.category).id !== mainId) continue;
        const info = getCategoryInfo(categories, t.category);
        const cur = byCat.get(info.id) ?? { label: info.label, icon: info.icon, amount: 0 };
        cur.amount += t.amount;
        byCat.set(info.id, cur);
      }
      return [...byCat.values()].sort((a, b) => b.amount - a.amount).slice(0, 3);
    }

    return {
      ess: now.ess,
      lux: now.lux,
      total,
      essPct,
      luxPct,
      luxDelta,
      topEss: topOf(ESS),
      topLux: topOf(LUX),
    };
  }, [transactions, categories, monthFilter]);

  // Which half is being inspected. Defaults to luxuries so the card opens with
  // the same "top luxuries" detail it always showed — tapping switches halves.
  const [sel, setSel] = useState<"ess" | "lux" | null>(null);

  const reduce = prefersReducedMotion();
  const [on, setOn] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const t = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(t);
  }, [reduce]);

  if (!essDef && !luxDef) return null;

  if (view.total === 0) {
    return (
      <div className="text-center py-3">
        <p className="text-sm font-bold text-gray-800 mb-1">نمط الصرف</p>
        <p className="text-xs text-gray-400">ما فيه صرف على الأساسيات أو الكماليات هذا الشهر بعد.</p>
      </div>
    );
  }

  // Geometry: essentials anchored on the RTL-leading (right) side, luxuries on
  // the left. The split needle sits where the two amounts meet.
  const essFrac = view.total ? view.ess / view.total : 0;
  const split = 1 - essFrac; // t of the essentials|luxuries boundary
  const luxLen = R * Math.PI * split; // arc length of each segment (for the draw-in)
  const essLen = R * Math.PI * essFrac;
  const luxMid = ptOnArc(split / 2);
  const essMid = ptOnArc(split + essFrac / 2);
  const needle = ptOnArc(split);
  const needleInner = { x: CX + (R - STROKE / 2 - 1.5) * Math.cos(Math.PI * (1 - split)), y: CY - (R - STROKE / 2 - 1.5) * Math.sin(Math.PI * (1 - split)) };
  const needleOuter = { x: CX + (R + STROKE / 2 + 1.5) * Math.cos(Math.PI * (1 - split)), y: CY - (R + STROKE / 2 + 1.5) * Math.sin(Math.PI * (1 - split)) };

  const drawStyle = (len: number): React.CSSProperties =>
    reduce
      ? {}
      : { strokeDasharray: `${len} ${len}`, strokeDashoffset: on ? 0 : len, transition: "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)" };

  function pick(group: "ess" | "lux") {
    buzz();
    setSel((cur) => (cur === group ? null : group));
  }

  // The detail shown below defaults to luxuries (card's original behaviour).
  const shown = sel ?? "lux";
  const shownColor = shown === "ess" ? ESS_COLOR : LUX_COLOR;
  const shownList = shown === "ess" ? view.topEss : view.topLux;
  const shownLabel = shown === "ess" ? essDef?.label ?? "الأساسيات" : luxDef?.label ?? "الكماليات";

  const essActive = sel === "ess";
  const luxActive = sel === "lux";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-800">نمط الصرف هذا الشهر</span>
        <span className="text-[11px] text-gray-400">اضغط نصفاً 👆</span>
      </div>

      {/* Tappable half-donut gauge — two arcs sized by the two amounts */}
      <div className="relative w-full max-w-[280px] mx-auto" style={{ aspectRatio: `${VB_W} / ${VB_H}` }}>
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="absolute inset-0 w-full h-full overflow-visible">
          {/* faint full track */}
          <path d={arcPath(0, 1)} fill="none" stroke="currentColor" className="text-gray-200 dark:text-[#3a2e1e]" strokeWidth={STROKE} strokeLinecap="round" />

          {/* luxuries (left, gold) */}
          <path
            d={arcPath(0, split)}
            fill="none"
            stroke={LUX_COLOR}
            strokeWidth={STROKE}
            strokeLinecap="butt"
            style={{ ...drawStyle(luxLen), opacity: essActive ? 0.32 : 1, transition: `${reduce ? "" : "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1), "}opacity 0.35s ease` }}
          />
          {/* essentials (right, green) */}
          <path
            d={arcPath(split, 1)}
            fill="none"
            stroke={ESS_COLOR}
            strokeWidth={STROKE}
            strokeLinecap="butt"
            style={{ ...drawStyle(essLen), opacity: luxActive ? 0.32 : 1, transition: `${reduce ? "" : "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1), "}opacity 0.35s ease` }}
          />

          {/* thin gold frame line hugging the arc + split needle */}
          <path d={arcPath(0, 1)} fill="none" stroke={GOLD_LINE} strokeWidth={0.7} strokeOpacity={0.55} strokeLinecap="round" />
          <line x1={needleInner.x} y1={needleInner.y} x2={needleOuter.x} y2={needleOuter.y} stroke={GOLD_LINE} strokeWidth={1.4} strokeLinecap="round" />
          <circle cx={needle.x} cy={needle.y} r={1.9} fill="#fff" stroke={GOLD_LINE} strokeWidth={1.1} />

          {/* selection outline on the active half */}
          {essActive && <path d={arcPath(split, 1)} fill="none" stroke={GOLD_LINE} strokeWidth={STROKE + 2.4} strokeLinecap="butt" strokeOpacity={0.28} />}
          {luxActive && <path d={arcPath(0, split)} fill="none" stroke={GOLD_LINE} strokeWidth={STROKE + 2.4} strokeLinecap="butt" strokeOpacity={0.28} />}

          {/* segment icons */}
          {essFrac > 0.13 && <text x={essMid.x} y={essMid.y} textAnchor="middle" dominantBaseline="central" fontSize={6.5}>{essDef?.icon ?? "🧺"}</text>}
          {split > 0.13 && <text x={luxMid.x} y={luxMid.y} textAnchor="middle" dominantBaseline="central" fontSize={6.5}>{luxDef?.icon ?? "✨"}</text>}

          {/* generous transparent hit areas over each half */}
          <path d={arcPath(split, 1)} fill="none" stroke="transparent" strokeWidth={STROKE + 12} className="cursor-pointer" onClick={() => pick("ess")} />
          <path d={arcPath(0, split)} fill="none" stroke="transparent" strokeWidth={STROKE + 12} className="cursor-pointer" onClick={() => pick("lux")} />
        </svg>

        {/* center read-out */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end pb-0.5 pointer-events-none">
          {sel ? (
            <>
              <span className="text-lg font-black leading-none tabular-nums" style={{ color: shownColor }}>
                {shown === "ess" ? view.essPct : view.luxPct}%
              </span>
              <span className="text-[10px] text-gray-500 mt-0.5">{shownLabel} · {formatAmount(shown === "ess" ? view.ess : view.lux)} ر.س</span>
            </>
          ) : (
            <>
              <span className="text-lg font-black leading-none tabular-nums text-gray-800">{formatAmount(view.total)}</span>
              <span className="text-[10px] text-gray-400 mt-0.5">إجمالي أساسي وكمالي · ر.س</span>
            </>
          )}
        </div>
      </div>

      {/* Two tiles double as big tap targets for the halves */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => pick("ess")}
          className={`text-right rounded-xl p-2.5 transition-all press ${essActive ? "ring-2" : "ring-1 ring-transparent"}`}
          style={{ backgroundColor: ESS_COLOR + "14", boxShadow: essActive ? `inset 0 0 0 1.5px ${ESS_COLOR}` : undefined }}
        >
          <div className="text-[11px] text-gray-500">{essDef?.icon ?? "🧺"} {essDef?.label ?? "أساسيات"}</div>
          <div className="text-sm font-bold text-gray-800">{formatAmount(view.ess)} <span className="text-[10px] font-normal text-gray-400">ر.س</span></div>
          <div className="text-[11px] font-bold" style={{ color: ESS_COLOR }}>{view.essPct}%</div>
        </button>
        <button
          type="button"
          onClick={() => pick("lux")}
          className={`text-right rounded-xl p-2.5 transition-all press ${luxActive ? "ring-2" : "ring-1 ring-transparent"}`}
          style={{ backgroundColor: LUX_COLOR + "14", boxShadow: luxActive ? `inset 0 0 0 1.5px ${LUX_COLOR}` : undefined }}
        >
          <div className="text-[11px] text-gray-500">{luxDef?.icon ?? "✨"} {luxDef?.label ?? "كماليات"}</div>
          <div className="text-sm font-bold text-gray-800">{formatAmount(view.lux)} <span className="text-[10px] font-normal text-gray-400">ر.س</span></div>
          <div className="text-[11px] font-bold" style={{ color: LUX_COLOR }}>{view.luxPct}%</div>
        </button>
      </div>

      {view.luxDelta != null && view.luxDelta !== 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          {view.luxDelta > 0 ? (
            <TrendingUp size={13} className="text-red-500" />
          ) : (
            <TrendingDown size={13} className="text-finance" />
          )}
          نسبة الكماليات {view.luxDelta > 0 ? "ارتفعت" : "انخفضت"} <span className="font-bold">{Math.abs(view.luxDelta)}٪</span> عن الشهر الماضي
        </div>
      )}
      {view.luxDelta === 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
          <Minus size={13} /> نسبة الكماليات ثابتة عن الشهر الماضي
        </div>
      )}

      {shownList.length > 0 && (
        <div className="pt-1 border-t border-gray-100 dark:border-[#3a2e1e]">
          <div className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: shownColor }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: shownColor }} />
            أكثر تصنيفات {shownLabel} هذا الشهر
          </div>
          <div className="space-y-1">
            {shownList.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 truncate">{i + 1}. {m.icon} {m.label}</span>
                <span className="font-bold text-gray-700 shrink-0">{formatAmount(m.amount)} ر.س</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
