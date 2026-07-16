"use client";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { formatAmount } from "@/lib/utils";

// بطاقة رقمٍ في هيئة «أداة» صغيرة — سطح كريمي كأخوات لوحة القيادة (الإسطرلاب،
// مدار الانضباط، سباق المدارين): حدٌّ ذهبي رفيع، ونجمُ القسم لونًا للعدد
// (بخط ثمانية العريض)، وشارةُ أيقونةٍ صغيرة، وشارةٌ في الزاوية بلون القسم. حيث
// يوجد نسبةٌ حقيقية (كالكتب المنهاة مقابل هدف القراءة) تكون الشارةُ حلقةَ مقياسٍ
// تمتلئ بها — وهي الحلقةُ الوحيدة في الطاقم؛ وإلا فالشارةُ عنقودُ نجومٍ زخرفيّ
// (لا حلقة أصلًا) كي لا تُقرأ كمقياسٍ فارغ. يعمل في النهاري والليلي عبر إعادة
// تعيين bg-white إلى ورقٍ داكن في globals.css.
interface StatInstrumentProps {
  value: number;
  label: string;
  color: string; // نجم القسم (accent)
  icon: ReactNode;
  goal?: number; // إن وُجد: الحلقة تصبح مقياسًا حقيقيًا (value/goal) ويظهر «/ الهدف»
}

export function StatInstrument({ value, label, color, icon, goal }: StatInstrumentProps) {
  const frac = goal && goal > 0 ? Math.min(1, Math.max(0, value / goal)) : undefined;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 card-shadow p-3.5">
      {/* لمسةٌ شعاعية باهتة جدًا من لون القسم في الزاوية — دفءٌ بلا طوفانٍ لونيّ */}
      <span
        className="pointer-events-none absolute -top-6 -start-6 w-20 h-20 rounded-full"
        style={{ background: `radial-gradient(circle, ${color}1f 0%, transparent 70%)` }}
        aria-hidden
      />
      <div className="relative flex items-start justify-between">
        <span
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: color + "1f", color }}
        >
          {icon}
        </span>
        <InstrumentRing color={color} frac={frac} />
      </div>

      <div className="relative mt-2 flex items-baseline gap-1">
        <span className="text-[26px] font-bold tabular-nums leading-none" style={{ color }}>
          <AnimatedNumber value={value} />
        </span>
        {goal && goal > 0 && (
          <span className="text-[12px] font-semibold tabular-nums text-gray-400 leading-none">
            / {formatAmount(goal)}
          </span>
        )}
      </div>
      <div className="relative text-[11px] text-gray-500 mt-1 leading-snug">{label}</div>
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// شارةُ الزاوية. إن مُرِّرت نسبة فهي حلقةُ مقياسٍ حقيقية (مسارٌ باهت + قوسٌ ذهبي
// يمتلئ إليها بطرفٍ مداريّ + حلقةٌ داخلية للعمق) — الحلقةُ الوحيدة في الطاقم؛
// وإلا فعنقودُ نجومٍ زخرفيّ بلون القسم (نجمةٌ رباعية + شرارتان، بلا أي حلقة) كي
// لا يُقرأ كمقياسٍ فارغ بجوار المقياس الحقيقي.
const VB = 48;
const C = VB / 2;
const R = 17; // المسار الخارجي
const R_INNER = 11; // حلقة داخلية باهتة

// نجمةٌ رباعية (شرارة) حول (cx,cy) — نصف قطرٍ خارجي r وخصرٌ ri.
function sparklePath(cx: number, cy: number, r: number): string {
  const ri = r * 0.36;
  return `M ${cx} ${cy - r} L ${cx + ri} ${cy - ri} L ${cx + r} ${cy} L ${cx + ri} ${cy + ri} L ${cx} ${cy + r} L ${cx - ri} ${cy + ri} L ${cx - r} ${cy} L ${cx - ri} ${cy - ri} Z`;
}

function InstrumentRing({ color, frac }: { color: string; frac?: number }) {
  const reduce = prefersReducedMotion();
  const [on, setOn] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const t = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(t);
  }, [reduce]);

  // ===== زخرفيّ (بلا هدف): عنقودُ نجومٍ — واضحُ الزخرفة، ليس حلقةً، فلا يُقرأ
  // كمقياسٍ فارغ بجوار المقياس الحقيقي. لا دوائر البتّة. =====
  if (frac === undefined) {
    return (
      <svg viewBox={`0 0 ${VB} ${VB}`} width={46} height={46} className="shrink-0 overflow-visible" aria-hidden>
        {/* نجمةٌ رئيسية رباعية بقلبٍ فاتح — شارةُ القسم الزخرفية */}
        <path d={sparklePath(C, C, 8.6)} fill={color} opacity={0.9} />
        <path d={sparklePath(C, C, 3.4)} fill="#fff" className="dark:fill-[#241c12]" opacity={0.85} />
        {/* شرارتان صغيرتان مرافِقتان — عنقودٌ لا مدار */}
        <path d={sparklePath(C + 11.5, C - 10.5, 3)} fill={color} opacity={0.6} />
        <path d={sparklePath(C - 12, C + 9, 2.1)} fill={color} opacity={0.4} />
      </svg>
    );
  }

  // ===== مقياسٌ حقيقيّ (بهدف): الحلقةُ الوحيدة في الطاقم =====
  const circ = 2 * Math.PI * R;
  const f = frac;
  const dash = (on ? f : 0) * circ;
  const tipA = ((on ? f : 0) * 360 - 90) * (Math.PI / 180);
  const tipX = C + R * Math.cos(tipA);
  const tipY = C + R * Math.sin(tipA);
  const dashTrans = reduce ? undefined : { transition: "stroke-dasharray 1.2s cubic-bezier(0.16,1,0.3,1)" };
  const tipTrans = reduce ? undefined : { transition: "cx 1.2s cubic-bezier(0.16,1,0.3,1), cy 1.2s cubic-bezier(0.16,1,0.3,1)" };

  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} width={46} height={46} className="shrink-0 overflow-visible">
      {/* حلقة داخلية باهتة — عمقٌ لطيف في الوضعين */}
      <circle cx={C} cy={C} r={R_INNER} fill="none" stroke="currentColor" className="text-gray-200 dark:text-[#3a2e1e]" strokeWidth={1.1} opacity={0.5} />
      {/* مقياسٌ حقيقيّ: مسارٌ باهت + قوسٌ ذهبي يمتلئ إلى النسبة بطرفٍ مداريّ */}
      <defs>
        <linearGradient id="heroGaugeGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e8b15a" />
          <stop offset="100%" stopColor="#c9852a" />
        </linearGradient>
      </defs>
      <circle cx={C} cy={C} r={R} fill="none" stroke="currentColor" className="text-gray-200 dark:text-[#3a2e1e]" strokeWidth={3} />
      <g style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}>
        <circle
          cx={C} cy={C} r={R} fill="none"
          stroke="url(#heroGaugeGold)" strokeWidth={3} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`} style={dashTrans}
        />
      </g>
      <circle cx={tipX} cy={tipY} r={2.6} fill="#e8b15a" stroke="#fff" strokeWidth={1.1} className="dark:stroke-[#241c12]" style={tipTrans} />
    </svg>
  );
}
