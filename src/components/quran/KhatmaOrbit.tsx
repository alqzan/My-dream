"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { formatAmount, formatDate } from "@/lib/utils";
import { Confetti } from "@/components/ui/Confetti";
import { Plus, Minus, RotateCcw, Check } from "lucide-react";

// «مدار الختمة» — أداةٌ إبداعية على عائلة أدوات التطبيق (PrayerOrbit، مدار
// السنة، سباق المدارين): حلقةٌ ذهبية من ٣٠ جزءاً، كل جزءٍ مقروء يُضيء قوسه.
// تكتمل الحلقة عند ٣٠ فتُختم بلمسةٍ احتفالية ثم تبدأ ختمةٌ جديدة. رسمٌ ساكن
// (كأخواتها) لا يحتاج تعطيلاً لتقليل الحركة.
const VB = 120;
const C = VB / 2;
const R = 46;
const JUZ = 30;
const GAP_DEG = 2.4; // فراغٌ بين أقواس الأجزاء ليقرأها العين ٣٠ جزءاً منفصلة

// نقطة على الحلقة بزاوية θ (بالدرجات) تُقاس من الأعلى باتجاه عقارب الساعة.
function ringPoint(theta: number, r = R) {
  const rad = (theta * Math.PI) / 180;
  return { x: C + r * Math.sin(rad), y: C - r * Math.cos(rad) };
}

// قوس الجزء i (0..29) كمسار SVG.
function juzArc(i: number): string {
  const step = 360 / JUZ;
  const a0 = i * step + GAP_DEG / 2;
  const a1 = (i + 1) * step - GAP_DEG / 2;
  const p0 = ringPoint(a0);
  const p1 = ringPoint(a1);
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${R} ${R} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

export function KhatmaOrbit() {
  const { quranKhatma, addKhatmaJuz, setKhatmaJuz, completeKhatma, resetKhatma } = useAppStore();
  const k = quranKhatma ?? { juz: 0, completed: 0 };
  const [celebrate, setCelebrate] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const full = k.juz >= JUZ;
  const pct = Math.round((k.juz / JUZ) * 100);

  function seal() {
    completeKhatma();
    setCelebrate(true);
    setTimeout(() => setCelebrate(false), 5200);
  }

  return (
    <div className="rounded-2xl border border-quran/20 bg-gradient-to-b from-quran/[0.06] to-transparent p-4">
      {celebrate && <Confetti />}
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-gray-700">مدار الختمة</span>
        {k.completed > 0 && (
          <span className="text-[11px] font-bold text-quran bg-quran/10 rounded-full px-2.5 py-0.5">
            أتممت {formatAmount(k.completed)} {k.completed === 1 ? "ختمة" : "ختمات"} 🌙
          </span>
        )}
      </div>

      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: 190, height: 190 }}>
          <svg viewBox={`0 0 ${VB} ${VB}`} width={190} height={190}>
            <defs>
              <linearGradient id="khatmaGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f0cf7f" />
                <stop offset="55%" stopColor="#e8b15a" />
                <stop offset="100%" stopColor="#c9852a" />
              </linearGradient>
            </defs>
            {Array.from({ length: JUZ }, (_, i) => {
              const read = i < k.juz;
              return (
                <path
                  key={i}
                  d={juzArc(i)}
                  fill="none"
                  stroke={read ? "url(#khatmaGold)" : "currentColor"}
                  className={read ? "" : "text-gray-200 dark:text-[#3a2e1e]"}
                  strokeWidth={read ? 7 : 5}
                  strokeLinecap="round"
                  style={{ transition: "stroke-width 0.3s ease" }}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-4xl font-black text-quran tabular-nums leading-none">{k.juz}</span>
            <span className="text-[11px] text-gray-400 mt-1">من {JUZ} جزءاً</span>
            <span className="text-[10px] text-gray-400 mt-0.5 tabular-nums">{pct}%</span>
          </div>
        </div>

        {/* الحالة النصّية */}
        <p className="text-xs text-gray-500 mt-1 text-center leading-relaxed">
          {full
            ? "🎉 أتممت الختمة كاملةً — تقبّل الله"
            : k.juz === 0
            ? "ابدأ ختمتك: سجّل كل جزءٍ تقرؤه"
            : k.startDate
            ? `بدأتها ${formatDate(k.startDate)}`
            : ""}
        </p>

        {/* أدوات التحكّم */}
        <div className="w-full mt-3 space-y-2">
          {full ? (
            <button
              onClick={seal}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press shadow-sm"
            >
              <Check size={17} /> اختم وابدأ ختمة جديدة
            </button>
          ) : (
            <button
              onClick={addKhatmaJuz}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press shadow-sm"
            >
              <Plus size={17} /> قرأت جزءاً
            </button>
          )}

          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setKhatmaJuz(k.juz - 1)}
              disabled={k.juz <= 0}
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 rounded-lg px-2.5 py-1 hover:bg-gray-100 press disabled:opacity-40"
            >
              <Minus size={12} /> تراجع جزء
            </button>
            {k.juz > 0 && (
              confirmReset ? (
                <span className="flex items-center gap-1.5 text-[11px]">
                  <button onClick={() => { resetKhatma(); setConfirmReset(false); }} className="text-red-500 font-semibold press">تأكيد</button>
                  <button onClick={() => setConfirmReset(false)} className="text-gray-400 press">إلغاء</button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmReset(true)}
                  className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700 rounded-lg px-2.5 py-1 hover:bg-gray-100 press"
                >
                  <RotateCcw size={12} /> ختمة جديدة
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
