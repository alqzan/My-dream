"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { BookMarked, BookOpen, Check, ChevronLeft, Flame, Sprout } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { buildDayDigest } from "@/lib/assistantContext";
import { arNum } from "@/lib/madar/format";
import { SECTION } from "@/lib/palette";
import { buzz, cn, graceStreak, quranActivityDates, today, type GraceStreak } from "@/lib/utils";
import { MosqueIcon } from "@/components/icons/MosqueIcon";

interface PeekSpec {
  key: string;
  href: string;
  label: string;
  hint: string;
  color: string;
  wash: string;
  icon: ReactNode;
  done: boolean;
  streak?: GraceStreak;
}

function streakText(days: number): string {
  return `ستريك ${arNum(days)} يوم`;
}

function PeekRow({ peek }: { peek: PeekSpec }) {
  return (
    <Link
      href={peek.href}
      className={cn("mdr-lobby-peek press", peek.done ? "is-done" : "is-pending")}
      style={{
        ["--peek-color" as string]: peek.color,
        ["--peek-wash" as string]: peek.wash,
      }}
    >
      <span className="mdr-lobby-peek-icon" aria-hidden="true">{peek.icon}</span>
      <span className="mdr-lobby-peek-copy">
        <strong>{peek.label}</strong>
        <small>{peek.hint}</small>
        {peek.streak && peek.streak.days >= 2 && (
          <span className="mdr-lobby-peek-streak">
            <Flame size={12} strokeWidth={2.4} aria-hidden="true" />
            {streakText(peek.streak.days)}{peek.streak.graceDay ? " · باقي اليوم" : ""}
          </span>
        )}
      </span>
      {peek.done && <span className="mdr-lobby-peek-value" aria-label="تم"><Check size={13} strokeWidth={3} /></span>}
      <ChevronLeft className="mdr-lobby-peek-chevron" size={16} aria-hidden="true" />
    </Link>
  );
}

// لمحات خفيفة تربط البهو بأقسام مدار. لا تُحوّل البهو إلى شاشة إدارة؛
// التفاصيل والتسجيل يظلّان داخل كل قسم، بينما تعرض هذه القائمة تذكيراً سريعاً
// بما يستحق انتباهك اليوم.
export function DayDigestCard({ compact = false }: { compact?: boolean } = {}) {
  const transactions = useAppStore((s) => s.transactions);
  const dailyBudget = useAppStore((s) => s.dailyBudget);
  const prayerLogs = useAppStore((s) => s.prayerLogs);
  const habits = useAppStore((s) => s.habits);
  const frozenHabits = useAppStore((s) => s.frozenHabits);
  const journalEntries = useAppStore((s) => s.journalEntries);
  const readingLogs = useAppStore((s) => s.readingLogs);
  const quranWird = useAppStore((s) => s.quranWird);
  const quranHifz = useAppStore((s) => s.quranHifz);
  const quranReflections = useAppStore((s) => s.quranReflections);
  const quranKhatma = useAppStore((s) => s.quranKhatma);
  const toggleHabitLog = useAppStore((s) => s.toggleHabitLog);

  const todayStr = today();
  const wirdStreak = useMemo(
    () => graceStreak([...quranActivityDates({ quranWird, quranHifz, quranReflections, quranKhatma })]),
    [quranWird, quranHifz, quranReflections, quranKhatma]
  );
  const journalStreak = useMemo(
    () => graceStreak(journalEntries.map((entry) => entry.date)),
    [journalEntries]
  );
  const digest = useMemo(
    () => buildDayDigest({
      transactions,
      dailyBudget,
      prayerLogs,
      habits,
      frozenHabits,
      journalEntries,
      readingLogs,
      quranWird,
      quranHifz,
      quranReflections,
      quranKhatma,
    }),
    [
      transactions,
      dailyBudget,
      prayerLogs,
      habits,
      frozenHabits,
      journalEntries,
      readingLogs,
      quranWird,
      quranHifz,
      quranReflections,
      quranKhatma,
    ]
  );

  const missingPrayers = Math.max(0, 5 - digest.prayed);
  const peeks: PeekSpec[] = [
    {
      key: "quran",
      href: "/quran",
      label: digest.wirdDone ? "وردك مقروء اليوم" : "ما قريت وردك اليوم",
      hint: digest.wirdDone ? "أحسنت، واصل على نفس الخط" : "افتح القرآن واقرأ وردك الآن",
      color: SECTION.brand,
      wash: "#f6ecd9",
      icon: <Sprout size={18} strokeWidth={1.9} />,
      done: digest.wirdDone,
      streak: wirdStreak,
    },
    {
      key: "prayer",
      href: "/prayers",
      label: missingPrayers === 1 ? "باقي صلاة ما سجلتها" : missingPrayers ? `باقي ${arNum(missingPrayers)} صلوات ما سجلتها` : "صلواتك مسجلة اليوم",
      hint: missingPrayers ? "سجلها قبل ما يخلص اليوم" : "أحسنت، يومك مكتمل",
      color: SECTION.prayer,
      wash: "#e2efeb",
      icon: <MosqueIcon size={18} />,
      done: missingPrayers === 0,
    },
    {
      key: "journal",
      href: "/journal",
      label: digest.journalWritten ? "مذكرتك مكتوبة اليوم" : "ما كتبت مذكرتك اليوم",
      hint: digest.journalWritten ? "جميل، خلك قريب من يومك" : "اكتب سطرًا واحدًا الآن",
      color: SECTION.journal,
      wash: "#eee9f4",
      icon: <BookMarked size={17} strokeWidth={1.9} />,
      done: digest.journalWritten,
      streak: journalStreak,
    },
    {
      key: "reading",
      href: "/reading",
      label: digest.readingDone ? "سجلت قراءة اليوم" : "ما سجلت قراءة اليوم",
      hint: digest.readingDone ? "خطوتك محسوبة" : "افتح المحبرة وسجل خطوتك",
      color: SECTION.reading,
      wash: "#f5e9e2",
      icon: <BookOpen size={17} strokeWidth={1.9} />,
      done: digest.readingDone,
    },
  ];

  const customHabits = habits.filter((habit) => !(frozenHabits ?? []).includes(habit.id));

  return (
    <section
      className={cn("mdr-lobby-peeks", compact && "mdr-lobby-peeks--compact")}
      aria-labelledby="lobby-peeks-title"
    >
      <div className="mdr-lobby-peeks-head">
        <h2 id="lobby-peeks-title">لمحات اليوم</h2>
        <span>على السريع</span>
      </div>

      <div className="mdr-lobby-peeks-list">
        {peeks.map((peek) => <PeekRow key={peek.key} peek={peek} />)}

        {customHabits.map((habit) => {
          const logs = habit.logs ?? [];
          const done = logs.includes(todayStr);
          const streak = graceStreak(logs);
          const color = habit.color || SECTION.brand;
          return (
            <button
              key={habit.id}
              type="button"
              className={cn("mdr-lobby-peek mdr-lobby-peek--habit press", done ? "is-done" : "is-pending")}
              style={{
                ["--peek-color" as string]: color,
                ["--peek-wash" as string]: `${color}16`,
              }}
              onClick={() => {
                if (!done) buzz();
                toggleHabitLog(habit.id, todayStr);
              }}
              aria-pressed={done}
            >
              <span className="mdr-lobby-peek-icon" aria-hidden="true">{habit.icon || "⭐"}</span>
              <span className="mdr-lobby-peek-copy">
                <strong>{done ? `أنجزت ${habit.name} اليوم` : `ما أنجزت ${habit.name} اليوم`}</strong>
                <small>{done ? "ممتاز، استمر" : "اضغط هنا بعد ما تخلصها"}</small>
                {streak.days >= 2 && (
                  <span className="mdr-lobby-peek-streak">
                    <Flame size={12} strokeWidth={2.4} aria-hidden="true" />
                    {streakText(streak.days)}{streak.graceDay ? " · باقي اليوم" : ""}
                  </span>
                )}
              </span>
              {done && <span className="mdr-lobby-peek-value" aria-label="تم"><Check size={13} strokeWidth={3} /></span>}
              <span className="mdr-lobby-peek-chevron mdr-lobby-peek-chevron--dot" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
