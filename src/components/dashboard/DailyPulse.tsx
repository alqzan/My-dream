"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { CheckCircle2, Circle, ChevronLeft } from "lucide-react";

export interface DailyPulseRow {
  href: string;
  icon: string;
  label: string;
  sub: string;
  done: boolean;
  streak: number;
  color: string; // hex accent for the row
}

interface DailyPulseProps {
  masterStreak: number;
  rows: DailyPulseRow[];
}

// The dashboard's single "day card": the master streak + the three daily
// tasks in one place. Replaces the old streak banner + إنجازات اليوم +
// quick-link tiles, which all repeated the same three items.
export function DailyPulse({ masterStreak, rows }: DailyPulseProps) {
  const doneCount = rows.filter((r) => r.done).length;
  const allDone = doneCount === rows.length;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl card-shadow",
        masterStreak > 0 || allDone
          ? "bg-gradient-to-br from-[#a85a2c] via-[#c0842b] to-[#dca63f] shine"
          : "bg-gradient-to-br from-[#8a7a62] to-[#b3a48a]"
      )}
    >
      <div className="flex items-center justify-between p-4 pb-3 text-white">
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
          <div className="text-2xl font-bold tabular-nums">{doneCount}/{rows.length}</div>
          <div className="text-xs opacity-80">مهام اليوم</div>
        </div>
      </div>

      <div className="bg-white/95 dark:bg-[#114a3b]/95 backdrop-blur rounded-t-2xl divide-y divide-gray-100 dark:divide-[#1c5544]">
        {rows.map((row) => (
          <Link
            key={row.href}
            href={row.href}
            className="flex items-center gap-3 px-4 py-3 press"
          >
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
              style={{ backgroundColor: row.color + "1a" }}
            >
              {row.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className={cn("text-sm font-bold", row.done ? "" : "text-gray-800")}
                style={row.done ? { color: row.color } : undefined}>
                {row.label}
              </div>
              <div className="text-xs text-gray-400 truncate mt-0.5">{row.sub}</div>
            </div>
            {row.streak > 0 && (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-500/10 rounded-full px-2 py-0.5 shrink-0">
                🔥 {row.streak}
              </span>
            )}
            {row.done ? (
              <CheckCircle2 size={20} className="shrink-0 animate-pop-in" style={{ color: row.color }} />
            ) : (
              <Circle size={20} className="text-gray-300 shrink-0" />
            )}
            <ChevronLeft size={14} className="text-gray-300 shrink-0 -mr-1" />
          </Link>
        ))}
        {allDone && (
          <div className="text-center py-2.5 text-sm font-bold text-amber-600 animate-pop-in">
            🎉 أكملت يومك — السلسلة مستمرة!
          </div>
        )}
      </div>
    </div>
  );
}
