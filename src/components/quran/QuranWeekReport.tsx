"use client";
import { useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ } from "@/lib/types";
import { today } from "@/lib/utils";
import { quranWeeklyReport } from "@/lib/quran/schedule";
import { CalendarRange, Sprout, RefreshCw, Clock, Target, ArrowLeftCircle } from "lucide-react";

// تقرير قرآني أسبوعي صغير: ما حُفظ، ما رُوجع، عدد الجلسات، أقدم مراجعة مستحقّة،
// أكثر موضعٍ تكرّر خطؤه، وخطوة الأسبوع القادم — بلغة اللوحة وهوية القرآن.
export function QuranWeekReport() {
  const h = useAppStore((s) => s.quranHifz) ?? EMPTY_HIFZ;
  const r = useMemo(() => quranWeeklyReport(h, today()), [h]);
  if (!h.plan) return null;

  // خطوة الأسبوع القادم — قاعدة بسيطة على حالة المراجعة والأخطاء.
  const nextStep = r.dueTotal > 0
    ? `راجِع ${r.dueTotal} وجهاً مستحقاً${r.oldestDueDays > 0 ? ` (أقدمها متأخّر ${r.oldestDueDays} يوم)` : ""}.`
    : r.topMistake
      ? `ثبّت موضع «${r.topMistake.ref}» الذي تكرّر خطؤه.`
      : "واصِل سبقك اليومي وثبّت القريب — مراجعتك منضبطة، أحسنت.";

  return (
    <div className="rounded-2xl border border-quran/20 bg-quran/[0.05] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarRange size={15} className="text-quran" />
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">حصيلتك القرآنية هذا الأسبوع</span>
      </div>

      {r.hasActivity ? (
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={<Sprout size={13} className="text-quran" />} value={r.memorizedPages} label="أوجه حُفظت" />
          <Stat icon={<RefreshCw size={13} className="text-quran" />} value={r.reviewedCount} label="مراجعات" />
          <Stat icon={<Target size={13} className="text-quran" />} value={r.sessions} label="جلسات حفظ" />
        </div>
      ) : (
        <p className="text-xs text-gray-500">لا نشاط قرآني هذا الأسبوع بعد — جلسةٌ قصيرة تعيد الزخم.</p>
      )}

      <div className="space-y-1.5 text-[11px] text-gray-500">
        {r.oldestDueDays > 0 && (
          <div className="flex items-center gap-1.5"><Clock size={12} className="text-amber-600" /> أقدم مراجعة مستحقّة متأخّرة {r.oldestDueDays} يوم.</div>
        )}
        {r.topMistake && (
          <div className="flex items-center gap-1.5"><Target size={12} className="text-red-500" /> أكثر موضعٍ تكرّر خطؤه: {r.topMistake.ref} ({r.topMistake.hits}×).</div>
        )}
      </div>

      <div className="flex items-start gap-1.5 bg-white/60 dark:bg-[#241c12] rounded-xl px-3 py-2">
        <ArrowLeftCircle size={14} className="text-quran shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed"><span className="font-bold text-quran">خطوة الأسبوع القادم:</span> {nextStep}</p>
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-xl bg-white/70 dark:bg-[#241c12] border border-quran/10 px-2 py-2 text-center">
      <div className="flex items-center justify-center gap-1 mb-0.5">{icon}<span className="text-base font-bold text-gray-800 dark:text-gray-100 tabular-nums">{value}</span></div>
      <div className="text-[9px] text-gray-500">{label}</div>
    </div>
  );
}
