"use client";
import { useMemo } from "react";
import { countDayPrayers, today, arabicMonthName } from "@/lib/utils";
import type { PrayerLog } from "@/lib/types";

interface PrayerYearRingProps {
  prayerLogs: PrayerLog[];
  year: number; // السنة التي تمثّلها الحلقة
  activeMonth: number; // الشهر المميّز (0..11) أو -1 لا شيء
  onSelectMonth?: (month: number) => void;
}

// هندسة الحلقة (نفس فكرة YearOrbit: إحداثيات قطبية على دائرة) لكنها مقسّمة إلى
// 12 قوساً — قوسٌ لكل شهر. 0° عند الأعلى، والزيادة باتجاه عقارب الساعة.
const CX = 50;
const CY = 50;
const R = 38; // نصف قطر شريط الحلقة
const SW = 8; // عرض القوس
const GAP = 2; // فجوة (بالدرجات) على كل جانب تفصل الأقواس

function polar(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}
function arcPath(r: number, a0: number, a1: number): string {
  const s = polar(r, a0);
  const e = polar(r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${s.x.toFixed(3)} ${s.y.toFixed(3)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(3)} ${e.y.toFixed(3)}`;
}

const TEAL = "#1f7a6c";
const GOLD = "#e5b45f";

// فلك الشهور — حلقة السنة مقسّمة إلى اثني عشر قوساً، سطوع كل قوسٍ بقدر التزام
// شهره بالصلوات (نفس مقياس صفحة الصلاة: المصلّى ÷ أيام الشهر × 5). الشهر
// الحالي عليه «كوكبٌ» ذهبي، والمركز يحمل السنة والنسبة الكلية. تُقرأ البيانات
// عبر countDayPrayers فقط — لا حساب صلاةٍ جديد هنا.
export function PrayerYearRing({ prayerLogs, year, activeMonth, onSelectMonth }: PrayerYearRingProps) {
  const todayStr = today();
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const todayYear = ty;
  const todayMonth = tm - 1; // 0..11
  const todayDay = td;

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const prefix = `${year}-${String(m + 1).padStart(2, "0")}`;
      const logs = prayerLogs.filter((l) => l.date.startsWith(prefix) && l.date <= todayStr);
      const prayed = logs.reduce((s, l) => s + countDayPrayers(l).prayed, 0);
      // أيام الشهر المنقضية حتى اليوم — نفس مقام نسبة «هذا الشهر»: أيامٌ × 5.
      let daysElapsed: number;
      if (year < todayYear || (year === todayYear && m < todayMonth)) {
        daysElapsed = new Date(year, m + 1, 0).getDate(); // شهر مكتمل
      } else if (year === todayYear && m === todayMonth) {
        daysElapsed = todayDay;
      } else {
        daysElapsed = 0; // شهر لم يأتِ بعد
      }
      const denom = daysElapsed * 5;
      const frac = denom > 0 ? Math.max(0, Math.min(1, prayed / denom)) : 0;
      return { m, prayed, denom, frac };
    });
  }, [prayerLogs, year, todayStr, todayYear, todayMonth, todayDay]);

  const totalPrayed = months.reduce((s, x) => s + x.prayed, 0);
  const totalDenom = months.reduce((s, x) => s + x.denom, 0);
  const overallPct = totalDenom > 0 ? Math.round((totalPrayed / totalDenom) * 100) : 0;

  const showCurrent = year === todayYear; // نُبرز الشهر الحالي في سنته فقط
  const sel = activeMonth >= 0 && activeMonth <= 11 ? months[activeMonth] : null;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-56 h-56">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full motion-safe:animate-fade-up">
          {/* أثرٌ خافت للحلقة كاملةً */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke={TEAL} strokeOpacity={0.07} strokeWidth={SW} />

          {months.map(({ m, frac, denom }) => {
            const d = arcPath(R, m * 30 + GAP, (m + 1) * 30 - GAP);
            const op = denom > 0 ? 0.16 + 0.84 * frac : 0.05;
            return (
              <g key={m}>
                {/* هدف لمسٍ عريض شفاف لتسهيل الضغط */}
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={SW + 7}
                  onClick={() => onSelectMonth?.(m)}
                  role={onSelectMonth ? "button" : undefined}
                  aria-label={`${arabicMonthName(m)}${denom > 0 ? ` — ${Math.round(frac * 100)}%` : " — لا سجل"}`}
                  style={{ cursor: onSelectMonth ? "pointer" : "default" }}
                />
                {/* القوس المرئي — سطوعه بقدر الالتزام */}
                <path d={d} fill="none" stroke={TEAL} strokeOpacity={op} strokeWidth={SW} strokeLinecap="round" pointerEvents="none" />
              </g>
            );
          })}

          {/* علامات ذهبية رفيعة عند حدود الأشهر */}
          {Array.from({ length: 12 }, (_, m) => {
            const p1 = polar(R - SW / 2 - 0.5, m * 30);
            const p2 = polar(R + SW / 2 + 0.5, m * 30);
            return <line key={m} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={GOLD} strokeOpacity={0.5} strokeWidth={0.7} pointerEvents="none" />;
          })}

          {/* حدٌّ ذهبي رفيع حول الشهر المعروض في التقويم */}
          {sel && (
            <path
              d={arcPath(R, activeMonth * 30 + GAP, (activeMonth + 1) * 30 - GAP)}
              fill="none"
              stroke={GOLD}
              strokeWidth={1.6}
              strokeLinecap="round"
              pointerEvents="none"
            />
          )}

          {/* «كوكبٌ» ذهبي عند الشهر الحالي — لمسة مدار */}
          {showCurrent && (() => {
            const p = polar(R, todayMonth * 30 + 15);
            return <circle cx={p.x} cy={p.y} r={2.6} fill={GOLD} stroke="#fff" strokeWidth={1} pointerEvents="none" />;
          })()}

          {/* أرقام الأشهر (لاتينية) خارج الحلقة للتوجّه */}
          {Array.from({ length: 12 }, (_, m) => {
            const p = polar(R + 8.5, m * 30 + 15);
            const isCur = showCurrent && m === todayMonth;
            const isSel = m === activeMonth;
            return (
              <text
                key={m}
                x={p.x}
                y={p.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={4.6}
                fontWeight={isCur || isSel ? 700 : 500}
                fill={isCur ? GOLD : isSel ? TEAL : "#b8a888"}
                pointerEvents="none"
              >
                {m + 1}
              </text>
            );
          })}
        </svg>

        {/* التسمية المركزية: السنة + النسبة الكلية */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] font-medium tabular-nums leading-none text-gray-400">{year}</span>
          <span className="text-2xl font-bold tabular-nums leading-tight text-prayer">{overallPct}%</span>
          <span className="text-[10px] leading-none text-gray-400">التزام العام</span>
        </div>
      </div>

      {/* شرح الشهر المعروض + تلميح اللمس */}
      <div className="mt-1 space-y-0.5 text-center">
        {sel ? (
          <p className="text-xs text-gray-600">
            <span className="font-bold text-prayer">{arabicMonthName(activeMonth)}</span>
            {sel.denom > 0 ? ` · ${Math.round(sel.frac * 100)}% · ${sel.prayed} صلاة` : " · لا سجل بعد"}
          </p>
        ) : (
          <p className="text-xs text-gray-500">{arabicMonthName(0)} في الأعلى، والأشهر باتجاه عقارب الساعة</p>
        )}
        {onSelectMonth && <p className="text-[10px] text-gray-400">اضغط شهراً لعرضه في التقويم 👇</p>}
      </div>
    </div>
  );
}
