"use client";
import { useAppStore } from "@/lib/store";
import { today, calcStreak, uid, cn, toDateStr, buzz } from "@/lib/utils";
import { Plus, Check, Settings2, X, Flame } from "lucide-react";
import { useState } from "react";

const ICONS = ["⭐", "💪", "🧠", "🙏", "🏃", "📖", "💧", "🥗", "🎯", "😴", "🕌", "✍️", "🚶", "☀️", "🧘"];

const COLORS = [
  "#c9852a", // gold
  "#3d9640", // green
  "#8a6fb0", // purple
  "#c1663f", // terracotta
  "#4a9fbd", // blue
  "#c94f6d", // rose
];

// First full emoji (grapheme cluster) of a string — so a flag, a skin-tone
// variant, or any composed emoji is kept whole instead of split into
// surrogate halves.
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

// Ring around the habit icon showing how many of the last 7 days were kept.
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

export function HabitTracker() {
  const { habits, toggleHabitLog, addHabit, deleteHabit } = useAppStore();
  const [showAdd, setShowAdd] = useState(false);
  const [manage, setManage] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("⭐");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const todayStr = today();
  const week = last7Days();

  const doneToday = habits.filter((h) => h.logs.includes(todayStr)).length;
  const allDone = habits.length > 0 && doneToday === habits.length;
  const pct = habits.length ? Math.round((doneToday / habits.length) * 100) : 0;

  function handleAdd() {
    if (!newName.trim()) return;
    addHabit({ id: uid(), name: newName.trim(), icon: newIcon, color: newColor, logs: [] });
    setNewName("");
    setShowAdd(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">عاداتي اليوم</span>
          {habits.length > 0 && (
            <span
              className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors",
                allDone ? "bg-green-100 text-green-700" : "bg-brand-50 text-brand-700"
              )}
            >
              {doneToday}/{habits.length}
            </span>
          )}
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
            onClick={() => setShowAdd(!showAdd)}
            className="text-brand-600 hover:text-brand-700 p-1.5 press"
            aria-label="إضافة عادة"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Day progress bar */}
      {habits.length > 0 && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700",
              allDone
                ? "bg-gradient-to-l from-green-400 to-green-600"
                : "bg-gradient-to-l from-brand-300 to-brand-500"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {showAdd && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-2.5 animate-fade-up">
          <div className="flex items-center gap-2">
            <span className="w-11 h-11 shrink-0 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-2xl">
              {newIcon}
            </span>
            <div className="flex-1">
              <input
                value=""
                onChange={(e) => {
                  const emoji = firstGrapheme(e.target.value);
                  if (emoji) setNewIcon(emoji);
                }}
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
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={cn("w-6 h-6 rounded-full press transition-transform", newColor === c && "scale-110 ring-2 ring-offset-1")}
                style={{ backgroundColor: c, ["--tw-ring-color" as string]: c }}
                aria-label={c}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="اسم العادة"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-300"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <button
              onClick={handleAdd}
              className="bg-brand-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-brand-700 press"
            >
              إضافة
            </button>
          </div>
        </div>
      )}

      {habits.length === 0 && !showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full py-6 rounded-xl border-2 border-dashed border-brand-200 text-brand-600 text-sm font-medium hover:bg-brand-50/50 press"
        >
          ✨ أضف أول عادة يومية
        </button>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {habits.map((habit) => {
          const done = habit.logs.includes(todayStr);
          const weekDone = week.filter((d) => habit.logs.includes(d)).length;
          const streak = calcStreak(habit.logs);
          const color = habit.color || "#c9852a";
          return (
            <button
              key={habit.id}
              onClick={() => {
                if (manage) return;
                if (!done) buzz();
                toggleHabitLog(habit.id, todayStr);
              }}
              className={cn(
                "relative rounded-2xl border p-3 text-right press transition-all duration-300",
                done ? "card-shadow" : "bg-white border-gray-200 hover:border-gray-300"
              )}
              style={
                done
                  ? {
                      borderColor: color + "66",
                      background: `linear-gradient(135deg, ${color}1f, ${color}0a)`,
                    }
                  : undefined
              }
            >
              {manage && (
                <span
                  onClick={(e) => { e.stopPropagation(); deleteHabit(habit.id); }}
                  className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center animate-pop-in cursor-pointer"
                  aria-label={`حذف ${habit.name}`}
                >
                  <X size={12} />
                </span>
              )}

              <div className="flex items-center gap-2.5">
                <WeekRing done={weekDone} color={color}>{habit.icon}</WeekRing>
                <div className="flex-1 min-w-0">
                  <div className={cn("text-sm font-bold truncate", done ? "" : "text-gray-700")} style={done ? { color } : undefined}>
                    {habit.name}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Flame size={11} className={streak > 0 ? "text-orange-500" : "text-gray-300"} />
                    <span className="text-[11px] text-gray-400 font-medium">
                      {streak > 0 ? `${streak} يوم` : "ابدأ اليوم"}
                    </span>
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

              {/* Last 7 days dots — oldest on the right (RTL) */}
              <div className="flex gap-1 mt-2.5 justify-between px-0.5">
                {week.map((d) => {
                  const kept = habit.logs.includes(d);
                  const isToday = d === todayStr;
                  return (
                    <span
                      key={d}
                      className={cn("h-1.5 rounded-full flex-1 transition-colors", isToday && !kept && "ring-1")}
                      style={{
                        backgroundColor: kept ? color : color + "1a",
                        ["--tw-ring-color" as string]: color + "66",
                      }}
                    />
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>

      {allDone && (
        <div className="text-center py-2 text-sm font-bold rounded-xl animate-pop-in bg-gradient-to-l from-green-50 to-emerald-50 text-green-700 border border-green-100">
          🌟 كل عاداتك اليوم مكتملة — استمر!
        </div>
      )}
    </div>
  );
}
