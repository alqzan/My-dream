"use client";
import { useState } from "react";
import { SectionSignet } from "@/components/layout/SectionSignet";
import { HifzSection } from "@/components/quran/HifzSection";
import { KhatmaOrbit } from "@/components/quran/KhatmaOrbit";
import { QuranHero } from "@/components/quran/QuranHero";
import { QuranBanner } from "@/components/quran/QuranBanner";
import { BookOpenText, Map, Sparkles } from "lucide-react";

type QuranView = "today" | "map" | "drill";

// قسم «القرآن» بابان: **الختمة** (تلاوةٌ تدور) و**الحفظ** (مسارٌ يتراكم).
// وكانت الختمةُ ساقطةً سهواً لا قصداً: `KhatmaOrbit` عاش داخل متصفّح المصحف،
// فلمّا أُوقف المتصفّحُ سقطت معه ستّةُ إجراءاتٍ في المتجر بلا زرٍّ يبلغها —
// فلا سبيلَ لتسجيل جزءٍ ولا صفحة. مكانُها الصحيح هنا: تبويب «اليوم»، فوق
// جلسة الحفظ، لأنّ كلتيهما «ما عليك اليوم».
//
// **وترتيبُ الصفحة قُصد به سلّمٌ لا كومة**: لوحُ الموضع (أين أنت من المصحف) ثمّ
// التبويبات ثمّ **الفعل** (جلسة اليوم) ثمّ ما دونه، والآيةُ ختاماً في الذيل.
// كانت الزخرفةُ (الدعاء والآية) تتصدّر، ويليها شريطُ أرقامٍ يكرّر ما في بطاقة
// الجلسة — ثلاث بطاقاتٍ متساوية الوزن قبل الزرّ الذي يُضغط فعلاً.

const TABS: { id: QuranView; label: string; hint: string; icon: typeof BookOpenText }[] = [
  { id: "today", label: "اليوم", hint: "ما عليك الآن", icon: BookOpenText },
  { id: "drill", label: "المذاكرة", hint: "مواضع تعثّرك", icon: Sparkles },
  { id: "map", label: "الخريطة", hint: "محفوظك كلّه", icon: Map },
];

export default function QuranPage() {
  const [view, setView] = useState<QuranView>("today");

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
        <QuranHero />
      </div>

      <div className="mdr-quran-tabs animate-fade-up stagger-2" role="tablist" aria-label="أقسام الحفظ">
        {TABS.map(({ id, label, hint, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={view === id ? "is-active" : ""}
          >
            <Icon size={15} />
            <span className="mdr-quran-tab-label">{label}</span>
            <span className="mdr-quran-tab-hint">{hint}</span>
          </button>
        ))}
      </div>

      <div className="mdr-quran-body animate-fade-up stagger-3 space-y-4">
        <HifzSection view={view} />
        {/* الختمةُ في «اليوم» وحده: هي حالُ تلاوتك الآن، لا خريطةً ولا مذاكرة.
            وموضعُها تحت جلسة اليوم لا فوقها — الفعلُ المطلوب أوّلاً. */}
        {view === "today" && <KhatmaOrbit />}
      </div>

      <div className="mdr-quran-seal animate-fade-up stagger-4">
        <QuranBanner />
      </div>
    </div>
  );
}
