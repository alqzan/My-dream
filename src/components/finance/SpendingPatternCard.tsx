"use client";
import { useMemo } from "react";
import type { Transaction, FinanceCategoryDef } from "@/lib/types";
import { formatAmount, getMainCategory } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const ESS = "cat-essentials";
const LUX = "cat-luxuries";

// Turn a messy transaction note (often bank-SMS text like "شراء إنترنت بـ22 SR"
// or "مبلغ:15 SAR") into just the merchant/place name for display. Strips
// amounts, currency tokens, and common transaction verbs/prepositions.
const NOTE_JUNK = new Set([
  "شراء", "خصم", "سحب", "دفع", "مبلغ", "purchase", "ب", "بـ", "لدى", "من", "لـ", "في",
  "at", "@", "sr", "sar", "ريال", "sar.",
]);
function cleanMerchant(note: string): string {
  const s = (note || "").trim();
  if (!s) return "غير محدّد";
  const cleaned = s
    .replace(/ـ/g, "") // tatweel (ـ) that glues prefixes to numbers
    .replace(/ر\.?\s?س/g, " ")
    .replace(/[0-9٠-٩][0-9٠-٩.,]*/g, " ") // amounts (latin + arabic digits)
    .replace(/[:؛;،.\-_/]+/g, " ");
  const tokens = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !NOTE_JUNK.has(w.toLowerCase()));
  return tokens.join(" ").trim() || "غير محدّد";
}

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

// Essentials vs luxuries at a glance: how much of this month's lifestyle spend
// went to each, how the luxuries share moved vs last month, and the top places
// the luxuries went.
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

    // Top luxury merchants this month, grouped by cleaned merchant name.
    const byMerchant = new Map<string, number>();
    for (const t of month) {
      if (getMainCategory(categories, t.category).id !== LUX) continue;
      const label = cleanMerchant(t.note ?? "");
      byMerchant.set(label, (byMerchant.get(label) ?? 0) + t.amount);
    }
    const topLux = [...byMerchant.entries()]
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    return { ess: now.ess, lux: now.lux, total, essPct, luxPct, luxDelta, topLux };
  }, [transactions, categories, monthFilter]);

  if (!essDef && !luxDef) return null;

  const essColor = essDef?.color ?? "#e07b39";
  const luxColor = luxDef?.color ?? "#9b6fcd";

  if (view.total === 0) {
    return (
      <div className="text-center py-3">
        <p className="text-sm font-bold text-gray-800 mb-1">نمط الصرف</p>
        <p className="text-xs text-gray-400">ما فيه صرف على الأساسيات أو الكماليات هذا الشهر بعد.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-800">نمط الصرف هذا الشهر</span>
        <span className="text-[11px] text-gray-400">الأساسي مقابل الكمالي</span>
      </div>

      {/* Split bar */}
      <div className="h-3 rounded-full overflow-hidden flex bg-gray-100">
        <div className="h-full transition-all duration-500" style={{ width: `${view.essPct}%`, backgroundColor: essColor }} />
        <div className="h-full transition-all duration-500" style={{ width: `${view.luxPct}%`, backgroundColor: luxColor }} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-2.5" style={{ backgroundColor: essColor + "14" }}>
          <div className="text-[11px] text-gray-500">{essDef?.icon ?? "🧺"} {essDef?.label ?? "أساسيات"}</div>
          <div className="text-sm font-bold text-gray-800">{formatAmount(view.ess)} <span className="text-[10px] font-normal text-gray-400">ر.س</span></div>
          <div className="text-[11px] font-bold" style={{ color: essColor }}>{view.essPct}%</div>
        </div>
        <div className="rounded-xl p-2.5" style={{ backgroundColor: luxColor + "14" }}>
          <div className="text-[11px] text-gray-500">{luxDef?.icon ?? "✨"} {luxDef?.label ?? "كماليات"}</div>
          <div className="text-sm font-bold text-gray-800">{formatAmount(view.lux)} <span className="text-[10px] font-normal text-gray-400">ر.س</span></div>
          <div className="text-[11px] font-bold" style={{ color: luxColor }}>{view.luxPct}%</div>
        </div>
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

      {view.topLux.length > 0 && (
        <div className="pt-1 border-t border-gray-100 dark:border-[#3a2e1e]">
          <div className="text-[11px] font-semibold text-gray-500 mb-1.5">أكثر الكماليات هذا الشهر</div>
          <div className="space-y-1">
            {view.topLux.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 truncate">{i + 1}. {m.label}</span>
                <span className="font-bold text-gray-700 shrink-0">{formatAmount(m.amount)} ر.س</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
