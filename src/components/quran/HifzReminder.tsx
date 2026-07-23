"use client";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ } from "@/lib/types";
import { today } from "@/lib/utils";
import { hifzTodo } from "@/lib/quran/schedule";
import { GraduationCap, ChevronLeft } from "lucide-react";

// تذكيرٌ لطيف في الرئيسية بورد الحفظ أو المراجعة المستحقّة اليوم — يظهر فقط حين
// تكون هناك خطة حفظ وعملٌ متبقٍّ، ويختفي بمجرّد إنجازه. يفتح تبويب الحفظ مباشرةً.
export function HifzReminder() {
  const hifz = useAppStore((s) => s.quranHifz) ?? EMPTY_HIFZ;
  const { needWird, needReview } = hifzTodo(hifz, today());
  if (!hifz.plan || (!needWird && !needReview)) return null;

  const msg = needWird && needReview
    ? "ورد الحفظ ومراجعتك بانتظارك اليوم"
    : needWird
    ? "ورد الحفظ اليوم بانتظارك"
    : "لديك مراجعة حفظٍ مستحقّة اليوم";

  return (
    <Link
      href="/quran?tab=hifz"
      className="flex items-center gap-3 rounded-2xl border border-quran/25 bg-gradient-to-l from-quran/[0.10] to-transparent p-3.5 press"
    >
      <span className="w-9 h-9 rounded-xl bg-quran/15 text-quran flex items-center justify-center shrink-0">
        <GraduationCap size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-gray-800">{msg}</div>
        <div className="text-[11px] text-gray-400">اضغط للحفظ الموجّه والمراجعة</div>
      </div>
      <ChevronLeft size={18} className="text-quran shrink-0" />
    </Link>
  );
}
