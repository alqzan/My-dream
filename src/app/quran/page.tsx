"use client";
import { useState } from "react";
import { SectionSignet } from "@/components/layout/SectionSignet";
import { HifzSection } from "@/components/quran/HifzSection";
import { KhatmaOrbit } from "@/components/quran/KhatmaOrbit";
import { QuranBanner } from "@/components/quran/QuranBanner";
import { BookOpenText, Map, Sparkles } from "lucide-react";

type QuranView = "today" | "map" | "drill";

// قسم «القرآن» بابان: **الختمة** (تلاوةٌ تدور) و**الحفظ** (مسارٌ يتراكم).
// وكانت الختمةُ ساقطةً سهواً لا قصداً: `KhatmaOrbit` عاش داخل متصفّح المصحف،
// فلمّا أُوقف المتصفّحُ سقطت معه ستّةُ إجراءاتٍ في المتجر بلا زرٍّ يبلغها —
// فلا سبيلَ لتسجيل جزءٍ ولا صفحة. مكانُها الصحيح هنا: تبويب «اليوم»، فوق
// جلسة الحفظ، لأنّ كلتيهما «ما عليك اليوم».

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
        {/* الختمةُ في «اليوم» وحده: هي حالُ تلاوتك الآن، لا خريطةً ولا مذاكرة. */}
        {view === "today" && <KhatmaOrbit />}
        <div className="mdr-quran-path-label">
          <BookOpenText size={15} /> مسار الحفظ
        </div>
        <HifzSection view={view} />
      </div>
    </div>
  );
}
