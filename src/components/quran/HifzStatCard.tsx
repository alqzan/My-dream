"use client";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ } from "@/lib/types";
import { TOTAL_PAGES, juzRange } from "@/lib/quran/meta";
import { today } from "@/lib/utils";
import { hifzProgress, hifzStreak, memorizedInWindow } from "@/lib/quran/hifz";
import { Card } from "@/components/ui/Card";
import { BookOpenText, Flame, ChevronLeft } from "lucide-react";

// بطاقة الحفظ في صفحة الإحصائيات — ملخّصٌ سريع لتقدّم الحفظ (تظهر متى وُجدت خطة).
export function HifzStatCard() {
  const h = useAppStore((s) => s.quranHifz) ?? EMPTY_HIFZ;
  if (!h.plan) return null;

  const prog = hifzProgress(h);
  const streak = hifzStreak(h);
  const month = memorizedInWindow(h, 30, today());
  let completed = 0;
  for (let j = 1; j <= 30; j++) {
    const r = juzRange(j);
    if (r.start >= h.plan.startId && r.end <= h.frontierId) completed++;
  }

  return (
    <Card className="animate-fade-up stagger-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BookOpenText size={16} className="text-quran" />
          <span className="text-sm font-semibold text-gray-700">الحفظ</span>
        </div>
        <Link href="/quran?tab=hifz" className="flex items-center gap-0.5 text-[11px] text-quran font-semibold press">
          الخريطة <ChevronLeft size={13} />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <Tile value={`${prog.pct}%`} label={`${prog.spanPages} من ${TOTAL_PAGES} وجه`} />
        <Tile value={String(completed)} label="جزء مكتمل" />
        <Tile value={<span className="flex items-center justify-center gap-1">{streak}{streak > 0 && <Flame size={13} className="text-amber-500" />}</span>} label="سلسلة الحفظ" />
      </div>

      <div className="h-2.5 bg-gray-100 dark:bg-[#2c2318] rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-l from-quran to-[#2f9c73] transition-all duration-700" style={{ width: `${prog.pct}%` }} />
      </div>
      <p className="text-[11px] text-gray-500 mt-2">
        {prog.at ? `موضعك: ${prog.at.surahName} ${prog.at.ayah}` : "—"}
        {month > 0 && <span className="text-quran"> · حفظت {month} آية هذا الشهر</span>}
      </p>
    </Card>
  );
}

function Tile({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl bg-quran/[0.06] p-2 text-center">
      <div className="text-base font-bold text-quran tabular-nums leading-none">{value}</div>
      <div className="text-[9px] text-gray-500 mt-1">{label}</div>
    </div>
  );
}
