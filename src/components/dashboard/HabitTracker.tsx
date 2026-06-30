"use client";
import { useAppStore } from "@/lib/store";
import { today } from "@/lib/utils";
import { Plus, Check } from "lucide-react";
import { useState } from "react";
import { uid } from "@/lib/utils";

export function HabitTracker() {
  const { habits, toggleHabitLog, addHabit, deleteHabit } = useAppStore();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("⭐");
  const todayStr = today();

  function handleAdd() {
    if (!newName.trim()) return;
    addHabit({ id: uid(), name: newName.trim(), icon: newIcon, color: "#3d9640", logs: [] });
    setNewName("");
    setShowAdd(false);
  }

  const ICONS = ["⭐", "💪", "🧠", "🙏", "🏃", "📖", "💧", "🥗", "🎯", "😴"];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">عاداتي اليوم</span>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-brand-600 hover:text-brand-700 p-1"
        >
          <Plus size={16} />
        </button>
      </div>

      {showAdd && (
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          <div className="flex gap-1 flex-wrap">
            {ICONS.map((ic) => (
              <button
                key={ic}
                onClick={() => setNewIcon(ic)}
                className={`text-lg p-1 rounded-lg ${newIcon === ic ? "bg-brand-100 ring-1 ring-brand-400" : "hover:bg-gray-200"}`}
              >
                {ic}
              </button>
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
              className="bg-brand-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-brand-700"
            >
              إضافة
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {habits.map((habit) => {
          const done = habit.logs.includes(todayStr);
          return (
            <button
              key={habit.id}
              onClick={() => toggleHabitLog(habit.id, todayStr)}
              className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all text-right ${
                done
                  ? "bg-brand-50 border-brand-200 text-brand-700"
                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              <span className="text-xl">{habit.icon}</span>
              <span className="text-sm font-medium flex-1">{habit.name}</span>
              {done && <Check size={14} className="text-brand-500 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
