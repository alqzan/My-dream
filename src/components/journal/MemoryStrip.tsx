"use client";
import type { JournalEntry } from "@/lib/types";
import { formatDateShort, parseDate } from "@/lib/utils";
import { entryPhotoSources } from "@/lib/mediaSources";
import { useMediaCacheVersion, resolveMediaSlots } from "@/components/ui/useMedia";
import { stripMarkdown, plainTitle } from "@/lib/markdown";
import { AppImage } from "@/components/ui/AppImage";
import { CalendarHeart } from "lucide-react";

// ===================== «في مثل هذا اليوم» =====================
// كانت أسطراً نصّيةً مقصوصةً داخل بطاقة — تُقرأ كقائمة نتائج بحثٍ لا كذكرى.
// هنا بطاقاتٌ أفقية تنزلق بالإصبع، كلٌّ منها صورةُ ذلك اليوم كاملةً خلف تدرّجٍ
// داكن، وعليها «قبل سنتين» بخطٍّ كبير. المذكرة بلا صورةٍ لا تُترك رمادية:
// تأخذ تدرّجاً بنفسجياً من هوية القسم فتبقى الشريطُ متساوقاً.

const GRADIENTS = [
  "linear-gradient(150deg, #6f5299, #3d2f57)",
  "linear-gradient(150deg, #8a6fb0, #4a3a6b)",
  "linear-gradient(150deg, #b07a5a, #5a3a2f)",
  "linear-gradient(150deg, #4a7f8f, #24414d)",
];

function yearsAgoLabel(from: string, to: string): string {
  const n = parseDate(to).getFullYear() - parseDate(from).getFullYear();
  if (n <= 0) return "هذا العام";
  if (n === 1) return "قبل سنة";
  if (n === 2) return "قبل سنتين";
  if (n <= 10) return `قبل ${n} سنوات`;
  return `قبل ${n} سنة`;
}

export function MemoryStrip({
  memories,
  todayStr,
  onOpen,
}: {
  memories: JournalEntry[];
  todayStr: string;
  onOpen: (entry: JournalEntry) => void;
}) {
  // اشتراكٌ واحدٌ للشريط كلّه — البطاقات بعده مجرّد رسم.
  useMediaCacheVersion();
  if (!memories.length) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 px-0.5">
        <CalendarHeart size={16} className="text-brand-600" />
        <span className="text-sm font-bold text-gray-800">في مثل هذا اليوم</span>
        <span className="text-[11px] text-gray-400 tabular-nums">{memories.length}</span>
      </div>

      {/* انزلاقٌ أفقيّ بمحاذاةٍ قافزة — يقف كلّ سحبٍ على بطاقةٍ كاملة. */}
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory scrollbar-none">
        {memories.map((m, i) => {
          const cover = resolveMediaSlots(entryPhotoSources(m).slice(0, 1))[0];
          const hasCover = entryPhotoSources(m).length > 0;
          const text = stripMarkdown(m.content).slice(0, 90);
          return (
            <button
              key={m.id}
              onClick={() => onOpen(m)}
              className="relative shrink-0 w-40 h-52 rounded-2xl overflow-hidden snap-start text-start press card-shadow"
              style={hasCover ? undefined : { backgroundImage: GRADIENTS[i % GRADIENTS.length] }}
            >
              {hasCover &&
                (cover ? (
                  <AppImage src={cover} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 bg-gray-200 dark:bg-white/10 animate-pulse" aria-hidden />
                ))}
              {/* تدرّجٌ داكنٌ من الأسفل — النصّ مقروءٌ فوق أيّ صورة */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/5" aria-hidden />

              <span className="absolute top-2 start-2 text-[10px] font-black text-[#3a2a12] bg-[#e8c67a] px-2 py-0.5 rounded-full">
                {yearsAgoLabel(m.date, todayStr)}
              </span>

              <span className="absolute inset-x-0 bottom-0 p-2.5 flex flex-col gap-0.5">
                <span className="text-[10px] font-medium text-white/70">{formatDateShort(m.date)}</span>
                {plainTitle(m.title) ? (
                  <span className="text-[13px] font-black text-white leading-snug line-clamp-2">{plainTitle(m.title)}</span>
                ) : null}
                <span className="text-[11px] text-white/85 leading-snug line-clamp-2">{text}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
