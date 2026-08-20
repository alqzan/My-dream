"use client";
import { SectionSignet } from "@/components/layout/SectionSignet";
import { HifzSection } from "@/components/quran/HifzSection";
import { QuranBanner } from "@/components/quran/QuranBanner";
import { BookOpenText } from "lucide-react";

// قسم «القرآن» في هذه المرحلة هو مسار الحفظ وحده. مكوّنات التدبّر والمصحف
// والبيانات المرتبطة بهما ما زالت في المشروع، لكن لا تُعرض ولا تُحذف من التخزين
// حتى نضيفها لاحقاً بقرارٍ مستقل.

export default function QuranPage() {
  return (
    <div className="page-shell">
      <div className="animate-fade-up">
        <div className="flex items-center gap-2.5">
          <SectionSignet href="/quran" />
          <h1 className="page-title">القرآن</h1>
        </div>
        <p className="page-subtitle">الحفظ والمراجعة</p>
      </div>

      <div className="animate-fade-up stagger-1">
        <QuranBanner />
      </div>

      <div className="mdr-quran-hifz-only animate-fade-up stagger-2 space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-quran">
          <BookOpenText size={15} /> مسار الحفظ فقط
        </div>
        <HifzSection />
      </div>
    </div>
  );
}
