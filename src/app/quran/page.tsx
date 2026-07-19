"use client";
import { useState, useEffect } from "react";
import { SectionSignet } from "@/components/layout/SectionSignet";
import { KhatmaOrbit } from "@/components/quran/KhatmaOrbit";
import { HifzSection } from "@/components/quran/HifzSection";
import { TadabburSection } from "@/components/quran/TadabburSection";
import { MushafBrowser } from "@/components/quran/MushafBrowser";
import { QuranBanner } from "@/components/quran/QuranBanner";
import { Sprout, BookOpenText, BookText } from "lucide-react";

// قسم «قرآن» — التدبّر (تأمّلات + آية اليوم)، الحفظ (محفوظ + مراجعة متباعدة +
// مدار الختمة)، والمصحف (تصفّح كل السور وقراءتها). العنوان دعاءٌ نبويّ، وتحته
// عبارة قرآنية متجدّدة.
type Tab = "tadabbur" | "hifz" | "mushaf";

export default function QuranPage() {
  const [tab, setTab] = useState<Tab>("tadabbur");

  // فتح تبويبٍ محدّد عبر ?tab= (من تذكير الحفظ في الرئيسية مثلاً).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "hifz" || t === "mushaf" || t === "tadabbur") setTab(t);
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3 animate-fade-up">
        <SectionSignet href="/quran" />
        <h1 className="text-2xl font-bold text-gray-900">قرآن</h1>
      </div>

      <div className="animate-fade-up stagger-1">
        <QuranBanner />
      </div>

      {/* مبدّل الأعمدة */}
      <div className="flex gap-1.5 p-1 rounded-2xl bg-quran/10 animate-fade-up stagger-1">
        <TabButton active={tab === "tadabbur"} onClick={() => setTab("tadabbur")} icon={<Sprout size={15} />} label="التدبّر" />
        <TabButton active={tab === "hifz"} onClick={() => setTab("hifz")} icon={<BookOpenText size={15} />} label="الحفظ" />
        <TabButton active={tab === "mushaf"} onClick={() => setTab("mushaf")} icon={<BookText size={15} />} label="المصحف" />
      </div>

      {tab === "tadabbur" && (
        <div className="animate-fade-up stagger-2 space-y-4">
          <TadabburSection />
        </div>
      )}
      {tab === "hifz" && (
        <div className="animate-fade-up stagger-2 space-y-4">
          <HifzSection />
          <KhatmaOrbit />
        </div>
      )}
      {tab === "mushaf" && (
        <div className="animate-fade-up stagger-2">
          <MushafBrowser />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active, onClick, icon, label,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold press transition-colors ${
        active ? "bg-quran text-white shadow-sm" : "text-quran/80 hover:bg-quran/10"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
