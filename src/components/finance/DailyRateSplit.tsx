"use client";
import { useAppStore } from "@/lib/store";
import { formatAmount } from "@/lib/utils";
import { cycleLength } from "@/lib/budgetCycle";
import { fundingPerDay } from "@/lib/fundPlan";
import { today } from "@/lib/utils";

// ===================== قسمةُ يومك =====================
// «ليش بدلي نزل من ١٠٠ إلى ٨٣؟» — سؤالٌ يستحقّ صورةً لا فقرة. شريطٌ واحد يُري
// اليوم مقسوماً: ما هو لك، وما هو محجوزٌ لمظاريفك — كلُّ مظروفٍ بلونه هو نفسه
// الذي تراه في قافلة المظاريف، فتربط الشاشتان بلا شرح. لا يظهر إلّا حين يكون
// ثمّة تمويلٌ من الراتب فعلاً (وإلّا فالبدل كاملٌ ولا قسمة).
export function DailyRateSplit({ amount, rate }: { amount: number; rate: number }) {
  const reserves = useAppStore((s) => s.reserves);
  const salaryDay = useAppStore((s) => s.salaryDay);
  const drip = Math.round((amount - rate) * 100) / 100;
  if (drip <= 0 || amount <= 0) return null;

  const len = cycleLength(salaryDay ?? 27, today());
  const funded = reserves
    .filter((f) => f.funding && f.funding.source === "salary" && f.funding.perCycle > 0)
    .map((f) => ({ id: f.id, name: f.name, color: f.color, icon: f.icon, perDay: fundingPerDay(f.funding!.perCycle, len) }))
    .filter((f) => f.perDay > 0);

  const yoursPct = Math.max(0, Math.min(100, (rate / amount) * 100));

  return (
    <div className="rounded-xl bg-white/70 dark:bg-white/5 px-3 py-2 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200">قسمةُ يومك</span>
        <span className="text-[10px] text-gray-400">
          {formatAmount(Math.round(amount))} مضبوط − {formatAmount(Math.round(drip))} لمظاريفك
        </span>
      </div>

      <div className="h-2.5 rounded-full overflow-hidden flex bg-gray-100 dark:bg-white/10">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${yoursPct}%`, backgroundColor: "var(--theme-accent)" }}
          title="لك"
        />
        {funded.map((f) => (
          <div
            key={f.id}
            className="h-full transition-all duration-500"
            style={{ width: `${Math.max(1, (f.perDay / amount) * 100)}%`, backgroundColor: f.color }}
            title={f.name}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-gray-500">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--theme-accent)" }} />
          لك <b className="text-finance">{formatAmount(Math.round(rate))} ر.س</b>
        </span>
        {funded.map((f) => (
          <span key={f.id} className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
            {f.icon} {f.name} {formatAmount(Math.round(f.perDay))}
          </span>
        ))}
      </div>
    </div>
  );
}
