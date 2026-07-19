"use client";
import Link from "next/link";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import {
  today, calcStreak, uid, cn, toDateStr, buzz,
  getJournalStreak, getReadingStreak, quranActivityDates,
} from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Plus, Check, Settings2, X, Flame, ChevronLeft, Snowflake, Play } from "lucide-react";

const ICONS = ["⭐", "💪", "🧠", "🙏", "🏃", "📖", "💧", "🥗", "🎯", "😴", "🕌", "✍️", "🚶", "☀️", "🧘"];
const COLORS = ["#c9852a", "#3d9640", "#8a6fb0", "#c1663f", "#4a9fbd", "#c94f6d"];

// First full emoji (grapheme cluster) of a string — so a composed emoji is
// kept whole instead of split into surrogate halves.
function firstGrapheme(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const s of seg.segment(trimmed)) return s.segment;
  }
  return [...trimmed][0] ?? "";
}

// Last 7 days, oldest first (renders oldest on the right in RTL).
function last7Days(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(toDateStr(d));
  }
  return days;
}

// Ring around a tile's icon, split into 7 arc segments — one per day of the
// last week (oldest first). A kept day glows in the tile's colour, a missed
// day stays a faint track, and today's own segment is lifted while it's still
// open. This single segmented ring replaces the old progress ring plus the
// separate week strip that used to sit under each tile (both showed the same
// last-7-days data).
function WeekRing({
  week, weekKept, todayStr, color, children,
}: {
  week: string[]; weekKept: Set<string>; todayStr: string;
  color: string; children: React.ReactNode;
}) {
  const size = 46;
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  // Normalise the circumference to 7 units (one per day) so a day is always a
  // single segment regardless of radius; `gap` carves a little space between
  // neighbouring segments so they read as seven distinct arcs, not a solid ring.
  const gap = 0.16;
  const seg = 1 - gap;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} className="absolute inset-0">
        {week.map((d, i) => {
          const kept = weekKept.has(d);
          const isToday = d === todayStr;
          // kept → full colour; today-but-open → a lifted tint; else faint track.
          const segColor = kept ? color : isToday ? color + "55" : color + "22";
          return (
            <circle
              key={d}
              cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={segColor} strokeWidth={stroke} strokeLinecap="butt"
              pathLength={7}
              strokeDasharray={`${seg} ${7 - seg}`}
              strokeDashoffset={-i}
              style={{ transition: "stroke 0.4s ease" }}
            />
          );
        })}
      </svg>
      <div className="absolute inset-[5px] rounded-full flex items-center justify-center text-xl" style={{ backgroundColor: color + "14" }}>
        {children}
      </div>
    </div>
  );
}

// Shared tile body — the segmented week ring (icon inside) + name + status
// line. The ring itself now carries the whole last-7-days story, so the old
// separate strip beneath the tile is gone and each tile is more compact.
function TileBody({
  icon, name, color, done, weekKept, statusLine,
}: {
  icon: React.ReactNode; name: string; color: string; done: boolean;
  weekKept: Set<string>; statusLine: string;
}) {
  const week = last7Days();
  const todayStr = today();
  return (
    <div className="flex items-center gap-2.5">
      <WeekRing week={week} weekKept={weekKept} todayStr={todayStr} color={color}>{icon}</WeekRing>
      <div className="flex-1 min-w-0">
        <div className={cn("text-sm font-bold truncate", done ? "" : "text-gray-700")} style={done ? { color } : undefined}>
          {name}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <Flame size={11} className={done ? "text-orange-500" : "text-gray-300"} />
          <span className="text-[11px] text-gray-400 font-medium">{statusLine}</span>
        </div>
      </div>
      {done && (
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center text-white animate-pop-in shrink-0"
          style={{ backgroundColor: color }}
        >
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </div>
  );
}

// The freeze affordance shown on a tile's corner while managing — a small
// frosted button that pauses the habit (❄️). Sits at the physical-left corner
// where the chevron normally is, so it never covers the tile's ring/icon.
function FreezeButton({
  onClick, label,
}: {
  onClick: (e: React.MouseEvent) => void; label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="absolute top-1.5 left-1.5 z-20 w-6 h-6 rounded-full flex items-center justify-center press bg-white/95 dark:bg-[#3a2f20] text-sky-500 border border-gray-200 dark:border-white/10 shadow-sm animate-pop-in"
    >
      <Snowflake size={13} strokeWidth={2.5} />
    </button>
  );
}

// A mini dome that fills by today's completion fraction (doneItems/totalItems)
// — a small sibling of PrayerOrbit's arc (thin gold line-work on a celestial
// diagram), so the habits master visibly echoes the prayer instrument. Static
// fill like PrayerOrbit (no continuous motion → nothing to gate for reduced
// motion); the count sits inside the dome.
const ARC_CX = 24;
const ARC_CY = 24;
const ARC_R = 20;
function arcPoint(deg: number) {
  const r = (deg * Math.PI) / 180;
  return { x: ARC_CX + ARC_R * Math.cos(r), y: ARC_CY - ARC_R * Math.sin(r) };
}
const ARC_A = arcPoint(178);
const ARC_B = arcPoint(2);
const HABIT_ARC_PATH = `M ${ARC_A.x} ${ARC_A.y} A ${ARC_R} ${ARC_R} 0 0 1 ${ARC_B.x} ${ARC_B.y}`;
const HABIT_ARC_LEN = Math.PI * ARC_R;

function HabitArc({ done, total }: { done: number; total: number }) {
  const frac = total > 0 ? done / total : 0;
  const tip = arcPoint(178 - frac * 176);
  return (
    <div className="flex flex-col items-center shrink-0">
      <div className="relative w-[52px]">
        <svg viewBox="0 0 48 28" className="w-full block overflow-visible">
          <defs>
            <linearGradient id="habitArcGold" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fff4d6" />
              <stop offset="100%" stopColor="#f2d29a" />
            </linearGradient>
          </defs>
          <path
            d={HABIT_ARC_PATH}
            fill="none"
            stroke="currentColor"
            className="text-white/25"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d={HABIT_ARC_PATH}
            fill="none"
            stroke="url(#habitArcGold)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeDasharray={`${frac * HABIT_ARC_LEN} 999`}
          />
          {frac > 0 && frac < 1 && <circle cx={tip.x} cy={tip.y} r="1.7" fill="#fff4d6" />}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pt-2.5">
          <span className="text-base font-bold tabular-nums leading-none">{done}/{total}</span>
        </div>
      </div>
      <div className="text-[11px] opacity-80 mt-0.5">أنجزت اليوم</div>
    </div>
  );
}

// The dashboard's single daily card: the master streak on top, then every
// daily practice in ONE grid — the app's core rituals (journal, reading,
// prayer) shown as tiles alongside the habits the owner adds. Core tiles open
// their page; custom tiles toggle done. Replaces the separate streak card,
// prayer orbit, and habit tracker so the day lives in one nice place.
export function DailyHabits() {
  const {
    habits, journalEntries, readingLogs, books, quranWird, quranHifz,
    quranReflections, quranKhatma, frozenHabits,
    toggleHabitLog, addHabit, updateHabit, deleteHabit, toggleWird, toggleFreezeHabit,
  } = useAppStore();
  const [showAdd, setShowAdd] = useState(false);
  const [manage, setManage] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("⭐");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const todayStr = today();

  // العادات المجمّدة: بطاقةٌ مفتاحها هنا تُخرَج من قائمة اليوم فلا تُحتسب ولا
  // تكسر السلسلة، وتظهر في قسم «مجمّدة مؤقتاً» بزرّ استئناف يعيدها متى شئت.
  const frozen = new Set(frozenHabits ?? []);
  const isFrozen = (key: string) => frozen.has(key);

  // Core rituals as tiles (dates each was "kept", today's done, streak).
  const journalDates = new Set(journalEntries.map((e) => e.date));
  const readingDates = new Set(readingLogs.map((l) => l.date));
  const currentBook = books.find((b) => b.status === "أقرأ");

  // السلسلة الكاملة تُبنى من الطقوس الأساسية غير المجمّدة (مذكرة + قراءة): يومٌ
  // «متواصل» هو يومٌ أُتمّت فيه كلّها. تجميد أحدها يُخرجه من الحساب فلا يكسر
  // السلسلة، ويُحذف اسمه من العنوان.
  const streakParts = [
    { key: "core:journal", label: "مذكرة", dates: journalDates },
    { key: "core:reading", label: "قراءة", dates: readingDates },
  ].filter((p) => !isFrozen(p.key));
  const streakDates = streakParts.length
    ? [...streakParts[0].dates].filter((d) => streakParts.every((p) => p.dates.has(d)))
    : [];
  const masterStreak = calcStreak(streakDates);
  const streakLabel = streakParts.map((p) => p.label).join(" و");

  // حفظ اليوم — عادة أساسية تظهر متى وُجدت خطة حفظ: «أُنجزت» إن سُجّلت جلسة حفظ
  // اليوم، وتفتح تبويب الحفظ. مشتقّة من الجلسات (كالمذكرة والقراءة).
  const hifzDates = new Set((quranHifz?.sessions ?? []).map((s) => s.date));
  const hasPlan = !!quranHifz?.plan;

  const core = [
    {
      key: "core:journal",
      href: "/journal", icon: "📓", name: "مذكرة اليوم", color: "#8a6fb0",
      done: journalDates.has(todayStr), weekKept: journalDates,
      statusLine: (() => { const s = getJournalStreak(journalEntries); return s > 0 ? `${s} يوم متواصل` : "اكتب اليوم"; })(),
    },
    {
      key: "core:reading",
      href: "/reading", icon: "📚", name: currentBook ? currentBook.title : "القراءة", color: "#c1663f",
      done: readingDates.has(todayStr), weekKept: readingDates,
      statusLine: (() => { const s = getReadingStreak(readingLogs); return s > 0 ? `${s} يوم متواصل` : "اقرأ اليوم"; })(),
    },
    ...(hasPlan ? [{
      key: "core:hifz",
      href: "/quran?tab=hifz", icon: "🧠", name: "حفظ اليوم", color: "#1b6b4c",
      done: hifzDates.has(todayStr), weekKept: hifzDates,
      statusLine: (() => { const s = calcStreak([...hifzDates]); return s > 0 ? `${s} يوم متواصل` : "احفظ وردك"; })(),
    }] : []),
  ];

  // الوِرد اليومي — عادة أساسية مبنيّة (لا تُحذف): نقرةٌ تُتمّها، بلونها الأخضر
  // القرآني. تُحتسب «تمّت» بأيّ نشاطٍ قرآني اليوم (حفظ/مراجعة/تدبّر/ختمة) لا
  // بنقرة الوِرد وحدها، وسلسلتها من مجموع تلك التواريخ. نقرةُ البطاقة تظلّ تسجّل
  // وِرداً يدوياً لأيام لم يُسجَّل فيها شيءٌ آخر.
  const wirdDates = quranActivityDates({ quranWird, quranHifz, quranReflections, quranKhatma });
  const wirdDone = wirdDates.has(todayStr);
  const wirdStreak = calcStreak([...wirdDates]);
  const wirdFrozen = isFrozen("core:wird");

  // البطاقات النشطة (غير المجمّدة) هي وحدها ما يُعرض ويُحتسب في تقدّم اليوم.
  const activeCore = core.filter((c) => !isFrozen(c.key));
  const activeHabits = habits.filter((h) => !isFrozen(h.id));

  // Combined day progress across active rituals + wird + habits.
  const coreDone = activeCore.filter((c) => c.done).length;
  const habitsDone = activeHabits.filter((h) => h.logs.includes(todayStr)).length;
  const totalItems = activeCore.length + (wirdFrozen ? 0 : 1) + activeHabits.length;
  const doneItems = coreDone + (!wirdFrozen && wirdDone ? 1 : 0) + habitsDone;
  const allDone = totalItems > 0 && doneItems === totalItems;
  const pct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;

  // قائمة البطاقات المجمّدة (أساسية + وِرد + مخصّصة) لعرضها في قسم الاستئناف.
  const frozenList = [
    ...core.filter((c) => isFrozen(c.key)).map((c) => ({ key: c.key, icon: c.icon, name: c.name, color: c.color })),
    ...(wirdFrozen ? [{ key: "core:wird", icon: "🌿", name: "وِرد اليوم", color: "#1b6b4c" }] : []),
    ...habits.filter((h) => isFrozen(h.id)).map((h) => ({ key: h.id, icon: h.icon, name: h.name, color: h.color || "#c9852a" })),
  ];

  function resetForm() {
    setNewName(""); setNewIcon("⭐"); setNewColor(COLORS[0]); setEditId(null);
  }
  function toggleAddForm() {
    if (showAdd) { setShowAdd(false); resetForm(); }
    else { resetForm(); setShowAdd(true); }
  }
  function openEdit(habit: { id: string; name: string; icon: string; color: string }) {
    setEditId(habit.id);
    setNewName(habit.name);
    setNewIcon(habit.icon || "⭐");
    setNewColor(habit.color || COLORS[0]);
    setShowAdd(true);
  }
  function handleSave() {
    if (!newName.trim()) return;
    if (editId) updateHabit(editId, { name: newName.trim(), icon: newIcon, color: newColor });
    else addHabit({ id: uid(), name: newName.trim(), icon: newIcon, color: newColor, logs: [] });
    setShowAdd(false);
    resetForm();
  }

  return (
    <div className="relative overflow-hidden rounded-2xl card-shadow">
      {/* Master streak header */}
      <div
        className={cn(
          "flex items-center justify-between p-4 pb-3 text-white",
          masterStreak > 0 || allDone
            ? "bg-gradient-to-br from-[#a85a2c] via-[#c0842b] to-[#dca63f] shine"
            : "bg-gradient-to-br from-[#8a7a62] to-[#b3a48a] dark:from-[#453b2c] dark:to-[#5a5040]"
        )}
      >
        <div>
          <div className="text-4xl font-bold flex items-center gap-2 tabular-nums">
            <AnimatedNumber value={masterStreak} />
            <span className={cn("text-2xl", masterStreak > 0 && "animate-flame")}>
              {masterStreak > 0 ? "🔥" : "💤"}
            </span>
          </div>
          <div className="text-sm opacity-90 mt-0.5">
            {masterStreak > 0 ? `يوم متواصل — ${streakLabel}` : "ابدأ سلسلتك اليوم!"}
          </div>
        </div>
        <HabitArc done={doneItems} total={totalItems} />
      </div>

      {/* White panel: rituals + habits in one grid */}
      <div className="bg-white/95 dark:bg-[#241c12]/95 backdrop-blur rounded-t-2xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">عاداتي اليوم</span>
            <span
              className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors",
                allDone ? "bg-green-100 text-green-700" : "bg-brand-50 text-brand-700"
              )}
            >
              {doneItems}/{totalItems}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setManage(!manage)}
              className={cn("p-1.5 rounded-lg press", manage ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:text-gray-600")}
              aria-label="إدارة العادات"
            >
              <Settings2 size={15} />
            </button>
            <button
              onClick={toggleAddForm}
              className="text-brand-600 hover:text-brand-700 p-1.5 press"
              aria-label="إضافة عادة"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {manage && (
          <p className="text-[11px] text-gray-400">اضغط ❄️ لتجميد أي عادة مؤقتاً (تختفي من اليوم ولا تُحتسب، وتُستأنف متى شئت). العادة المخصّصة تُفتح بالضغط عليها لتعديلها، و✕ لحذفها.</p>
        )}

        {/* Day progress across everything */}
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              allDone ? "bg-gradient-to-l from-green-400 to-green-600" : "bg-gradient-to-l from-brand-300 to-brand-500"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        {showAdd && (
          <div className="bg-gray-50 rounded-xl p-3 space-y-2.5 animate-fade-up">
            {editId && <div className="text-xs font-semibold text-gray-500">تعديل العادة</div>}
            <div className="flex items-center gap-2">
              <span className="w-11 h-11 shrink-0 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-2xl">
                {newIcon}
              </span>
              <div className="flex-1">
                <input
                  value=""
                  onChange={(e) => { const emoji = firstGrapheme(e.target.value); if (emoji) setNewIcon(emoji); }}
                  placeholder="اكتب أي إيموجي تبيه ✍️"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-300"
                  aria-label="إيموجي العادة"
                />
                <p className="text-[10px] text-gray-400 mt-1">من كيبورد الإيموجي — أو اختر من المقترحات:</p>
              </div>
            </div>
            <div className="flex gap-1 flex-wrap">
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setNewIcon(ic)}
                  className={`text-lg p-1 rounded-lg press ${newIcon === ic ? "bg-brand-100 ring-1 ring-brand-400" : "hover:bg-gray-200"}`}
                >
                  {ic}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5 items-center">
              {COLORS.map((c, i) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={cn("w-6 h-6 rounded-full press transition-transform", newColor === c && "scale-110 ring-2 ring-offset-1")}
                  style={{ backgroundColor: c, ["--tw-ring-color" as string]: c }}
                  aria-label={`اللون ${i + 1}`}
                  aria-pressed={newColor === c}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="اسم العادة"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-300"
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
              <button onClick={handleSave} className="bg-brand-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-brand-700 press">
                {editId ? "حفظ" : "إضافة"}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          {/* Core rituals — tap opens their page */}
          {activeCore.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className={cn(
                "relative rounded-2xl border p-3 text-right press transition-all duration-300 block",
                c.done ? "card-shadow" : "bg-white border-gray-200 hover:border-gray-300"
              )}
              style={c.done ? { borderColor: c.color + "66", background: `linear-gradient(135deg, ${c.color}1f, ${c.color}0a)` } : undefined}
            >
              {manage ? (
                <FreezeButton
                  label={`جمّد ${c.name}`}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFreezeHabit(c.key); }}
                />
              ) : (
                <ChevronLeft size={13} className="absolute top-3 left-2 text-gray-300" />
              )}
              <TileBody icon={c.icon} name={c.name} color={c.color} done={c.done} weekKept={c.weekKept} statusLine={c.statusLine} />
            </Link>
          ))}

          {/* الوِرد اليومي — عادة أساسية مبنيّة: نقرة تُتمّها، وسهمٌ صغير يفتح
              قسم قرآن. تشبه بطاقات العادات لكنها ثابتة لا تُحذف. */}
          {!wirdFrozen && (
            <button
              onClick={() => { if (!wirdDone) buzz(); toggleWird(todayStr); }}
              className={cn(
                "relative rounded-2xl border p-3 text-right press transition-all duration-300",
                wirdDone ? "card-shadow" : "bg-white border-gray-200 hover:border-gray-300"
              )}
              style={wirdDone ? { borderColor: "#1b6b4c66", background: "linear-gradient(135deg, #1b6b4c1f, #1b6b4c0a)" } : undefined}
            >
              {manage ? (
                <FreezeButton
                  label="جمّد وِرد اليوم"
                  onClick={(e) => { e.stopPropagation(); toggleFreezeHabit("core:wird"); }}
                />
              ) : (
                <Link
                  href="/quran"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="افتح قسم قرآن"
                  className="absolute top-2 left-2 text-gray-300 hover:text-quran press"
                >
                  <ChevronLeft size={13} />
                </Link>
              )}
              <TileBody
                icon="🌿"
                name="وِرد اليوم"
                color="#1b6b4c"
                done={wirdDone}
                weekKept={wirdDates}
                statusLine={wirdStreak > 0 ? `${wirdStreak} يوم متواصل` : "اقرأ وردك"}
              />
            </button>
          )}

          {/* Custom habits — tap toggles done */}
          {activeHabits.map((habit) => {
            const done = habit.logs.includes(todayStr);
            const streak = calcStreak(habit.logs);
            const color = habit.color || "#c9852a";
            return (
              <button
                key={habit.id}
                onClick={() => {
                  if (manage) { openEdit(habit); return; }
                  if (!done) buzz();
                  toggleHabitLog(habit.id, todayStr);
                }}
                className={cn(
                  "relative rounded-2xl border p-3 text-right press transition-all duration-300",
                  done ? "card-shadow" : "bg-white border-gray-200 hover:border-gray-300"
                )}
                style={done ? { borderColor: color + "66", background: `linear-gradient(135deg, ${color}1f, ${color}0a)` } : undefined}
              >
                {manage && (
                  <>
                    <FreezeButton
                      label={`جمّد ${habit.name}`}
                      onClick={(e) => { e.stopPropagation(); toggleFreezeHabit(habit.id); }}
                    />
                    <span
                      onClick={(e) => { e.stopPropagation(); deleteHabit(habit.id); }}
                      className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center animate-pop-in cursor-pointer z-20"
                      aria-label={`حذف ${habit.name}`}
                    >
                      <X size={12} />
                    </span>
                  </>
                )}
                <TileBody
                  icon={habit.icon}
                  name={habit.name}
                  color={color}
                  done={done}
                  weekKept={new Set(habit.logs)}
                  statusLine={streak > 0 ? `${streak} يوم` : "ابدأ اليوم"}
                />
              </button>
            );
          })}
        </div>

        {/* العادات المجمّدة — موقوفة مؤقتاً: خارج حساب اليوم والسلسلة، تُستأنف
            بنقرة «ابدأ» متى شئت فتعود إلى قائمة اليوم. */}
        {frozenList.length > 0 && (
          <div className="pt-1 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Snowflake size={13} className="text-sky-400" />
              <span className="text-[11px] font-semibold text-gray-500">مجمّدة مؤقتاً</span>
              <span className="text-[10px] font-bold text-gray-400 bg-gray-100 dark:bg-white/10 rounded-full px-1.5">{frozenList.length}</span>
            </div>
            {frozenList.map((f) => (
              <div
                key={f.key}
                className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 dark:border-white/10 bg-gray-50/70 dark:bg-white/[0.03] px-2.5 py-1.5"
              >
                <span
                  className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-base opacity-50 grayscale"
                  style={{ backgroundColor: f.color + "14" }}
                >
                  {f.icon}
                </span>
                <span className="flex-1 min-w-0 text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{f.name}</span>
                <button
                  onClick={() => { buzz(); toggleFreezeHabit(f.key); }}
                  className="flex items-center gap-1 text-[11px] font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-500/15 rounded-lg px-2.5 py-1 press hover:bg-brand-100"
                  aria-label={`استئناف ${f.name}`}
                >
                  <Play size={11} strokeWidth={2.5} />
                  ابدأ
                </button>
              </div>
            ))}
          </div>
        )}

        {allDone && (
          <div className="text-center py-2 text-sm font-bold rounded-xl animate-pop-in bg-gradient-to-l from-green-50 to-emerald-50 text-green-700 border border-green-100">
            🌟 أكملت كل عاداتك اليوم — استمر!
          </div>
        )}
      </div>
    </div>
  );
}
