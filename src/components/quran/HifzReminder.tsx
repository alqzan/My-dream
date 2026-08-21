"use client";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ } from "@/lib/types";
import { today } from "@/lib/utils";
import { hifzTodo } from "@/lib/quran/schedule";
import { BookOpenText, ChevronLeft, Sparkles } from "lucide-react";

// تذكيرٌ لطيف في الرئيسية بورد الحفظ أو المراجعة المستحقّة اليوم — يظهر فقط حين
// تكون هناك خطة حفظ وعملٌ متبقٍّ، ويختفي بمجرّد إنجازه. يفتح تبويب الحفظ مباشرةً.
export function HifzReminder() {
  const hifz = useAppStore((s) => s.quranHifz) ?? EMPTY_HIFZ;
  const { needWird, needReview } = hifzTodo(hifz, today());
  if (!hifz.plan || (!needWird && !needReview)) return null;

  const msg = needWird && needReview
    ? "وردك ومراجعتك ينتظرانك اليوم"
    : needWird
    ? "وردك اليوم ينتظرك"
    : "مراجعتك القرآنية جاهزة";
  const detail = needWird && needReview
    ? "حفظٌ جديد ثم مراجعةٌ قصيرة"
    : needWird
    ? "خطوةٌ هادئة قبل أن ينتهي يومك"
    : "أكمل ما حان موعده من المحفوظ";

  return (
    <Link
      href="/quran?tab=hifz"
      className="mdr-hifz-reminder press"
    >
      <span className="mdr-hifz-reminder-mark" aria-hidden="true">
        <BookOpenText size={19} />
        <Sparkles size={10} className="mdr-hifz-reminder-spark" />
      </span>
      <div className="mdr-hifz-reminder-copy">
        <span className="mdr-hifz-reminder-kicker">ورد القرآن</span>
        <strong>{msg}</strong>
        <small>{detail}</small>
      </div>
      <span className="mdr-hifz-reminder-action">ابدأ <ChevronLeft size={16} /></span>
    </Link>
  );
}
