"use client";
import type { PageSide } from "@/lib/quran/page";

// رسمٌ صغير لوجهٍ مفتوح: صفحتان، والحالية مضاءة في جهتها. أوقع في الذهن من كلمة
// «يمنى» وحدها، وهو بيت القصيد في حفظ موضع الصفحة. مشتركٌ بين قارئ الصفحات
// ولوح المصحف في الحفظ — تعريفٌ واحد لا نسختان.
//
// **إحداثيات SVG فيزيائية لا منطقية**: المحور x يكبر إلى اليمين مهما كان اتجاه
// النصّ حول الرسم (`dir="rtl"` لا يقلب محتوى الـSVG). فالمستطيل عند x=17.6 هو
// **يمين** الرسم، والذي عند x=1.4 هو يساره. كانا معكوسين: يُكتب «يسرى» ويُضيء
// المربّع الأيمن — وهو أوّل ما لاحظه المالك، ومنطقيّ أن يلاحظه: الرسم كان يكذّب
// الكلمة التي بجانبه.
export function SpreadGlyph({ side, className = "w-9 h-6" }: { side: PageSide; className?: string }) {
  const on = "fill-quran/70 stroke-quran";
  const off = "fill-transparent stroke-quran/30";
  return (
    <svg viewBox="0 0 34 22" className={`${className} shrink-0`} aria-hidden>
      {/* يمين الرسم = الصفحة اليُمنى في الوجه المفتوح */}
      <rect x="17.6" y="1" width="15" height="20" rx="2" strokeWidth="1.2"
        className={side === "يمنى" ? on : off} />
      {/* يسار الرسم = الصفحة اليُسرى */}
      <rect x="1.4" y="1" width="15" height="20" rx="2" strokeWidth="1.2"
        className={side === "يسرى" ? on : off} />
      <line x1="17" y1="1" x2="17" y2="21" strokeWidth="1.2" className="stroke-quran/40" />
    </svg>
  );
}
