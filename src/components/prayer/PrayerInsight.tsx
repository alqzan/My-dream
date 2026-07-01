"use client";
import { prayerConsistency } from "@/lib/utils";
import { PRAYERS, PRAYER_META, type PrayerLog } from "@/lib/types";

interface PrayerInsightProps {
  prayerLogs: PrayerLog[];
}

export function PrayerInsight({ prayerLogs }: PrayerInsightProps) {
  if (prayerLogs.length < 3) return null;

  const consistency = prayerConsistency(prayerLogs);
  const entries = PRAYERS.map((p) => ({ prayer: p, rate: consistency[p] }));
  const best = [...entries].sort((a, b) => b.rate - a.rate)[0];
  const worst = [...entries].sort((a, b) => a.rate - b.rate)[0];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <div>
        <span className="text-sm font-semibold text-gray-700">التزامك بكل صلاة</span>
        <p className="text-xs text-gray-400 mt-0.5">نسبة الأداء من إجمالي الأيام المسجّلة</p>
      </div>

      <div className="space-y-2">
        {entries.map(({ prayer, rate }) => (
          <div key={prayer} className="flex items-center gap-2">
            <span className="text-base w-6">{PRAYER_META[prayer].icon}</span>
            <span className="text-xs text-gray-500 w-12">{prayer}</span>
            <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full flex items-center justify-end px-2 transition-all"
                style={{ width: `${Math.max(rate * 100, 8)}%`, backgroundColor: "#1f7a6c" }}
              >
                <span className="text-[10px] text-white font-semibold whitespace-nowrap">
                  {Math.round(rate * 100)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {best.rate > worst.rate && (
        <div className="text-xs text-gray-600 bg-gray-50 rounded-xl p-2.5 leading-relaxed">
          💡 صلاة {best.prayer} هي الأكثر التزاماً عندك، وصلاة {worst.prayer} تحتاج اهتماماً أكثر.
        </div>
      )}
    </div>
  );
}
