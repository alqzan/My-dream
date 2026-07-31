"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { visibleEvents, daysUntil, describeDays, coarseDistance, progressTo, windowFor } from "@/lib/countdown";
import { today, formatDate, hijriDate } from "@/lib/utils";
import { CalendarClock, ChevronLeft } from "lucide-react";

// ===================== بطاقة العدّ التنازلي =====================
// الأحداث المهمّة (اختبار، ولادة، سفر) بعدد الأيام المتبقّية. تُخفى البطاقة
// كلّها حين لا حدثَ معروضاً — فلا تترك أثراً في الرئيسية لمن لا يستعملها
// (كبطاقة رمضان الموسمية تماماً).
//
// الحساب كلّه من `src/lib/countdown.ts` (نقيّ ومختبَر): لا تعريفَ ثانياً هنا.
// اليوم يُقرأ من `today()` داخل حالةٍ تُحدَّث عند العودة للتطبيق، فجهازٌ بقي
// مفتوحاً عبر منتصف الليل لا يظلّ يقول «غداً» ليومٍ صار اليوم.

const MAX_SHOWN = 3;

export function CountdownCard() {
  const events = useAppStore((s) => s.countdownEvents);
  const [todayStr, setTodayStr] = useState(today);

  // منتصفُ الليل وعودةُ التطبيق من الخلفية: كلاهما يغيّر «اليوم».
  useEffect(() => {
    const refresh = () => setTodayStr(today());
    const id = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const shown = visibleEvents(events, todayStr).slice(0, MAX_SHOWN);
  if (shown.length === 0) return null;

  return (
    <div className="bg-white dark:bg-[#241c12] rounded-2xl card-shadow border border-gray-100 dark:border-transparent p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-brand-600" />
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">العدّ التنازلي</h2>
        </div>
        <Link
          href="/settings#events"
          className="text-[11px] text-gray-400 hover:text-brand-600 press inline-flex items-center gap-0.5"
        >
          إدارة <ChevronLeft size={13} />
        </Link>
      </div>
      <div className="space-y-2.5">
        {shown.map((e) => (
          <EventRow
            key={e.id}
            title={e.title}
            emoji={e.emoji}
            date={e.date}
            todayStr={todayStr}
            updatedAt={e.updatedAt}
          />
        ))}
      </div>
    </div>
  );
}

function EventRow({
  title, emoji, date, todayStr, updatedAt,
}: { title: string; emoji?: string; date: string; todayStr: string; updatedAt?: number }) {
  const days = daysUntil(date, todayStr);
  const pct = Math.round(progressTo(days, windowFor(date, updatedAt)) * 100);
  const coarse = coarseDistance(days);
  // اليومُ نفسه يستحقّ تمييزاً: هو الحدث لا العدّ إليه.
  const isToday = days === 0;

  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="w-9 h-9 shrink-0 rounded-xl bg-brand-600/10 flex items-center justify-center text-base"
      >
        {emoji || "📌"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{title}</span>
          <span
            className={`text-xs font-bold tabular-nums shrink-0 ${isToday ? "text-brand-600" : "text-gray-600 dark:text-gray-300"}`}
          >
            {describeDays(days)}
          </span>
        </div>
        {/* شريطُ اقترابٍ لا شريط إنجاز: يمتلئ كلّما قرُب الموعد (نافذة 90 يوماً). */}
        <div className="mt-1 h-1 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-600/70 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-gray-400">
          <span className="truncate">{formatDate(date)} · {hijriDate(date)}</span>
          {coarse && <span className="shrink-0">{coarse}</span>}
        </div>
      </div>
    </div>
  );
}
