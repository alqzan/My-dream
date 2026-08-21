"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAppStore } from "@/lib/store";
import { buildDayDigest } from "@/lib/assistantContext";
import { buzz, cn, formatAmount, formatDate, today, uid } from "@/lib/utils";
import { BookMarked, BookOpen, Check, ChevronLeft, Pencil, Plus, Settings2, Sprout, Star, Wallet, X } from "lucide-react";
import { SECTION } from "@/lib/palette";

const ICONS = ["⭐", "💪", "🧠", "🙏", "🏃", "📖", "💧", "🥗", "🎯", "😴", "🕌", "✍️", "🚶", "☀️", "🧘"];
const COLORS = [SECTION.brand, SECTION.finance, SECTION.journal, SECTION.reading, "#4a9fbd", "#c94f6d"];

function firstGrapheme(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const part of segmenter.segment(trimmed)) return part.segment;
  }
  return [...trimmed][0] ?? "";
}

interface SummaryArcSpec {
  key: string;
  label: string;
  big: string;
  unit: string;
  sub: string;
  ratio: number;
  color: string;
  icon: ReactNode;
  href: string;
}

function SummaryArc({ arc }: { arc: SummaryArcSpec }) {
  const ratio = Math.max(0, Math.min(1, arc.ratio));
  return (
    <Link
      href={arc.href}
      className="mdr-summary-arc press"
      style={{ ["--arc-color" as string]: arc.color }}
      aria-label={`${arc.label}: ${arc.big} ${arc.unit}`}
    >
      <div className="mdr-summary-arc-art" aria-hidden="true">
        <svg viewBox="0 0 104 82" focusable="false">
          <path d="M20 76V42a32 32 0 0 1 64 0v34" fill="none" stroke="var(--line)" strokeWidth="8" strokeLinecap="round" />
          <path
            d="M20 76V42a32 32 0 0 1 64 0v34"
            fill="none"
            stroke={arc.color}
            strokeWidth="8"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray={`${ratio * 100} 100`}
            style={{ transition: "stroke-dasharray 650ms cubic-bezier(.16,1,.3,1)" }}
          />
        </svg>
        <div className="mdr-summary-arc-center">
          <span className="mdr-summary-arc-icon" style={{ color: arc.color, backgroundColor: `${arc.color}16` }}>
            {arc.icon}
          </span>
          <strong>{arc.big}</strong>
          <small>{arc.unit}</small>
        </div>
      </div>
      <span className="mdr-summary-arc-label">{arc.label}</span>
      <span className="mdr-summary-arc-sub">{arc.sub}</span>
    </Link>
  );
}

// «خلاصة اليوم» — سطحٌ واحد هادئ يجمع الأعمال الأساسية في مدار والعادات
// المخصّصة. الأقواس هنا ليست أدواتٍ إضافية؛ هي قراءةٌ سريعة لليوم، والبطاقات
// الصغيرة أسفلها هي المكان الوحيد الذي تُسجّل منه العادات التي يضيفها المستخدم.
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
  const addHabit = useAppStore((s) => s.addHabit);
  const updateHabit = useAppStore((s) => s.updateHabit);
  const deleteHabit = useAppStore((s) => s.deleteHabit);
  const toggleFreezeHabit = useAppStore((s) => s.toggleFreezeHabit);

  const [manage, setManage] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("⭐");
  const [newColor, setNewColor] = useState(COLORS[0]);

  const d = useMemo(
    () =>
      buildDayDigest({
        transactions, dailyBudget, prayerLogs, habits, frozenHabits,
        journalEntries, readingLogs, quranWird, quranHifz, quranReflections, quranKhatma,
      }),
    [
      transactions, dailyBudget, prayerLogs, habits, frozenHabits,
      journalEntries, readingLogs, quranWird, quranHifz, quranReflections, quranKhatma,
    ]
  );

  const todayStr = today();
  const frozen = useMemo(() => new Set(frozenHabits ?? []), [frozenHabits]);
  const activeHabits = useMemo(() => habits.filter((habit) => !frozen.has(habit.id)), [habits, frozen]);
  const frozenCustomHabits = useMemo(() => habits.filter((habit) => frozen.has(habit.id)), [habits, frozen]);

  const activeCoreCount = [d.wirdFrozen, d.journalFrozen, d.readingFrozen].filter((isFrozen) => !isFrozen).length;
  const totalTracked = activeCoreCount + activeHabits.length;
  const doneTracked =
    (d.wirdFrozen ? 0 : d.wirdDone ? 1 : 0) +
    (d.journalFrozen ? 0 : d.journalWritten ? 1 : 0) +
    (d.readingFrozen ? 0 : d.readingDone ? 1 : 0) +
    d.habitsDone;

  const arcs: SummaryArcSpec[] = [
    !d.wirdFrozen && {
      key: "quran",
      label: "القرآن",
      big: d.wirdDone ? "تمّ" : "بعد",
      unit: "وِرد اليوم",
      sub: d.wirdDone ? "أحسنت، واصل" : "افتح وردك",
      ratio: d.wirdDone ? 1 : 0,
      color: SECTION.quran,
      icon: <Sprout size={14} />,
      href: "/quran",
    },
    !d.journalFrozen && {
      key: "journal",
      label: "المذكرة",
      big: d.journalWritten ? "تمّ" : "بعد",
      unit: "مذكرة اليوم",
      sub: d.journalWritten ? "حُفظت اليوم" : "اكتب سطرك",
      ratio: d.journalWritten ? 1 : 0,
      color: SECTION.journal,
      icon: <BookMarked size={14} />,
      href: "/journal",
    },
    !d.readingFrozen && {
      key: "reading",
      label: "القراءة",
      big: d.readingDone ? "تمّ" : "بعد",
      unit: "قراءة اليوم",
      sub: d.readingDone ? "خطوةٌ محسوبة" : "افتح كتبك",
      ratio: d.readingDone ? 1 : 0,
      color: SECTION.reading,
      icon: <BookOpen size={14} />,
      href: "/reading",
    },
    {
      key: "habits",
      label: "العادات",
      big: d.habitsTotal ? `${d.habitsDone}/${d.habitsTotal}` : "—",
      unit: "مخصّصة",
      sub: d.habitsTotal ? "من عاداتك اليوم" : "أضف ما يناسبك",
      ratio: d.habitsTotal ? d.habitsDone / d.habitsTotal : 0,
      color: SECTION.brand,
      icon: <Star size={14} />,
      href: "#summary-habits",
    },
  ].filter(Boolean) as SummaryArcSpec[];

  function resetForm() {
    setNewName("");
    setNewIcon("⭐");
    setNewColor(COLORS[0]);
    setEditId(null);
  }

  function openNewHabit() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(habit: { id: string; name: string; icon: string; color: string }) {
    setEditId(habit.id);
    setNewName(habit.name);
    setNewIcon(habit.icon || "⭐");
    setNewColor(habit.color || COLORS[0]);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    resetForm();
  }

  function saveHabit() {
    const name = newName.trim();
    if (!name) return;
    if (editId) updateHabit(editId, { name, icon: newIcon, color: newColor });
    else addHabit({ id: uid(), name, icon: newIcon, color: newColor, logs: [] });
    closeForm();
  }

  return (
    <section className={cn("mdr-day-digest", compact && "mdr-day-digest--compact")} aria-labelledby="day-summary-title">
      <div className="mdr-summary-head">
        <div>
          <div className="mdr-summary-eyebrow">مسارك اليوم</div>
          <h2 id="day-summary-title">خلاصة اليوم</h2>
          <p>{formatDate(todayStr)} · {d.budgetBalance == null ? "يومك أمامك" : `المتبقي ${formatAmount(Math.abs(d.budgetBalance))} من الميزانية`}</p>
        </div>
        <div className="mdr-summary-score" aria-label={`${doneTracked} من ${totalTracked} أعمال مكتملة`}>
          <strong>{doneTracked}<span>/{totalTracked}</span></strong>
          <small>اكتمل</small>
        </div>
      </div>

      <div className="mdr-summary-arcs" aria-label="ملخص مسارات اليوم">
        {arcs.map((arc) => <SummaryArc key={arc.key} arc={arc} />)}
      </div>

      <Link href="/finance" className="mdr-summary-spend press">
        <span className="mdr-summary-spend-icon"><Wallet size={15} /></span>
        <span className="flex-1 min-w-0">
          <strong>المال اليوم</strong>
          <small>{d.budgetBalance == null ? "لا توجد ميزانية يومية مضبوطة" : d.budgetBalance < 0 ? "تجاوزت الحدّ اليومي" : `متبقٍّ ${formatAmount(d.budgetBalance)} ر.س`}</small>
        </span>
        <span className="mdr-summary-spend-value">{formatAmount(d.spentToday)} <small>ر.س</small></span>
        <ChevronLeft size={15} aria-hidden="true" />
      </Link>

      <div id="summary-habits" className="mdr-summary-habits">
        <div className="mdr-summary-habits-head">
          <div>
            <strong>عاداتك المخصّصة</strong>
            <span>{d.habitsDone}/{d.habitsTotal}</span>
          </div>
          <div className="mdr-summary-habits-actions">
            <button
              type="button"
              onClick={() => setManage((value) => !value)}
              className={cn("press", manage && "is-active")}
              aria-label="تخصيص العادات"
              aria-pressed={manage}
              title="تخصيص العادات"
            >
              <Settings2 size={15} />
            </button>
            <button type="button" onClick={showForm ? closeForm : openNewHabit} className="press" aria-label="إضافة عادة" title="إضافة عادة">
              {showForm ? <X size={16} /> : <Plus size={16} />}
            </button>
          </div>
        </div>

        {showForm && (
          <div className="mdr-summary-habit-editor animate-fade-up">
            <div className="mdr-summary-habit-editor-row">
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") saveHabit(); }}
                placeholder="اسم العادة"
                aria-label="اسم العادة"
                autoFocus
              />
              <input
                value={newIcon}
                onChange={(event) => { const icon = firstGrapheme(event.target.value); if (icon) setNewIcon(icon); }}
                placeholder="⭐"
                aria-label="رمز العادة"
                maxLength={4}
              />
              <button type="button" onClick={saveHabit} className="mdr-summary-habit-save press">{editId ? "حفظ" : "إضافة"}</button>
            </div>
            <div className="mdr-summary-habit-options">
              {ICONS.slice(0, 9).map((icon) => (
                <button key={icon} type="button" onClick={() => setNewIcon(icon)} className={cn("press", newIcon === icon && "is-selected")} aria-label={`رمز ${icon}`}>
                  {icon}
                </button>
              ))}
              <span className="mdr-summary-color-options" aria-label="لون العادة">
                {COLORS.map((color) => (
                  <button key={color} type="button" onClick={() => setNewColor(color)} className={cn("press", newColor === color && "is-selected")} style={{ backgroundColor: color }} aria-label="اختيار لون" aria-pressed={newColor === color} />
                ))}
              </span>
            </div>
          </div>
        )}

        <div className="mdr-summary-habit-list">
          {activeHabits.map((habit) => {
            const done = habit.logs.includes(todayStr);
            const color = habit.color || SECTION.brand;
            if (manage) {
              return (
                <div key={habit.id} className="mdr-summary-habit-row is-managing">
                  <span className="mdr-summary-habit-mark" style={{ color, backgroundColor: `${color}16` }}>{habit.icon}</span>
                  <span className="flex-1 min-w-0 truncate">{habit.name}</span>
                  <button type="button" onClick={() => openEdit(habit)} className="press" aria-label={`تعديل ${habit.name}`} title="تعديل"><Pencil size={14} /></button>
                  <button type="button" onClick={() => toggleFreezeHabit(habit.id)} className="press" aria-label={`إخفاء ${habit.name} مؤقتاً`} title="إيقاف مؤقت">◌</button>
                  <button type="button" onClick={() => deleteHabit(habit.id)} className="press is-danger" aria-label={`حذف ${habit.name}`} title="حذف"><X size={14} /></button>
                </div>
              );
            }
            return (
              <button
                key={habit.id}
                type="button"
                onClick={() => { if (!done) buzz(); toggleHabitLog(habit.id, todayStr); }}
                className={cn("mdr-summary-habit-row press", done && "is-done")}
                style={{ ["--habit-color" as string]: color }}
                aria-pressed={done}
              >
                <span className="mdr-summary-habit-mark" style={{ color, backgroundColor: `${color}16` }}>{habit.icon}</span>
                <span className="flex-1 min-w-0 truncate">{habit.name}</span>
                <span className="mdr-summary-habit-state">{done ? <><Check size={13} strokeWidth={3} /> تمّ</> : "بعد"}</span>
              </button>
            );
          })}

          {!activeHabits.length && !frozenCustomHabits.length && (
            <button type="button" onClick={openNewHabit} className="mdr-summary-habit-empty press">
              <Plus size={15} /> أضف عادةً تناسب يومك
            </button>
          )}

          {manage && frozenCustomHabits.map((habit) => (
            <div key={habit.id} className="mdr-summary-habit-row is-frozen">
              <span className="mdr-summary-habit-mark">{habit.icon}</span>
              <span className="flex-1 min-w-0 truncate">{habit.name}</span>
              <button type="button" onClick={() => toggleFreezeHabit(habit.id)} className="press">استئناف</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
