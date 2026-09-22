"use client";
import { useAppStore } from "@/lib/store";
import type { ReserveFund } from "@/lib/types";
import { formatAmount, formatDate, getCategoryInfo, today, cn, reserveShare } from "@/lib/utils";
import { tripSummary, activeTripOf, lastEndedTrip } from "@/lib/trip";
import { Plane, Flag } from "lucide-react";

// ===================== وضعُ السفر وتقريرُها =====================
// شيئان في لوحةٍ واحدة لأنّهما شيءٌ واحد: **نافذةٌ زمنية على مظروف**. ما دامت
// مفتوحة، كلُّ مصروفٍ يُسجَّل محسوبٌ على الرحلة بلا سؤال (النموذج يفتح عليها
// أصلاً). وحين تُغلق يصير الجوابُ جاهزاً: «كلّفتك ٣٬١٥٠ ر.س في ٥ أيام».
// والأرقامُ كلُّها من `tripSummary` — يقرأ ما حُمِّل على المظروف بالبوّابة نفسها
// التي يُحسب بها رصيدُه، فلا ينحرف مجموعٌ عن مجموع.
export function TripPanel({ fund }: { fund: ReserveFund }) {
  const transactions = useAppStore((s) => s.transactions);
  const categories = useAppStore((s) => s.categories);
  const startTrip = useAppStore((s) => s.startTrip);
  const endTrip = useAppStore((s) => s.endTrip);

  const todayStr = today();
  // الجاريةُ إن وُجدت، وإلّا فآخرُ رحلةٍ انتهت على هذا المظروف — فلوحةُ مظروفٍ
  // سافرتَ عليه مرّةً تعرض تقريرَ تلك المرّة بدل أن تُظهر «ابدأ وضع السفر» وكأنّ
  // شيئاً لم يكن. ومظروفٌ له عدّةُ رحلات، سجلُّها كلُّه في «رحلاتي السابقة».
  const shown = activeTripOf(fund) ?? lastEndedTrip(fund);
  const s = tripSummary(fund, transactions, todayStr, shown);
  const started = !!shown;

  if (!started) {
    return (
      <button
        type="button"
        onClick={() => startTrip(fund.id)}
        className="w-full min-w-0 flex items-center gap-2 rounded-xl px-3 py-2 press text-right"
        style={{ background: "var(--paper)", border: "1px dashed var(--theme-accent-line)" }}
      >
        <Plane size={15} className="text-finance shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] font-bold text-finance">ابدأ وضع السفر</span>
          <span className="block text-[10px] leading-relaxed" style={{ color: "var(--ink52)" }}>
            كلُّ مصروفٍ تسجّله يُحسب على «{fund.name}» تلقائياً حتى تُنهيها — ثمّ تعرف كم كلّفتك
          </span>
        </span>
      </button>
    );
  }

  const top = s.byCategory.slice(0, 4);
  return (
    <div className="min-w-0 rounded-xl px-3 py-2.5 space-y-2" style={{ background: "var(--paper)", border: "1px solid var(--line)" }}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Plane size={14} className={s.ongoing ? "text-finance" : "text-gray-400"} />
        <span className="min-w-0 flex-1 text-[11px] font-bold" style={{ color: "var(--ink)" }}>
          {s.ongoing ? "الرحلة جارية" : "انتهت الرحلة"}
        </span>
        <span className="shrink-0 text-[10px]" style={{ color: "var(--ink52)" }}>
          {formatDate(shown!.startedAt)}
          {shown!.endedAt ? ` ← ${formatDate(shown!.endedAt)}` : ""}
        </span>
        {s.ongoing && (
          <button
            type="button"
            onClick={() => endTrip(fund.id)}
            className="mr-auto flex items-center gap-1 text-[10px] font-bold text-finance bg-finance/10 rounded-full px-2 py-1 press shrink-0"
          >
            <Flag size={11} /> أنهِ الرحلة
          </button>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-baseline gap-1.5">
        <span className="shrink-0 text-xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>
          {formatAmount(Math.round(s.total))}
        </span>
        <span className="min-w-0 text-[10px]" style={{ color: "var(--ink52)" }}>
          ر.س {s.ongoing ? "حتى الآن" : "كلّفتك"} · {formatAmount(s.days)} {s.days === 1 ? "يوم" : "يوماً"} ·{" "}
          {formatAmount(Math.round(s.perDay))} ر.س/يوم · {formatAmount(s.count)} معاملة
        </span>
      </div>

      {top.length > 0 && (
        <div className="space-y-1">
          {top.map((c) => {
            const info = getCategoryInfo(categories, c.category);
            const pct = s.total > 0 ? Math.round((c.total / s.total) * 100) : 0;
            return (
              <div key={c.category} className="flex items-center gap-1.5">
                <span className="text-xs shrink-0">{info.icon}</span>
                <span className="text-[10px] w-16 shrink-0 truncate" style={{ color: "var(--ink52)" }}>{info.label}</span>
                <span className="min-w-0 flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--theme-accent-soft)" }}>
                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: info.color }} />
                </span>
                <span className="text-[10px] tabular-nums shrink-0" style={{ color: "var(--ink52)" }}>
                  {formatAmount(Math.round(c.total))}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {s.biggest && (
        <div className="text-[10px]" style={{ color: "var(--ink52)" }}>
          أكبرها: {s.biggest.note || "مصروف"} — {formatAmount(Math.round(reserveShare(s.biggest, fund.id)))} ر.س
        </div>
      )}

      {!s.ongoing && (
        <button
          type="button"
          onClick={() => startTrip(fund.id)}
          className={cn("text-[10px] font-semibold text-finance press")}
        >
          ↻ ابدأ رحلةً جديدة على هذا المظروف
        </button>
      )}
    </div>
  );
}
