"use client";
import { useMemo } from "react";
import type { JournalEntry } from "@/lib/types";
import { groupJournalByDay } from "@/lib/journalTimeline";
import { hijriDay, parseDate, today, entriesCount } from "@/lib/utils";
import { JournalEntryCard } from "./JournalEntryCard";
import { Combine } from "lucide-react";

// ===================== الخطّ الزمني للمذكرات =====================
// كانت القائمة بطاقاتٍ متساويةً تحت عنوان شهر، فيضيع «اليوم»: مذكرتان في يومٍ
// واحد تبدوان يومين، وكلّ بطاقةٍ تُعيد طباعة تاريخها. هنا مسارٌ رأسيّ واحد
// تتفرّع منه الأيام: حبّةُ يومٍ تحمل رقمه واسمه ويومه الهجري، وتحتها مذكراتُه
// مرتّبةً بالأحدث وقتاً — فيُقرأ الأرشيف كشريطِ حياةٍ لا كقائمةِ ملفّات.

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

interface JournalTimelineProps {
  entries: JournalEntry[];
  onOpen: (entry: JournalEntry) => void;
  onDelete: (id: string) => void;
  onToggleStar: (id: string) => void;
  /** فتحُ «يوم كامل» (DayView) من حبّة اليوم. */
  onOpenDay?: (date: string) => void;
  /** فتحُ لوحة دمج مذكرات هذا اليوم — تظهر فقط حين تتعدّد مذكراتُه. */
  onMergeDay?: (date: string) => void;
}

export function JournalTimeline({ entries, onOpen, onDelete, onToggleStar, onOpenDay, onMergeDay }: JournalTimelineProps) {
  const months = useMemo(() => groupJournalByDay(entries), [entries]);
  const todayStr = today();

  return (
    <div className="space-y-6">
      {months.map((month) => (
        <section key={month.key} className="space-y-3">
          {/* رأس الشهر — يلتصق أثناء التمرير فلا يضيع السياق. على الجوّال يقف
              **تحت** الترويسة اللاصقة (`MobileHeader`، نحو 3.25rem) لا خلفها،
              وعلى الحاسوب لا ترويسةَ علوية فيلتصق بالحافّة. */}
          {/* الخلفية **صمّاء** بنمطٍ سطريّ لا `bg-[var(--page-bg)]/85`: معدِّل
              الشفافية لا يعمل على لونٍ من متغيّر CSS في Tailwind 3، فيخرج
              الرأسُ شفافاً تماماً — فترى صورَ المذكرات تمرّ من خلفه. */}
          <div
            className="sticky top-[3.25rem] lg:top-0 z-10 -mx-1 px-1 py-1.5"
            style={{ backgroundColor: "var(--page-bg)" }}
          >
            <div className="flex items-center gap-3">
              <span className="text-xs font-black text-journal bg-journal/10 px-3 py-1 rounded-full">
                {month.label}
              </span>
              <div className="flex-1 h-px bg-[var(--border-subtle)]" />
              <span className="text-[10px] text-gray-400 tabular-nums">{entriesCount(month.count)}</span>
            </div>
          </div>

          <div className="space-y-4">
            {month.days.map((day) => {
              const d = parseDate(day.date);
              const isToday = day.date === todayStr;
              return (
                <div key={`${day.date}-${day.entries[0]?.id}`} className="relative">
                  {/* المسار الرأسيّ — يبدأ من تحت الحبّة ويصل آخر البطاقات */}
                  <div
                    className="absolute top-11 bottom-0 w-px bg-gradient-to-b from-journal/30 to-transparent"
                    style={{ insetInlineStart: "1.0625rem" }}
                    aria-hidden
                  />

                  {/* حبّة اليوم — ومعها «ادمج» حين تتعدّد مذكراته */}
                  <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => onOpenDay?.(day.date)}
                    disabled={!onOpenDay}
                    className={`flex items-center gap-2.5 rounded-xl ${onOpenDay ? "press" : ""}`}
                    aria-label={`يوم ${day.date}`}
                  >
                    <span
                      className={`w-[2.125rem] h-[2.125rem] shrink-0 rounded-full flex flex-col items-center justify-center leading-none border ${
                        isToday
                          ? "bg-journal text-white border-journal"
                          : "bg-[var(--surface)] text-journal border-journal/25"
                      }`}
                    >
                      <span className="text-[13px] font-black tabular-nums">{d.getDate()}</span>
                      <span className={`text-[7px] tabular-nums ${isToday ? "text-white/75" : "text-gray-400"}`}>
                        {hijriDay(day.date)}
                      </span>
                    </span>
                    <span className="flex flex-col items-start leading-tight">
                      <span className="text-[13px] font-bold text-gray-700">
                        {isToday ? "اليوم" : WEEKDAYS[d.getDay()]}
                      </span>
                      {day.entries.length > 1 && (
                        <span className="text-[10px] text-gray-400 tabular-nums">
                          {entriesCount(day.entries.length)}
                        </span>
                      )}
                    </span>
                  </button>
                  {onMergeDay && day.entries.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onMergeDay(day.date)}
                      className="flex items-center gap-1 text-[11px] font-bold text-journal bg-journal/10 hover:bg-journal/20 rounded-full px-2.5 py-1 press"
                    >
                      <Combine size={12} />
                      ادمج اليوم
                    </button>
                  )}
                  </div>

                  {/* مذكرات اليوم معلّقةٌ على المسار */}
                  <div className="space-y-2.5" style={{ marginInlineStart: "2.75rem" }}>
                    {day.entries.map((entry) => (
                      <JournalEntryCard
                        key={entry.id}
                        entry={entry}
                        onDelete={onDelete}
                        onToggleStar={onToggleStar}
                        onClick={() => onOpen(entry)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
