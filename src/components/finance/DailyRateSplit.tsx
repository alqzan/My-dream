"use client";
import { useAppStore } from "@/lib/store";
import { formatAmount } from "@/lib/utils";
import { cycleLength } from "@/lib/budgetCycle";
import { fundingPerDay } from "@/lib/fundPlan";
import { today } from "@/lib/utils";

// ===================== قسمةُ يومك =====================
// «ليش مصروفي اليومي نزل من ١٠٠ إلى ٨٣؟» — سؤالٌ يستحقّ صورةً لا فقرة. شريطٌ واحد يُري
// اليوم مقسوماً: ما هو لك، وما هو محجوزٌ لمظاريفك — كلُّ مظروفٍ بلونه هو نفسه
// الذي تراه في قافلة المظاريف، فتربط الشاشتان بلا شرح. لا يظهر إلّا حين يكون
// ثمّة تمويلٌ من الراتب فعلاً (وإلّا فالمصروف كاملٌ ولا قسمة).
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
    <div className="mdr-daysplit space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold" style={{ color: "var(--ink)" }}>
          قسمةُ يومك
        </span>
        <span className="text-[10px]" style={{ color: "var(--ink52)" }}>
          {formatAmount(Math.round(amount))} مضبوط − {formatAmount(Math.round(drip))} لمظاريفك
        </span>
      </div>

      <div className="mdr-daysplit-track">
        <div
          className="mdr-daysplit-seg"
          style={{ width: `${yoursPct}%`, backgroundColor: "var(--theme-accent)" }}
          title="لك"
        />
        {funded.map((f) => (
          <div
            key={f.id}
            className="mdr-daysplit-seg"
            style={{ width: `${Math.max(1, (f.perDay / amount) * 100)}%`, backgroundColor: f.color }}
            title={f.name}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mdr-chip">
          <span className="mdr-dot" style={{ backgroundColor: "var(--theme-accent)" }} />
          لك <b>{formatAmount(Math.round(rate))} ر.س</b>
        </span>
        {funded.map((f) => (
          <span key={f.id} className="mdr-chip truncate">
            <span className="mdr-dot" style={{ backgroundColor: f.color }} />
            <span className="truncate">{f.icon} {f.name}</span>
            <b>{formatAmount(Math.round(f.perDay))}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
