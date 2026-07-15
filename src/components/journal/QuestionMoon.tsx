"use client";
import { useEffect, useState } from "react";
import { hijriParts } from "@/lib/utils";

// متوسّط الشهر القمري (الاقتران) بالأيام.
const SYNODIC = 29.53059;

// مسار القوس المضيء للقمر في طور «متزايد» (الجهة المضيئة يميناً). القرص
// نصف قطره r حول (cx,cy). الطرف (terminator) نصف قطره الأفقي rx = r·(1−2f)
// بإشارته: f=0 محاق (rx=r فيتطابق مع الحافة ولا يضيء شيء)، f=0.5 نصف
// (rx=0 خط مستقيم)، f=1 بدر (rx=−r فيضيء القرص كاملاً).
function litPath(cx: number, cy: number, r: number, f: number): string {
  const rx = r * (1 - 2 * f);
  const sweep = rx > 0 ? 0 : 1; // اتجاه انحناء الطرف يتبع إشارة rx
  return (
    `M ${cx} ${cy - r} ` +
    `A ${r} ${r} 0 0 1 ${cx} ${cy + r} ` +
    `A ${Math.abs(rx).toFixed(3)} ${r} 0 0 ${sweep} ${cx} ${cy - r} Z`
  );
}

function phaseName(f: number, waxing: boolean): string {
  if (f < 0.04) return "محاق";
  if (f > 0.96) return "بدر";
  if (f >= 0.46 && f <= 0.54) return waxing ? "تربيع أول" : "تربيع أخير";
  if (f < 0.46) return waxing ? "هلال متزايد" : "هلال متناقص";
  return waxing ? "أحدب متزايد" : "أحدب متناقص";
}

// قمرٌ صغير بجانب «سؤال اليوم» تُحسب نسبة استضاءته من يوم الشهر الهجري —
// لمسة قمرية لا يقدر عليها إلا تطبيق بتقويم هجري. يوم 1 ≈ محاق/هلال رفيع،
// نحو 15 بدر، ونحو 29 هلال متناقص.
export function QuestionMoon() {
  const [day, setDay] = useState<number | null>(null);

  // يُحسب بعد التركيب فقط: يوم الشهر يعتمد على «الآن» على الجهاز، وحسابه أثناء
  // ما قبل الترطيب قد يختلف عن بناء الموقع الثابت فيسبّب تبايُن ترطيب.
  useEffect(() => {
    setDay(hijriParts(new Date())?.day ?? null);
  }, []);

  // خانة ثابتة القياس تمنع القفز عند غياب اليوم أو قبل التركيب.
  const box = "shrink-0 w-12 flex flex-col items-center gap-0.5 pt-0.5 select-none";
  if (day == null) return <div className={box} aria-hidden />;

  const phase = day / SYNODIC;
  const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const waxing = phase < 0.5;
  const name = phaseName(illum, waxing);

  const R = 16;
  const C = 20; // مركز القرص في مساحة عرض 40×40
  // نعكس المسار أفقياً حول منتصف الإطار للطور المتناقص (الإضاءة يساراً).
  const mirror = waxing ? undefined : "translate(40,0) scale(-1,1)";

  return (
    <div className={box} title={`${name} · اليوم ${day} هجري`}>
      <svg
        viewBox="0 0 40 40"
        className="w-9 h-9 motion-safe:animate-fade-up"
        role="img"
        aria-label={`طور القمر: ${name}`}
      >
        <defs>
          <linearGradient id="moonLit" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fdf3d8" />
            <stop offset="100%" stopColor="#e5b45f" />
          </linearGradient>
        </defs>
        {/* جسم القرص المعتم على خلفية البانر البنفسجية */}
        <circle cx={C} cy={C} r={R} fill="#ffffff" fillOpacity={0.13} />
        {/* الجزء المضيء */}
        <path d={litPath(C, C, R, illum)} fill="url(#moonLit)" transform={mirror} />
        {/* خط ذهبي رفيع حول الحافة */}
        <circle
          cx={C}
          cy={C}
          r={R}
          fill="none"
          stroke="#e5b45f"
          strokeWidth={1}
          strokeOpacity={0.75}
        />
      </svg>
      <span className="text-[9px] font-medium tabular-nums text-white/70 leading-none">
        {day} هـ
      </span>
    </div>
  );
}
