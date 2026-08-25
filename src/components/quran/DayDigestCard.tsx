"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  BookMarked,
  BookOpen,
  Check,
  ChevronLeft,
  Flame,
  Hourglass,
  Play,
  Snowflake,
  Sprout,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { buildDayDigest } from "@/lib/assistantContext";
import { arNum } from "@/lib/madar/format";
import { SECTION } from "@/lib/palette";
import { buzz, cn, graceStreak, quranActivityDates, today, type GraceStreak } from "@/lib/utils";

interface RitualSpec {
  key: string;
  freezeKey: string;
  name: string;
  status: string;
  hint: string;
  color: string;
  wash: string;
  icon: ReactNode;
  done: boolean;
  streak: GraceStreak;
  href?: string;
  onToggle?: () => void;
}

interface FrozenSpec {
  key: string;
  name: string;
  color: string;
  icon: ReactNode;
}

function streakLabel(streak: GraceStreak): string {
  if (streak.days === 0) return "ابدأ اليوم";
  if (streak.days === 1) return "يوم متصل";
  if (streak.days === 2) return "يومان متصلان";
  return `${arNum(streak.days)} أيام متصلة`;
}

function StreakLine({ streak }: { streak: GraceStreak }) {
  return (
    <span
      className="mdr-daily-rhythm-streak"
      aria-label={`السلسلة: ${streakLabel(streak)}${streak.graceDay ? "، مهلة يوم واحد" : ""}`}
    >
      <Flame size={11} strokeWidth={2.4} aria-hidden="true" />
      {streakLabel(streak)}
      {streak.graceDay && <Hourglass size={11} strokeWidth={2.3} aria-hidden="true" />}
    </span>
  );
}

function StatusMark({ done, name }: { done: boolean; name: string }) {
  return (
    <span
      className={cn("mdr-daily-rhythm-status", done && "is-done")}
      aria-label={done ? `${name}: أُنجزت اليوم` : `${name}: لم تُنجز اليوم`}
    >
      {done ? <Check size={14} strokeWidth={3} /> : <span aria-hidden="true" />}
    </span>
  );
}

function FreezeAction({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="mdr-daily-rhythm-freeze press"
      onClick={() => {
        buzz();
        onClick();
      }}
      aria-label={`جمّد ${name} مؤقتًا`}
      title={`جمّد ${name} مؤقتًا`}
    >
      <Snowflake size={14} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}

function RitualRow({ ritual, onFreeze }: { ritual: RitualSpec; onFreeze: () => void }) {
  const content = (
    <>
      <span className="mdr-daily-rhythm-icon" aria-hidden="true">{ritual.icon}</span>
      <span className="mdr-daily-rhythm-copy">
        <strong>{ritual.name}</strong>
        <span className={cn("mdr-daily-rhythm-state", ritual.done && "is-done")}>{ritual.status}</span>
        <span className="mdr-daily-rhythm-detail">
          <span>{ritual.hint}</span>
          <span className="mdr-daily-rhythm-separator" aria-hidden="true">·</span>
          <StreakLine streak={ritual.streak} />
        </span>
      </span>
      <ChevronLeft className="mdr-daily-rhythm-chevron" size={16} aria-hidden="true" />
    </>
  );

  return (
    <div
      className={cn("mdr-daily-rhythm-row", ritual.done ? "is-done" : "is-pending")}
      style={{
        ["--rhythm-color" as string]: ritual.color,
        ["--rhythm-wash" as string]: ritual.wash,
      }}
    >
      {ritual.href ? (
        <Link
          href={ritual.href}
          className="mdr-daily-rhythm-main press"
          aria-label={`${ritual.name}: ${ritual.status}. ${ritual.hint}`}
        >
          {content}
        </Link>
      ) : (
        <button
          type="button"
          className="mdr-daily-rhythm-main press"
          onClick={ritual.onToggle}
          aria-pressed={ritual.done}
          aria-label={`${ritual.name}: ${ritual.status}`}
        >
          {content}
        </button>
      )}
      <StatusMark done={ritual.done} name={ritual.name} />
      <FreezeAction name={ritual.name} onClick={onFreeze} />
    </div>
  );
}

function FrozenRow({ item, onResume }: { item: FrozenSpec; onResume: () => void }) {
  return (
    <div className="mdr-daily-rhythm-frozen-row">
      <span
        className="mdr-daily-rhythm-frozen-icon"
        style={{ ["--rhythm-color" as string]: item.color }}
        aria-hidden="true"
      >
        {item.icon}
      </span>
      <span className="mdr-daily-rhythm-frozen-copy">
        <strong>{item.name}</strong>
        <small>مجمّدة مؤقتًا · لا تدخل في السلسلة</small>
      </span>
      <button
        type="button"
        className="mdr-daily-rhythm-resume press"
        onClick={() => {
          buzz();
          onResume();
        }}
        aria-label={`استئناف ${item.name}`}
      >
        <Play size={11} strokeWidth={2.5} aria-hidden="true" />
        استئناف
      </button>
    </div>
  );
}

// قائمة اليوم ليست شاشة إدارة ولا مقتطفات من المصحف؛ هي حالة مختصرة وصادقة
// تربط كل طقس بقسمه. عرض القرآن الفعلي يبقى داخل صفحة المصحف حتى لا نقتطع آية
// أو نستخدم نصاً قرآنياً للزينة داخل البهو.
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
  const toggleFreezeHabit = useAppStore((s) => s.toggleFreezeHabit);

  const todayStr = today();
  const frozen = useMemo(() => new Set(frozenHabits ?? []), [frozenHabits]);
  const quranDates = useMemo(
    () => quranActivityDates({ quranWird, quranHifz, quranReflections, quranKhatma }),
    [quranWird, quranHifz, quranReflections, quranKhatma]
  );
  const wirdStreak = useMemo(() => graceStreak([...quranDates]), [quranDates]);
  const journalStreak = useMemo(
    () => graceStreak(journalEntries.map((entry) => entry.date)),
    [journalEntries]
  );
  const readingStreak = useMemo(
    () => graceStreak(readingLogs.map((entry) => entry.date)),
    [readingLogs]
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

  const coreRituals: RitualSpec[] = [
    {
      key: "quran",
      freezeKey: "core:wird",
      name: "القرآن",
      status: digest.wirdDone ? "أُنجز القرآن اليوم" : "لم تقرأ وردك اليوم",
      hint: digest.wirdDone ? "نشاطك محفوظ في قسم القرآن" : "افتح المصحف وأكمل وردك",
      color: SECTION.quran,
      wash: "#e2efe8",
      icon: <Sprout size={18} strokeWidth={1.9} />,
      done: digest.wirdDone,
      streak: wirdStreak,
      href: "/quran",
    },
    {
      key: "journal",
      freezeKey: "core:journal",
      name: "المذكرة",
      status: digest.journalWritten ? "كتبت مذكرة اليوم" : "لم تكتب مذكرة اليوم",
      hint: digest.journalWritten ? "مذكرتك محفوظة" : "اكتب فكرة سريعة",
      color: SECTION.journal,
      wash: "#eee9f4",
      icon: <BookMarked size={17} strokeWidth={1.9} />,
      done: digest.journalWritten,
      streak: journalStreak,
      href: "/journal",
    },
    {
      key: "reading",
      freezeKey: "core:reading",
      name: "القراءة",
      status: digest.readingDone ? "سجّلت قراءة اليوم" : "لم تسجّل قراءة اليوم",
      hint: digest.readingDone ? "قراءة اليوم محفوظة" : "سجّل ما قرأت",
      color: SECTION.reading,
      wash: "#f5e9e2",
      icon: <BookOpen size={17} strokeWidth={1.9} />,
      done: digest.readingDone,
      streak: readingStreak,
      href: "/reading",
    },
  ];

  const activeCore = coreRituals.filter((ritual) => !frozen.has(ritual.freezeKey));
  const frozenCore: FrozenSpec[] = coreRituals
    .filter((ritual) => frozen.has(ritual.freezeKey))
    .map((ritual) => ({
      key: ritual.freezeKey,
      name: ritual.name,
      color: ritual.color,
      icon: ritual.icon,
    }));
  const activeHabits: RitualSpec[] = habits
    .filter((habit) => !frozen.has(habit.id))
    .map((habit) => {
      const done = (habit.logs ?? []).includes(todayStr);
      const color = habit.color || SECTION.brand;
      return {
        key: habit.id,
        freezeKey: habit.id,
        name: habit.name,
        status: done ? "أُنجزت اليوم" : "لم تُنجز اليوم",
        hint: done ? "محفوظة اليوم" : "اضغط عند الإنجاز",
        color,
        wash: `${color}16`,
        icon: habit.icon || "⭐",
        done,
        streak: graceStreak(habit.logs ?? []),
        onToggle: () => {
          if (!done) buzz();
          toggleHabitLog(habit.id, todayStr);
        },
      };
    });
  const frozenCustom: FrozenSpec[] = habits
    .filter((habit) => frozen.has(habit.id))
    .map((habit) => ({
      key: habit.id,
      name: habit.name,
      color: habit.color || SECTION.brand,
      icon: habit.icon || "⭐",
    }));
  const activeRituals = [...activeCore, ...activeHabits];
  const frozenItems = [...frozenCore, ...frozenCustom];
  const doneCount = activeRituals.filter((ritual) => ritual.done).length;
  const countLabel = activeRituals.length > 0
    ? `${arNum(doneCount)} من ${arNum(activeRituals.length)}`
    : "كلها مجمّدة";

  return (
    <section
      className={cn("mdr-daily-rhythm", compact && "mdr-daily-rhythm--compact")}
      aria-labelledby="daily-rhythm-title"
    >
      <header className="mdr-daily-rhythm-head">
        <div>
          <h2 id="daily-rhythm-title">اليوم</h2>
        </div>
        <span className="mdr-daily-rhythm-count">{countLabel}</span>
      </header>

      <div className="mdr-daily-rhythm-list">
        {activeRituals.map((ritual) => (
          <RitualRow
            key={ritual.key}
            ritual={ritual}
            onFreeze={() => toggleFreezeHabit(ritual.freezeKey)}
          />
        ))}
        {activeRituals.length === 0 && (
          <p className="mdr-daily-rhythm-empty">ما عليك شيء الآن؛ العناصر المجمّدة ظاهرة تحت.</p>
        )}
      </div>

      {frozenItems.length > 0 && (
        <div className="mdr-daily-rhythm-frozen">
          <div className="mdr-daily-rhythm-frozen-head">
            <span>
              <Snowflake size={14} strokeWidth={2.2} aria-hidden="true" />
              <strong>مجمّد مؤقتًا ({arNum(frozenItems.length)})</strong>
            </span>
            <small>لا يدخل في السلسلة</small>
          </div>
          <div className="mdr-daily-rhythm-frozen-list">
            {frozenItems.map((item) => (
              <FrozenRow
                key={item.key}
                item={item}
                onResume={() => toggleFreezeHabit(item.key)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
