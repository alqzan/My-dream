"use client";
import Link from "next/link";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import {
  today, calcStreak, uid, cn, toDateStr, buzz,
  getJournalStreak, getReadingStreak, getDailyCompletionDates,
} from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Plus, Check, Settings2, X, Flame, ChevronLeft } from "lucide-react";

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

// Ring around a tile's icon showing how many of the last 7 days were kept.
function WeekRing({ done, color, children }: { done: number; color: string; children: React.ReactNode }) {
  const size = 46;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const on = (c * done) / 7;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} className="absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color + "22"} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${on} ${c - on}`}
          style={{ transition: "stroke-dasharray 0.5s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-[5px] rounded-full flex items-center justify-center text-xl" style={{ backgroundColor: color + "14" }}>
        {children}
      </div>
    </div>
  );
}

// Shared tile body — icon ring + name + status line + last-7-days strip.
function TileBody({
  icon, name, color, done, weekKept, statusLine,
}: {
  icon: React.ReactNode; name: string; color: string; done: boolean;
  weekKept: Set<string>; statusLine: string;
}) {
  const week = last7Days();
  const todayStr = today();
  const weekDone = week.filter((d) => weekKept.has(d)).length;
  return (
    <>
      <div className="flex items-center gap-2.5">
        <WeekRing done={weekDone} color={color}>{icon}</WeekRing>
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
      <div className="flex gap-1 mt-2.5 justify-between px-0.5">
        {week.map((d) => {
          const kept = weekKept.has(d);
          const isToday = d === todayStr;
          return (
            <span
              key={d}
              className={cn("h-1.5 rounded-full flex-1 transition-colors", isToday && !kept && "ring-1")}
              style={{ backgroundColor: kept ? color : color + "1a", ["--tw-ring-color" as string]: color + "66" }}
            />
          );
        })}
      </div>
    </>
  );
}

// The dashboard's single daily card: the master streak on top, then every
// daily practice in ONE grid — the app's core rituals (journal, reading,
// prayer) shown as tiles alongside the habits the owner adds. Core tiles open
// their page; custom tiles toggle done. Replaces the separate streak card,
// prayer orbit, and habit tracker so the day lives in one nice place.
export function DailyHabits() {
  const {
    habits, journalEntries, readingLogs, books,
    toggleHabitLog, addHabit, updateHabit, deleteHabit,
  } = useAppStore();
  const [showAdd, setShowAdd] = useState(false);
  const [manage, setManage] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("⭐");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const todayStr = today();

  const masterStreak = calcStreak(getDailyCompletionDates(journalEntries, readingLogs));

  // Core rituals as tiles (dates each was "kept", today's done, streak).
  const journalDates = new Set(journalEntries.map((e) => e.date));
  const readingDates = new Set(readingLogs.map((l) => l.date));
  const currentBook = books.find((b) => b.status === "أقرأ");

  const core = [
    {
      href: "/journal", icon: "📓", name: "مذكرة اليوم", color: "#8a6fb0",
      done: journalDates.has(todayStr), weekKept: journalDates,
      statusLine: (() => { const s = getJournalStreak(journalEntries); return s > 0 ? `${s} يوم متواصل` : "اكتب اليوم"; })(),
    },
    {
      href: "/reading", icon: "📚", name: currentBook ? currentBook.title : "القراءة", color: "#c1663f",
      done: readingDates.has(todayStr), weekKept: readingDates,
      statusLine: (() => { const s = getReadingStreak(readingLogs); return s > 0 ? `${s} يوم متواصل` : "اقرأ اليوم"; })(),
    },
  ];

  // Combined day progress across rituals + habits.
  const coreDone = core.filter((c) => c.done).length;
  const habitsDone = habits.filter((h) => h.logs.includes(todayStr)).length;
  const totalItems = core.length + habits.length;
  const doneItems = coreDone + habitsDone;
  const allDone = totalItems > 0 && doneItems === totalItems;
  const pct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;

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
            {masterStreak > 0 ? "يوم متواصل — مذكرة وقراءة" : "ابدأ سلسلتك اليوم!"}
          </div>
        </div>
        <div className="text-left">
          <div className="text-2xl font-bold tabular-nums">{doneItems}/{totalItems}</div>
          <div className="text-xs opacity-80">أنجزت اليوم</div>
        </div>
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
            {habits.length > 0 && (
              <button
                onClick={() => setManage(!manage)}
                className={cn("p-1.5 rounded-lg press", manage ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:text-gray-600")}
                aria-label="إدارة العادات"
              >
                <Settings2 size={15} />
              </button>
            )}
            <button
              onClick={toggleAddForm}
              className="text-brand-600 hover:text-brand-700 p-1.5 press"
              aria-label="إضافة عادة"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {manage && habits.length > 0 && (
          <p className="text-[11px] text-gray-400">اضغط على أي عادة لتعديل اسمها أو أيقونتها أو لونها، أو ✕ لحذفها. (العادات الأساسية ثابتة)</p>
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
          {core.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className={cn(
                "relative rounded-2xl border p-3 text-right press transition-all duration-300 block",
                c.done ? "card-shadow" : "bg-white border-gray-200 hover:border-gray-300"
              )}
              style={c.done ? { borderColor: c.color + "66", background: `linear-gradient(135deg, ${c.color}1f, ${c.color}0a)` } : undefined}
            >
              <ChevronLeft size={13} className="absolute top-3 left-2 text-gray-300" />
              <TileBody icon={c.icon} name={c.name} color={c.color} done={c.done} weekKept={c.weekKept} statusLine={c.statusLine} />
            </Link>
          ))}

          {/* Custom habits — tap toggles done */}
          {habits.map((habit) => {
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
                  <span
                    onClick={(e) => { e.stopPropagation(); deleteHabit(habit.id); }}
                    className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center animate-pop-in cursor-pointer z-10"
                    aria-label={`حذف ${habit.name}`}
                  >
                    <X size={12} />
                  </span>
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

        {allDone && (
          <div className="text-center py-2 text-sm font-bold rounded-xl animate-pop-in bg-gradient-to-l from-green-50 to-emerald-50 text-green-700 border border-green-100">
            🌟 أكملت كل عاداتك اليوم — استمر!
          </div>
        )}
      </div>
    </div>
  );
}
