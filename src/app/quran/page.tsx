"use client";
import { useState } from "react";
import { SectionSignet } from "@/components/layout/SectionSignet";
import { HifzSection } from "@/components/quran/HifzSection";
import { QuranBanner } from "@/components/quran/QuranBanner";
import { BookOpenText, Map, Sparkles } from "lucide-react";

type QuranView = "today" | "map" | "drill";

// قسم «القرآن» في هذه المرحلة هو مسار الحفظ وحده. مكوّنات التدبّر والمصحف
// والبيانات المرتبطة بهما ما زالت في المشروع، لكن لا تُعرض ولا تُحذف من التخزين
// حتى نضيفها لاحقاً بقرارٍ مستقل.

export default function QuranPage() {
  const [view, setView] = useState<QuranView>("today");
  const tabs: { id: QuranView; label: string; icon: typeof BookOpenText }[] = [
    { id: "today", label: "اليوم", icon: BookOpenText },
    { id: "drill", label: "المذاكرة", icon: Sparkles },
    { id: "map", label: "الخريطة", icon: Map },
  ];

  return (
    <div className="page-shell mdr mdr-quran-page">
      <div className="mdr-quran-header animate-fade-up">
        <div className="flex items-center gap-2.5">
          <SectionSignet href="/quran" />
          <h1 className="page-title">القرآن</h1>
        </div>
        <p className="page-subtitle">الحفظ والمراجعة</p>
      </div>

      <div className="animate-fade-up stagger-1">
        <QuranBanner />
      </div>

      <div className="mdr-quran-tabs animate-fade-up stagger-2" role="tablist" aria-label="أقسام الحفظ">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={view === id ? "is-active" : ""}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="mdr-quran-hifz-only animate-fade-up stagger-3 space-y-4">
        <div className="mdr-quran-path-label">
          <BookOpenText size={15} /> مسار الحفظ فقط
        </div>
        <HifzSection view={view} />
      </div>
    </div>
  );
}
