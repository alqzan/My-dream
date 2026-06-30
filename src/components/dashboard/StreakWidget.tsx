"use client";
import { cn } from "@/lib/utils";

interface StreakWidgetProps {
  streak: number;
  label: string;
  icon?: string;
  color?: string;
}

export function StreakWidget({ streak, label, icon = "🔥", color = "#e07b39" }: StreakWidgetProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex items-center justify-center">
        <span
          className="text-3xl"
          style={{ filter: streak > 0 ? "none" : "grayscale(1) opacity(0.3)" }}
        >
          {icon}
        </span>
        {streak > 0 && (
          <span
            className="absolute -top-1 -left-1 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center text-white"
            style={{ backgroundColor: color }}
          >
            {streak > 99 ? "99+" : streak}
          </span>
        )}
      </div>
      <span className="text-[11px] text-gray-500 font-medium">{label}</span>
    </div>
  );
}

interface DailyStreakBannerProps {
  masterStreak: number;
  journalStreak: number;
  readingStreak: number;
  financeStreak: number;
}

export function DailyStreakBanner({
  masterStreak,
  journalStreak,
  readingStreak,
  financeStreak,
}: DailyStreakBannerProps) {
  return (
    <div
      className={cn(
        "rounded-2xl p-4 text-white",
        masterStreak > 0
          ? "bg-gradient-to-r from-orange-500 to-amber-400"
          : "bg-gradient-to-r from-gray-300 to-gray-200"
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-4xl font-bold flex items-center gap-2">
            {masterStreak}
            <span className="text-2xl">{masterStreak > 0 ? "🔥" : "💤"}</span>
          </div>
          <div className="text-sm opacity-90 mt-0.5">
            {masterStreak > 0 ? "يوم متواصل" : "ابدأ يومك اليوم!"}
          </div>
        </div>
        <div className="text-sm opacity-80 text-left">
          <div>سلسلة يومية</div>
          <div className="text-xs opacity-70">الثلاثة معاً</div>
        </div>
      </div>
      <div className="flex justify-around bg-white/20 rounded-xl p-3">
        <StreakWidget streak={journalStreak} label="مذكرات" icon="📓" color="#7c6fcd" />
        <div className="w-px bg-white/30" />
        <StreakWidget streak={financeStreak} label="مالي" icon="💰" color="#3d9640" />
        <div className="w-px bg-white/30" />
        <StreakWidget streak={readingStreak} label="قراءة" icon="📚" color="#e07b39" />
      </div>
    </div>
  );
}
