"use client";
import { useEffect, useState } from "react";

// A small rotating daily reflection — one item per day of the year, so the
// card changes every morning but stays stable throughout the day.
const HIKAM: { text: string; source: string }[] = [
  { text: "وَقُلِ اعْمَلُوا فَسَيَرَى اللَّهُ عَمَلَكُمْ وَرَسُولُهُ وَالْمُؤْمِنُونَ", source: "التوبة ١٠٥" },
  { text: "أحبُّ الأعمالِ إلى اللهِ أدومُها وإن قلّ", source: "متفق عليه" },
  { text: "إِنَّ مَعَ الْعُسْرِ يُسْرًا", source: "الشرح ٦" },
  { text: "الصلاةُ نور", source: "رواه مسلم" },
  { text: "من سلك طريقًا يلتمس فيه علمًا سهّل الله له به طريقًا إلى الجنة", source: "رواه مسلم" },
  { text: "وَاصْبِرْ وَمَا صَبْرُكَ إِلَّا بِاللَّهِ", source: "النحل ١٢٧" },
  { text: "القناعة كنزٌ لا يفنى", source: "حكمة" },
  { text: "الوقت كالسيف إن لم تقطعه قطعك", source: "حكمة" },
  { text: "قليلٌ دائم خيرٌ من كثيرٍ منقطع", source: "حكمة" },
  { text: "وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ", source: "الطلاق ٣" },
  { text: "لا يشكر اللهَ من لا يشكر الناس", source: "رواه أبو داود" },
  { text: "لا تؤجل عمل اليوم إلى الغد", source: "حكمة" },
  { text: "وَفِي ذَٰلِكَ فَلْيَتَنَافَسِ الْمُتَنَافِسُونَ", source: "المطففين ٢٦" },
  { text: "درهم وقاية خيرٌ من قنطار علاج", source: "حكمة" },
];

export function HikmaCard() {
  // Resolve the day index on the client only, to keep SSR output stable.
  const [hikma, setHikma] = useState<{ text: string; source: string } | null>(null);
  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now.getTime() - start.getTime()) / (24 * 3600 * 1000));
    setHikma(HIKAM[dayOfYear % HIKAM.length]);
  }, []);

  if (!hikma) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-200 dark:border-brand-900/50 bg-gradient-to-l from-brand-50 to-white dark:from-brand-900/25 dark:to-transparent p-4">
      {/* Faded khatim star ornament in the corner */}
      <svg
        viewBox="0 0 60 60" aria-hidden
        className="absolute -left-4 -bottom-4 w-24 h-24 opacity-[0.08] text-brand-700 dark:text-brand-300"
      >
        <g fill="none" stroke="currentColor" strokeWidth="1.5">
          <polygon points="17.6,0 42.4,0 60,17.6 60,42.4 42.4,60 17.6,60 0,42.4 0,17.6" />
          <path d="M17.6,0 L60,42.4 L0,42.4 L42.4,0 L42.4,60 L0,17.6 L60,17.6 L17.6,60 Z" />
        </g>
      </svg>
      <div className="relative">
        <div className="text-[11px] font-semibold text-brand-600 dark:text-brand-300 mb-1.5">✨ زاد اليوم</div>
        <p className="text-[15px] font-bold text-gray-800 dark:text-gray-100 leading-relaxed">{hikma.text}</p>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">— {hikma.source}</p>
      </div>
    </div>
  );
}
