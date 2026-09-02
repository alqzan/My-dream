"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookMarked,
  BookOpen,
  Check,
  ChevronLeft,
  Flame,
  Hourglass,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Snowflake,
  Sprout,
  Trash2,
  X,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { buildDayDigest } from "@/lib/assistantContext";
import { arNum } from "@/lib/madar/format";
import { SECTION } from "@/lib/palette";
import {
  buzz, cn, firstGrapheme, graceStreak, quranActivityDates, today, uid, type GraceStreak,
} from "@/lib/utils";

// المقترحاتُ وحدها — وحقلُ الإيموجي مفتوحٌ لأيّ محرفٍ من لوحة المفاتيح.
const HABIT_ICONS = ["⭐", "💪", "🧠", "🙏", "🏃", "📖", "💧", "🥗", "🎯", "😴", "🕌", "✍️", "🚶", "☀️", "🧘"];
const HABIT_COLORS = [SECTION.brand, SECTION.finance, SECTION.journal, SECTION.reading, "#4a9fbd", "#c94f6d"];

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
  /**
   * تعليمُ الطقس منجزاً من علامة الحالة نفسها — لطقسٍ يفتح صفحته بالضغط
   * (`href`) فيبقى بلا وسيلةِ تعليمٍ يدويّة. غيابُها يعني أنّ الإنجاز مشتقٌّ
   * من عملٍ مسجَّلٍ فعلاً، فالعلامةُ خبرٌ لا زرّ.
   */
  onMark?: () => void;
  onEdit?: () => void;
  isCustom?: boolean;
}

interface FrozenSpec {
  key: string;
  name: string;
  color: string;
  icon: ReactNode;
  isCustom?: boolean;
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

function StatusMark({ done, name, onMark }: { done: boolean; name: string; onMark?: () => void }) {
  const mark = done ? <Check size={14} strokeWidth={3} /> : <span aria-hidden="true" />;
  if (!onMark) {
    return (
      <span
        className={cn("mdr-daily-rhythm-status", done && "is-done")}
        aria-label={done ? `${name}: أُنجزت اليوم` : `${name}: لم تُنجز اليوم`}
      >
        {mark}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cn("mdr-daily-rhythm-status is-tappable press", done && "is-done")}
      onClick={(event) => { event.stopPropagation(); buzz(); onMark(); }}
      aria-pressed={done}
      aria-label={done ? `${name}: أُنجزت اليوم — اضغط للتراجع` : `${name}: علّمها منجزة اليوم`}
      title={done ? "تراجَع" : "علّمها منجزة"}
    >
      {mark}
    </button>
  );
}

function RitualActions({
  ritual,
  onFreeze,
  onDelete,
}: {
  ritual: RitualSpec;
  onFreeze: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const custom = ritual.isCustom === true;

  return (
    <div className="mdr-daily-rhythm-actions">
      <button
        type="button"
        className="mdr-daily-rhythm-more press"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        aria-label={`إجراءات ${ritual.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="إجراءات"
      >
        <MoreHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
      </button>

      {open && (
        <div
          className="mdr-daily-rhythm-menu"
          role="menu"
          aria-label={`إجراءات ${ritual.name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              buzz();
              onFreeze();
              setOpen(false);
            }}
          >
            <Snowflake size={14} aria-hidden="true" />
            {custom ? "تجميد اليوم" : "إخفاء اليوم"}
          </button>
          {ritual.onEdit && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                ritual.onEdit?.();
                setOpen(false);
              }}
            >
              <Pencil size={14} aria-hidden="true" />
              تعديل العادة
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              role="menuitem"
              className="is-danger"
              onClick={() => {
                onDelete();
                setOpen(false);
              }}
            >
              <Trash2 size={14} aria-hidden="true" />
              حذف العادة
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RitualRow({
  ritual,
  onFreeze,
  onDelete,
}: {
  ritual: RitualSpec;
  onFreeze: () => void;
  onDelete?: () => void;
}) {
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
      <StatusMark done={ritual.done} name={ritual.name} onMark={ritual.onMark} />
      <RitualActions ritual={ritual} onFreeze={onFreeze} onDelete={onDelete} />
    </div>
  );
}

function HiddenItemRow({
  item,
  onResume,
  onDelete,
}: {
  item: FrozenSpec;
  onResume: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="mdr-daily-rhythm-hidden-row">
      <span
        className="mdr-daily-rhythm-hidden-icon"
        style={{ ["--rhythm-color" as string]: item.color }}
        aria-hidden="true"
      >
        {item.icon}
      </span>
      <span className="mdr-daily-rhythm-hidden-copy">
        <strong>{item.name}</strong>
        <small>مخفية مؤقتًا · لا تدخل في السلسلة</small>
      </span>
      <div className="mdr-daily-rhythm-hidden-actions">
        <button
          type="button"
          className="mdr-daily-rhythm-resume press"
          onClick={() => {
            buzz();
            onResume();
          }}
          aria-label={`إظهار ${item.name}`}
        >
          <Play size={11} strokeWidth={2.5} aria-hidden="true" />
          إظهار
        </button>
        {item.isCustom && onDelete && (
          <button
            type="button"
            className="mdr-daily-rhythm-hidden-delete press"
            onClick={onDelete}
            aria-label={`حذف ${item.name}`}
            title="حذف العادة"
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * محرّرُ العادة — إضافةً وتعديلاً.
 *
 * لا شاشةَ إدارةٍ منفصلة: العادةُ تُضاف وتُسمّى من المكان الذي تُعلَّم فيه.
 * (كانت هذه القدرة معلّقةً بلا مدخل بعد نقل التصميم: `addHabit` و`updateHabit`
 * موجودتان في المتجر ولا زرَّ يبلغهما، فتعذّر إنشاءُ عادةٍ جديدة أصلاً.)
 */
function HabitEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: { id: string; name: string; icon: string; color: string };
  onSave: (draft: { name: string; icon: string; color: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState(initial?.icon || "⭐");
  const [color, setColor] = useState(initial?.color || HABIT_COLORS[0]);

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({ name: trimmed, icon, color });
  }

  return (
    <div className="mdr-daily-rhythm-editor" role="group" aria-label={initial ? "تعديل العادة" : "عادة جديدة"}>
      <div className="mdr-daily-rhythm-editor-top">
        <span className="mdr-daily-rhythm-editor-preview" style={{ ["--rhythm-color" as string]: color }}>
          {icon}
        </span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
          placeholder="اسم العادة"
          lang="ar"
          dir="rtl"
          aria-label="اسم العادة"
          autoFocus
        />
      </div>

      <div className="mdr-daily-rhythm-editor-icons" role="group" aria-label="أيقونة العادة">
        {HABIT_ICONS.map((ic) => (
          <button
            key={ic}
            type="button"
            onClick={() => setIcon(ic)}
            className={cn(icon === ic && "is-active")}
            aria-pressed={icon === ic}
          >
            {ic}
          </button>
        ))}
        <input
          value=""
          onChange={(event) => {
            const emoji = firstGrapheme(event.target.value);
            if (emoji) setIcon(emoji);
          }}
          placeholder="أو أي إيموجي"
          aria-label="إيموجي مخصص"
        />
      </div>

      <div className="mdr-daily-rhythm-editor-colors" role="group" aria-label="لون العادة">
        {HABIT_COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={cn(color === c && "is-active")}
            style={{ backgroundColor: c }}
            aria-label={`اللون ${arNum(i + 1)}`}
            aria-pressed={color === c}
          />
        ))}
      </div>

      <div className="mdr-daily-rhythm-editor-actions">
        <button type="button" className="is-primary press" onClick={submit} disabled={!name.trim()}>
          {initial ? "احفظ التعديل" : "أضِف العادة"}
        </button>
        <button type="button" className="press" onClick={onCancel}>إلغاء</button>
      </div>
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
  const deleteHabit = useAppStore((s) => s.deleteHabit);
  const addHabit = useAppStore((s) => s.addHabit);
  const updateHabit = useAppStore((s) => s.updateHabit);
  const toggleWird = useAppStore((s) => s.toggleWird);
  // `null` مغلق · `"new"` عادةٌ جديدة · معرّفٌ = تعديلُ عادةٍ قائمة.
  const [editing, setEditing] = useState<string | null>(null);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const hiddenPanelRef = useRef<HTMLDivElement>(null);

  const todayStr = today();
  const frozen = useMemo(() => new Set(frozenHabits ?? []), [frozenHabits]);
  useEffect(() => {
    if (!hiddenOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !hiddenPanelRef.current?.contains(target)) setHiddenOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHiddenOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [hiddenOpen]);
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

  // الوِردُ يُنجَز بأحد أمرين: عملٌ مسجَّلٌ في قسم القرآن (حفظٌ أو مراجعةٌ أو
  // ختمة)، أو تعليمُك إيّاه بيدك. والتفريقُ بينهما مقصود: ما أنجزَته بعملٍ
  // مسجَّل لا يُلغى بضغطةٍ هنا (وإلا نقضت علامةُ اليوم سجلَّ الحفظ)، وما
  // علّمتَه بيدك تتراجع عنه بالضغطة نفسها. وبلا هذا الزرّ كان «اليوم المكتمل»
  // مستحيلاً على من لا خطّةَ حفظٍ له — وهو ثلثُ تعريفه في `dayAggregator`.
  const wirdMarked = (quranWird ?? []).includes(todayStr);
  const wirdByActivity = digest.wirdDone && !wirdMarked;

  const coreRituals: RitualSpec[] = [
    {
      key: "quran",
      freezeKey: "core:wird",
      name: "القرآن",
      status: digest.wirdDone ? "أُنجز القرآن اليوم" : "لم تقرأ وردك اليوم",
      hint: wirdByActivity
        ? "نشاطك محفوظ في قسم القرآن"
        : digest.wirdDone
          ? "علّمتَ وردك اليوم"
          : "افتح المصحف وأكمل وردك",
      color: SECTION.quran,
      wash: "#e2efe8",
      icon: <Sprout size={18} strokeWidth={1.9} />,
      done: digest.wirdDone,
      streak: wirdStreak,
      href: "/quran",
      onMark: wirdByActivity ? undefined : () => toggleWird(todayStr),
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
        isCustom: true,
        streak: graceStreak(habit.logs ?? []),
        onEdit: () => setEditing(habit.id),
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
      isCustom: true,
    }));
  const activeRituals = [...activeCore, ...activeHabits];
  const frozenItems = [...frozenCore, ...frozenCustom];
  const doneCount = activeRituals.filter((ritual) => ritual.done).length;
  const countLabel = activeRituals.length > 0
    ? `${arNum(doneCount)} من ${arNum(activeRituals.length)}`
    : "كلها مجمّدة";

  function confirmDelete(habitId: string, name: string) {
    if (typeof window !== "undefined" && !window.confirm(`تحذف عادة «${name}»؟ سجلّها سيُحذف معها.`)) return;
    deleteHabit(habitId);
  }

  return (
    <section
      className={cn("mdr-daily-rhythm", compact && "mdr-daily-rhythm--compact")}
      aria-labelledby="daily-rhythm-title"
    >
      <header className="mdr-daily-rhythm-head">
        <div>
          <h2 id="daily-rhythm-title">اليوم</h2>
        </div>
        <div ref={hiddenPanelRef} className="mdr-daily-rhythm-head-actions">
          <span className="mdr-daily-rhythm-count">{countLabel}</span>
          <button
            type="button"
            className="mdr-daily-rhythm-manage press"
            onClick={() => { setHiddenOpen(false); setEditing((v) => (v === "new" ? null : "new")); }}
            aria-label="إضافة عادة"
            aria-expanded={editing === "new"}
            title="إضافة عادة"
          >
            <Plus size={17} strokeWidth={2.4} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mdr-daily-rhythm-manage press"
            onClick={() => setHiddenOpen((value) => !value)}
            aria-label="إدارة العناصر المخفية"
            aria-haspopup="dialog"
            aria-expanded={hiddenOpen}
            title="إدارة العناصر المخفية"
          >
            <MoreHorizontal size={17} strokeWidth={2.2} aria-hidden="true" />
            {frozenItems.length > 0 && <span className="mdr-daily-rhythm-hidden-count">{arNum(frozenItems.length)}</span>}
          </button>

          {hiddenOpen && (
            <div className="mdr-daily-rhythm-hidden-panel" role="dialog" aria-label="إدارة العناصر المخفية">
              <div className="mdr-daily-rhythm-hidden-head">
                <div>
                  <strong>العناصر المخفية</strong>
                  <small>لا تظهر في قائمة اليوم ولا تُحتسب</small>
                </div>
                <button
                  type="button"
                  className="mdr-daily-rhythm-hidden-close press"
                  onClick={() => setHiddenOpen(false)}
                  aria-label="إغلاق إدارة العناصر المخفية"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
              {frozenItems.length > 0 ? (
                <div className="mdr-daily-rhythm-hidden-list">
                  {frozenItems.map((item) => (
                    <HiddenItemRow
                      key={item.key}
                      item={item}
                      onResume={() => {
                        toggleFreezeHabit(item.key);
                        setHiddenOpen(false);
                      }}
                      onDelete={item.isCustom ? () => confirmDelete(item.key, item.name) : undefined}
                    />
                  ))}
                </div>
              ) : (
                <p className="mdr-daily-rhythm-hidden-empty">لا توجد عناصر مخفية حالياً.</p>
              )}
            </div>
          )}
        </div>
      </header>

      {editing !== null && (
        <HabitEditor
          key={editing}
          initial={
            editing === "new"
              ? undefined
              : (() => {
                  const h = habits.find((x) => x.id === editing);
                  return h ? { id: h.id, name: h.name, icon: h.icon, color: h.color } : undefined;
                })()
          }
          onCancel={() => setEditing(null)}
          onSave={(draft) => {
            if (editing === "new") addHabit({ id: uid(), ...draft, logs: [] });
            else updateHabit(editing, draft);
            setEditing(null);
          }}
        />
      )}

      <div className="mdr-daily-rhythm-list">
        {activeRituals.map((ritual) => (
          <RitualRow
            key={ritual.key}
            ritual={ritual}
            onFreeze={() => toggleFreezeHabit(ritual.freezeKey)}
            onDelete={ritual.isCustom ? () => confirmDelete(ritual.key, ritual.name) : undefined}
          />
        ))}
        {activeRituals.length === 0 && (
          <p className="mdr-daily-rhythm-empty">ما عليك شيء الآن؛ أضِف عادةً بزرّ ＋، والمخفيّ تجده من زرّ الإدارة.</p>
        )}
      </div>
    </section>
  );
}
