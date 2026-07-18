"use client";
import { useEffect, useState } from "react";
import { shortVerseOfDay, verseRef, dayOfYear, type QuranVerse } from "@/lib/quranVerses";

// لافتة القسم — دعاءُ «اللهم اجعل القرآن ربيع قلبي» فوق عبارةٍ قرآنية متجدّدة
// (نمط HikmaCard): آيةٌ قصيرة موثوقة تتغيّر كل يوم. الاختيار على العميل فقط
// لثبات SSR. زخرفةٌ لطيفة بلون القسم الأخضر العميق.
export function QuranBanner() {
  const [verse, setVerse] = useState<QuranVerse | null>(null);
  // إزاحة 5 لتختلف عبارة اللافتة عن «آية اليوم» في التدبّر بنفس اليوم.
  useEffect(() => setVerse(shortVerseOfDay(dayOfYear(), 5)), []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-quran/25 bg-gradient-to-l from-quran/[0.12] via-quran/[0.05] to-transparent p-4">
      {/* هالةٌ زخرفية خفيفة */}
      <div className="pointer-events-none absolute -top-8 -left-6 w-28 h-28 rounded-full bg-quran/10 blur-2xl" aria-hidden />
      <p className="relative text-center text-lg font-black text-quran leading-relaxed">
        اللهم اجعل القرآن ربيع قلبي
      </p>
      {verse && (
        <div className="relative mt-3 pt-3 border-t border-quran/15">
          <p className="font-quran text-center text-[17px] font-bold text-gray-800 dark:text-gray-100 leading-[2.1]">
            {verse.text}
          </p>
          <p className="text-center text-[11px] text-quran/80 font-semibold mt-2">﴿ {verseRef(verse)} ﴾</p>
        </div>
      )}
    </div>
  );
}
