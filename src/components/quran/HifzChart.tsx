"use client";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ } from "@/lib/types";
import { TOTAL_AYAT, TOTAL_PAGES } from "@/lib/quran/meta";
import { today, formatDateShort } from "@/lib/utils";
import { hifzSeries, memorizedInWindow } from "@/lib/quran/hifz";
import { TrendingUp } from "lucide-react";

// رسم تقدّم الحفظ عبر الزمن — منحنى تراكمي (بالأوجه) منذ بداية الخطة، مع ملخّص
// «اليوم/الأسبوع/الشهر». مرسومٌ بـSVG بلغة أدوات التطبيق (تدرّج أخضر، طرفٌ لامع).
const W = 300, H = 96, PAD = 6;
const toPages = (ayat: number) => (ayat / TOTAL_AYAT) * TOTAL_PAGES;

export function HifzChart() {
  const h = useAppStore((s) => s.quranHifz) ?? EMPTY_HIFZ;
  const todayStr = today();
  const series = hifzSeries(h, todayStr);

  const wDay = memorizedInWindow(h, 1, todayStr);
  const wWeek = memorizedInWindow(h, 7, todayStr);
  const wMonth = memorizedInWindow(h, 30, todayStr);

  return (
    <div className="rounded-2xl border border-quran/20 bg-white dark:bg-[#241c12] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp size={15} className="text-quran" />
        <span className="text-sm font-bold text-gray-800">تقدّم الحفظ</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <WinTile value={wDay} label="اليوم" />
        <WinTile value={wWeek} label="آخر أسبوع" />
        <WinTile value={wMonth} label="آخر شهر" />
      </div>

      {series.length < 2 ? (
        <p className="text-[11px] text-gray-400 text-center py-3">سجّل حفظك أيّاماً ليظهر منحنى تقدّمك هنا.</p>
      ) : (
        <Curve series={series} />
      )}
    </div>
  );
}

function WinTile({ value, label }: { value: number; label: string }) {
  const pages = Math.round(toPages(value) * 10) / 10;
  return (
    <div className="rounded-xl bg-quran/[0.06] p-2 text-center">
      <div className="text-sm font-bold text-quran tabular-nums leading-none">{value}</div>
      <div className="text-[9px] text-gray-500 mt-0.5">آية · {pages} وجه</div>
      <div className="text-[9px] text-gray-400">{label}</div>
    </div>
  );
}

function Curve({ series }: { series: { date: string; cumAyat: number }[] }) {
  const n = series.length;
  const maxPages = Math.max(1, toPages(series[n - 1].cumAyat));
  const x = (i: number) => PAD + (i / (n - 1)) * (W - 2 * PAD);
  const y = (ayat: number) => H - PAD - (toPages(ayat) / maxPages) * (H - 2 * PAD);

  const pts = series.map((p, i) => `${x(i).toFixed(1)},${y(p.cumAyat).toFixed(1)}`);
  const line = `M ${pts.join(" L ")}`;
  const area = `${line} L ${x(n - 1).toFixed(1)},${H - PAD} L ${x(0).toFixed(1)},${H - PAD} Z`;
  const tip = { x: x(n - 1), y: y(series[n - 1].cumAyat) };

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block overflow-visible">
        <defs>
          <linearGradient id="hifzArea" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1b6b4c" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#1b6b4c" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="hifzLine" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#2f9c73" />
            <stop offset="100%" stopColor="#1b6b4c" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#hifzArea)" />
        <path d={line} fill="none" stroke="url(#hifzLine)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={tip.x} cy={tip.y} r="3" fill="#1b6b4c" stroke="#fff" strokeWidth="1.5" />
      </svg>
      <div className="flex items-center justify-between text-[9px] text-gray-400 mt-1">
        <span>{formatDateShort(series[0].date)}</span>
        <span className="font-bold text-quran">{Math.round(toPages(series[n - 1].cumAyat))} وجه</span>
        <span>{formatDateShort(series[n - 1].date)}</span>
      </div>
    </div>
  );
}
