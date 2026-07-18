"use client";
import { useState } from "react";
import { SectionSignet } from "@/components/layout/SectionSignet";
import { Sprout, BookOpenText } from "lucide-react";

// قسم «قرآن» — عمودان: التدبّر (تأمّلات + آية اليوم) والحفظ (محفوظ + مراجعة
// متباعدة + مدار الختمة). العنوان دعاءٌ نبويّ، وتحته بطاقة «خلاصة اليوم» ثم
// عبارة قرآنية متجدّدة. تُبنى المكوّنات ميزةً ميزة؛ هذا الهيكل يجمعها.
type Tab = "tadabbur" | "hifz";

export default function QuranPage() {
  const [tab, setTab] = useState<Tab>("tadabbur");

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3 animate-fade-up">
        <SectionSignet href="/quran" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">قرآن</h1>
          <p className="text-sm text-quran font-semibold mt-0.5">اللهم اجعل القرآن ربيع قلبي</p>
        </div>
      </div>

      {/* مبدّل العمودين */}
      <div className="flex gap-1.5 p-1 rounded-2xl bg-quran/10 animate-fade-up stagger-1">
        <TabButton active={tab === "tadabbur"} onClick={() => setTab("tadabbur")} icon={<Sprout size={15} />} label="التدبّر" />
        <TabButton active={tab === "hifz"} onClick={() => setTab("hifz")} icon={<BookOpenText size={15} />} label="الحفظ" />
      </div>

      {tab === "tadabbur" ? (
        <div className="animate-fade-up stagger-2 space-y-4">
          <Placeholder title="التدبّر" note="آية اليوم وتأمّلاتك عليها — قريباً." />
        </div>
      ) : (
        <div className="animate-fade-up stagger-2 space-y-4">
          <Placeholder title="الحفظ" note="محفوظك ومراجعتك ومدار الختمة — قريباً." />
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

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-quran/30 p-6 text-center">
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <p className="text-xs text-gray-400 mt-1">{note}</p>
    </div>
  );
}
