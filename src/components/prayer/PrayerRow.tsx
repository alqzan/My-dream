"use client";
import type { PrayerName, PrayerStatus } from "@/lib/types";
import { PRAYER_META, PRAYER_STATUS_META } from "@/lib/types";
import { buzz } from "@/lib/utils";

interface PrayerRowProps {
  prayer: PrayerName;
  status: PrayerStatus;
  onChange: (status: PrayerStatus) => void;
}

const OPTIONS: PrayerStatus[] = ["لم", "منفردة", "جماعة"];

export function PrayerRow({ prayer, status, onChange }: PrayerRowProps) {
  const meta = PRAYER_META[prayer];
  const active = PRAYER_STATUS_META[status];

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-gray-50">
      <span className="text-xl w-7 text-center shrink-0">{meta.icon}</span>
      <span className="text-sm font-semibold text-gray-800 w-14 shrink-0">{prayer}</span>
      <div className="flex-1 flex gap-1 bg-white rounded-lg p-1 border border-gray-100">
        {OPTIONS.map((opt) => {
          const isActive = opt === status;
          const optMeta = PRAYER_STATUS_META[opt];
          return (
            <button
              key={opt}
              onClick={() => { if (!isActive && opt !== "لم") buzz(); onChange(opt); }}
              className="flex-1 text-[11px] font-medium py-1.5 rounded-md transition-colors"
              style={
                isActive
                  ? { backgroundColor: optMeta.color, color: "#fff" }
                  : { color: "#9a8c72" }
              }
            >
              {opt === "لم" ? "لم أصلِّ" : opt === "منفردة" ? "منفرداً" : "بالمسجد"}
            </button>
          );
        })}
      </div>
      <span className="sr-only">{active.label}</span>
    </div>
  );
}
