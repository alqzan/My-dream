"use client";
import { idToSurahAyah, SURAHS } from "@/lib/quran/meta";

// تلقين: يعرض الآية التي قبل الهدف (targetId) كتذكيرٍ يبني عليه المستخدم؛ فإن
// كان الهدف أوّل آية في سورته عرض اسم السورة بدل آخر آية السورة السابقة.
//
// مشتركٌ بين شاشة التسميع (HifzCoach) واختبار موضع الخطأ (MistakeDrill): طمسُ
// آيةٍ كاملةً بلا تلقينٍ ولا سياق ليس اختباراً بل ألغاز — لا سبيل لمعرفة أيّ
// آيةٍ هي من رقمها وحده.
export function LeadPrompt({ text, targetId }: { text: string[]; targetId: number }) {
  const { surah, ayah } = idToSurahAyah(targetId);
  if (ayah === 1) {
    const name = SURAHS[surah - 1]?.name ?? "";
    return (
      <div className="rounded-xl bg-quran/[0.06] border border-quran/15 px-4 py-2.5 mb-2 text-center">
        <div className="text-[10px] text-gray-400 mb-0.5">ابدأ من أوّل السورة</div>
        <div className="text-sm font-bold text-quran">﴿ سورة {name} ﴾</div>
      </div>
    );
  }
  const prevText = text[targetId - 1] ?? "";
  return (
    <div className="rounded-xl bg-quran/[0.06] border border-quran/15 px-4 py-3 mb-2">
      <div className="text-[10px] text-gray-400 mb-1 text-center">…الآية السابقة (تلقين)</div>
      <p className="font-quran text-center text-[18px] leading-[2.2] font-bold text-gray-500 dark:text-gray-400" dir="rtl">
        {prevText}<span className="text-quran/60 text-[11px] align-middle mx-0.5">﴿{ayah - 1}﴾</span>
      </p>
    </div>
  );
}
