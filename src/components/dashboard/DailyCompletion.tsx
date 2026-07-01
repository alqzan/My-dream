"use client";
import Link from "next/link";
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

// Small circular 0..3 progress ring next to the section title.
function ProgressRing({ completed }: { completed: number }) {
  const size = 34;
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const on = (c * completed) / 3;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="currentColor" className="text-gray-200 dark:text-[#3a2e1e]" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={completed === 3 ? "#3d9640" : "#c9852a"}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${on} ${c - on}`}
          style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.16,1,0.3,1), stroke 0.3s" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-600">
        {completed}/3
      </span>
    </div>
  );
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
        <ProgressRing completed={completedCount} />
      </div>
      <div className="space-y-2">
        {tasks.map((task) => (
          <Link
            href={task.href}
            key={task.label}
            className="flex items-center gap-3 py-2 px-3 rounded-xl bg-gray-50 hover:bg-gray-100 press transition"
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
                <span className="block animate-pop-in">
                  <CheckCircle size={18} className="text-green-500" />
                </span>
              ) : (
                <Circle size={18} className="text-gray-300" />
              )}
            </div>
          </Link>
        ))}
      </div>
      {allDone && (
        <div className="text-center py-2 text-sm font-bold text-amber-600 bg-amber-50 rounded-xl animate-pop-in">
          🎉 أكملت يومك — السلسلة مستمرة!
        </div>
      )}
    </div>
  );
}
