"use client";
import { useState } from "react";
import type { MergedSource } from "@/lib/types";
import { entriesCount, displayTime } from "@/lib/utils";
import { plainTitle } from "@/lib/markdown";
import { Combine, ChevronDown } from "lucide-react";

// ===================== شارةُ «مدموجة» =====================
// وجودُ هذه الشارة هو الفرق بين دمجٍ معلومٍ ودمجٍ عشوائيّ: المذكرة تقول عن
// نفسها إنّها مركّبة، **وتُفصّل** مصادرها — وقتَ كلٍّ وعنوانَه وطولَ نصّه وعددَ
// وسائطه كما كانت قبل الدمج. فمَن فتحها بعد سنةٍ يعرف أنّ ما يقرؤه ثلاثُ
// مذكراتٍ من يومٍ واحد، لا نصٌّ واحدٌ كُتب هكذا.

/** شارةٌ صغيرة داخل بطاقة القائمة — عددٌ فقط، بلا تفصيل. */
export function MergeChip({ count }: { count: number }) {
  return (
    <span
      className="flex items-center gap-1 text-[10px] font-bold text-journal bg-journal/10 px-1.5 py-0.5 rounded-full shrink-0"
      title={`مدموجة من ${entriesCount(count)}`}
    >
      <Combine size={10} />
      {count}
    </span>
  );
}

/** اللوحة المفصّلة داخل المذكرة المفتوحة — تُفتح بضغطة. */
export function MergeBadge({ sources }: { sources: MergedSource[] }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;

  const totalChars = sources.reduce((s, x) => s + x.chars, 0);

  return (
    <div className="rounded-xl border border-journal/25 bg-journal/[0.06] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-start press"
      >
        <Combine size={14} className="text-journal shrink-0" />
        <span className="flex-1 text-[12px] font-bold text-journal">
          مذكرةٌ مدموجة من {entriesCount(sources.length)} في هذا اليوم
        </span>
        <ChevronDown
          size={14}
          className={`text-journal/70 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-3 pb-2.5 space-y-1.5">
          <p className="text-[11px] text-gray-500 leading-relaxed">
            نصُّ كلٍّ منها باقٍ كما كُتب تحت عنوانٍ يحمل وقتها، والصور والأصوات
            والوسوم مضمومةٌ بلا حذف. هذه بصمةُ كلّ مصدرٍ قبل الدمج:
          </p>
          <ul className="space-y-1">
            {sources.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 text-[11px] bg-[var(--surface)] rounded-lg px-2.5 py-1.5"
              >
                <span className="font-bold text-journal tabular-nums shrink-0">
                  {displayTime(s.time) ?? "—"}
                </span>
                <span className="flex-1 min-w-0 truncate text-gray-600">
                  {/* بلا عنوانٍ لا نكتب «بلا عنوان»: الوقتُ وعددُ الحروف حوله
                      يعرّفان المقطع، والعبارةُ المكرَّرة ضجيجٌ لا خبر. */}
                  {plainTitle(s.title)}
                </span>
                <span className="text-gray-400 tabular-nums shrink-0">
                  {s.chars} حرفاً
                  {s.photos > 0 && ` · ${s.photos} صورة`}
                  {s.audios > 0 && ` · ${s.audios} صوت`}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-gray-400 tabular-nums">
            المجموع {totalChars} حرفاً — وهو ما بين يديك الآن.
          </p>
        </div>
      )}
    </div>
  );
}
