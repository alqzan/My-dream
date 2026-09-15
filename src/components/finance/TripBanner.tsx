"use client";
import { useAppStore } from "@/lib/store";
import { formatAmount, today } from "@/lib/utils";
import { activeTrip, tripSummary } from "@/lib/trip";
import { Plane } from "lucide-react";

// شريطُ «وضع السفر» في رأس صفحة المال: ما دامت رحلةٌ جارية فالحالةُ استثنائية —
// كلُّ مصروفٍ يُسجَّل يذهب إليها — فيجب أن تُرى قبل أيّ رقم، وأن يكون إنهاؤها
// بضغطةٍ من حيث تُرى. لا يظهر حين لا رحلة.
export function TripBanner({ onGo }: { onGo: () => void }) {
  const reserves = useAppStore((s) => s.reserves);
  const transactions = useAppStore((s) => s.transactions);
  const endTrip = useAppStore((s) => s.endTrip);
  const ongoing = activeTrip(reserves);
  if (!ongoing) return null;
  const { fund, trip } = ongoing;

  const s = tripSummary(fund, transactions, today(), trip);
  return (
    <div
      className="flex items-center gap-2 rounded-2xl px-3 py-2"
      style={{ background: "var(--theme-accent-soft)", border: "1px solid var(--theme-accent-line)" }}
    >
      <Plane size={15} className="text-finance shrink-0" />
      <button type="button" onClick={onGo} className="flex-1 min-w-0 text-right press">
        <span className="block text-[11px] font-bold" style={{ color: "var(--ink)" }}>
          وضع السفر — {fund.icon} {fund.name}
        </span>
        <span className="block text-[10px]" style={{ color: "var(--ink52)" }}>
          كلُّ مصروفٍ تسجّله محسوبٌ عليها · صُرف {formatAmount(Math.round(s.total))} ر.س في{" "}
          {formatAmount(s.days)} {s.days === 1 ? "يوم" : "يوماً"}
        </span>
      </button>
      <button
        type="button"
        onClick={() => endTrip(fund.id)}
        className="text-[10px] font-bold text-finance bg-white/70 dark:bg-white/10 rounded-full px-2.5 py-1 press shrink-0"
      >
        أنهِ الرحلة
      </button>
    </div>
  );
}
