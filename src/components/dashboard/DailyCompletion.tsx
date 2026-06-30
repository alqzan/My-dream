"use client";
import { today } from "@/lib/utils";
import { CheckCircle, Circle } from "lucide-react";

interface DailyTask {
  label: string;
  done: boolean;
  icon: string;
  href: string;
}

interface DailyCompletionProps {
  hasTodayJournal: boolean;
  hasTodayFinance: boolean;
  hasTodayReading: boolean;
}

export function DailyCompletion({
  hasTodayJournal,
  hasTodayFinance,
  hasTodayReading,
}: DailyCompletionProps) {
  const tasks: DailyTask[] = [
    { label: "كتبت مذكرة", done: hasTodayJournal, icon: "📓", href: "/journal" },
    { label: "سجّلت مصروف", done: hasTodayFinance, icon: "💰", href: "/finance" },
    { label: "قرأت اليوم", done: hasTodayReading, icon: "📚", href: "/reading" },
  ];

  const completedCount = tasks.filter((t) => t.done).length;
  const allDone = completedCount === 3;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">إنجازات اليوم</span>
        <span className="text-xs text-gray-400">{completedCount}/3</span>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <div
            key={task.label}
            className="flex items-center gap-3 py-2 px-3 rounded-xl bg-gray-50"
          >
            <span className="text-lg">{task.icon}</span>
            <span
              className={
                task.done
                  ? "text-sm text-gray-500 line-through"
                  : "text-sm text-gray-800"
              }
            >
              {task.label}
            </span>
            <div className="mr-auto">
              {task.done ? (
                <CheckCircle size={18} className="text-green-500" />
              ) : (
                <Circle size={18} className="text-gray-300" />
              )}
            </div>
          </div>
        ))}
      </div>
      {allDone && (
        <div className="text-center py-2 text-sm font-bold text-amber-600 bg-amber-50 rounded-xl">
          🎉 أكملت يومك — السلسلة مستمرة!
        </div>
      )}
    </div>
  );
}
