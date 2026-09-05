"use client";
import { useEffect, useState } from "react";
import { shortVerseOfDay, verseRef, dayOfYear, type QuranVerse } from "@/lib/quranVerses";

// خِتامُ القسم — آيةٌ قصيرة موثوقة تتغيّر كلّ يوم، وتحتها الدعاء. الاختيار على
// العميل فقط لثبات SSR.
//
// **موضعُها الذيل لا الصدر**: كانت تتصدّر الصفحة فيقرأ الرأسُ زخرفةً قبل أن يبلغ
// «ما عليّ اليوم»، ويهبط الفعلُ (زرّ الجلسة) تحت طيّة الشاشة في الجوّال. والآن
// الدعاء سطرٌ صغير تحت الآية لا عنواناً فوقها — الآيةُ هي المتن، والدعاء تعقيب.
export function QuranBanner() {
  const [verse, setVerse] = useState<QuranVerse | null>(null);
  // إزاحة 5 لتختلف عبارة اللافتة عن «آية اليوم» في التدبّر بنفس اليوم.
  useEffect(() => setVerse(shortVerseOfDay(dayOfYear(), 5)), []);

  return (
    <div className="mdr-quran-banner relative overflow-hidden rounded-2xl border border-quran/25 p-4">
      {/* هالةٌ زخرفية خفيفة */}
      <div className="mdr-quran-banner-glow pointer-events-none absolute -top-8 -left-6 w-28 h-28 rounded-full bg-quran/10 blur-2xl" aria-hidden />
      {verse && (
        <div className="relative">
          <p className="font-quran text-center text-[17px] font-bold text-gray-800 dark:text-gray-100 leading-[2.1]">
            {verse.text}
          </p>
          <p className="text-center text-[11px] text-quran font-semibold mt-2">﴿ {verseRef(verse)} ﴾</p>
        </div>
      )}
      <p className="relative mt-3 pt-3 border-t border-quran/15 text-center text-[11px] font-bold text-quran/80">
        اللهم اجعل القرآن ربيع قلبي
      </p>
    </div>
  );
}
