"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Sunrise, Moon, X } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { buildNudge, type Nudge } from "@/lib/nudges";
import {
  nudgeHidden, nudgeToken, nudgesEnabled, readNudgePrefs, writeNudgePrefs,
} from "@/lib/nudgePrefs";
import { countDayPrayers, getPrayerLog, today } from "@/lib/utils";

// ===================== بطاقةُ التذكير اللطيف =====================
// موضعُها البهو **وحدَه**. تكرارُها في رأس كلّ قسمٍ كان سيجعلها إطاراً يُمسح
// بالعين قبل أن يُقرأ — وهو ما اشترط المالك ألّا يقع.
//
// **والصياغةُ كلُّها في `src/lib/nudges.ts`** (نقيّ ومختبَر): هنا رسمٌ فقط. لا
// تكتب جملةً واحدة من جمل التذكير في هذا الملف — الصياغةُ هي الميزة، ونسختان
// منها تفترقان عند أوّل تعديل.
//
// **والساعةُ بعد الترطيب لا قبله**: لحظةُ اليوم (افتتاحٌ أم حصاد) لا يعرفها
// البناءُ الثابت، فلو حُسبت في الرسم الأوّل لاختلف نصُّ الخادم عن العميل ووقع
// تعارضُ ترطيب. فتبدأ البطاقةُ فارغةً وتملأ نفسَها في `useEffect`.
export function NudgeCard() {
  const journalEntries = useAppStore((s) => s.journalEntries);
  const readingLogs = useAppStore((s) => s.readingLogs);
  const books = useAppStore((s) => s.books);
  const habits = useAppStore((s) => s.habits);
  const frozenHabits = useAppStore((s) => s.frozenHabits);
  const quranWird = useAppStore((s) => s.quranWird);
  const quranHifz = useAppStore((s) => s.quranHifz);
  const quranReflections = useAppStore((s) => s.quranReflections);
  const quranKhatma = useAppStore((s) => s.quranKhatma);
  const prayerLogs = useAppStore((s) => s.prayerLogs);

  // `null` = قبل الترطيب: لا نرسم شيئاً.
  const [clock, setClock] = useState<{ todayStr: string; hour: number } | null>(null);
  const [hidden, setHidden] = useState<string | null>(null);
  const [off, setOff] = useState(false);

  useEffect(() => {
    const prefs = readNudgePrefs();
    setOff(!nudgesEnabled(prefs));
    setHidden(prefs.hidden ?? null);
    const refresh = () => {
      const now = new Date();
      setClock({ todayStr: today(), hour: now.getHours() });
    };
    refresh();
    // منتصفُ الليل وعبورُ السادسة مساءً كلاهما يقلب البطاقة؛ وعودةُ التطبيق من
    // الخلفية أكثرُ ما يقع عملياً على الجوّال.
    const id = setInterval(refresh, 5 * 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const prayed = useMemo(
    () => (clock ? countDayPrayers(getPrayerLog(prayerLogs, clock.todayStr)).prayed : 0),
    [prayerLogs, clock]
  );

  const nudge: Nudge | null = useMemo(() => {
    if (!clock) return null;
    return buildNudge(
      { journalEntries, readingLogs, books, habits, frozenHabits, quranWird, quranHifz, quranReflections, quranKhatma },
      { todayStr: clock.todayStr, hour: clock.hour, extras: { prayed } }
    );
  }, [clock, journalEntries, readingLogs, books, habits, frozenHabits, quranWird, quranHifz, quranReflections, quranKhatma, prayed]);

  const token = clock && nudge ? nudgeToken(clock.todayStr, nudge.moment) : null;

  const dismiss = useCallback(() => {
    if (!token) return;
    setHidden(token);
    writeNudgePrefs({ ...readNudgePrefs(), hidden: token });
  }, [token]);

  if (off || !nudge || !token) return null;
  if (nudgeHidden({ hidden: hidden ?? undefined }, token)) return null;

  const evening = nudge.moment === "evening";
  const Icon = evening ? Moon : Sunrise;

  return (
    <section
      className="mdr-home-nudge bg-[var(--surface)] rounded-2xl card-shadow border border-[var(--border-subtle)] p-4"
      aria-label="تذكير"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={16} className="text-brand-600 shrink-0" aria-hidden />
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{nudge.title}</h2>
        </div>
        {/* الإخفاءُ للحظةِ اليوم وحدها — لا إطفاءَ دائم. الإطفاءُ الدائم في
            الإعدادات، فلا تُفقد الميزةُ بضغطةٍ عابرة. */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="أخفِ تذكير هذه اللحظة"
          className="shrink-0 w-7 h-7 -me-1 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-500 press"
        >
          <X size={14} />
        </button>
      </div>

      <ul className="space-y-2.5">
        {nudge.lines.map((line, i) => {
          const body = (
            <>
              <span
                aria-hidden
                className={`mt-[7px] shrink-0 w-1.5 h-1.5 rounded-full ${
                  line.done ? "bg-brand-600" : "bg-gray-300 dark:bg-white/25"
                }`}
              />
              <span className="flex-1 min-w-0">
                <span
                  className={`block text-[13px] leading-relaxed ${
                    line.done ? "text-gray-500 dark:text-gray-400" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {line.text}
                </span>
                {line.place && (
                  <span className="block text-[11px] text-gray-400 mt-0.5">{line.place}</span>
                )}
              </span>
              {line.href && <ChevronLeft size={14} className="shrink-0 mt-1 text-gray-300" aria-hidden />}
            </>
          );
          return (
            <li key={`${line.key}-${i}`}>
              {line.href ? (
                <Link href={line.href} className="flex items-start gap-2.5 press rounded-lg">
                  {body}
                </Link>
              ) : (
                <span className="flex items-start gap-2.5">{body}</span>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 pt-3 border-t border-[var(--border-subtle)] text-[11px] text-gray-400 leading-relaxed">
        {nudge.closing}
      </p>
    </section>
  );
}
