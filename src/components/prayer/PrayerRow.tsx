"use client";
/**
 * صفُّ تعديلِ فرضٍ في **يومٍ مضى** (نافذةُ سجلّ الشهر) — لا في اليوم الجاري.
 *
 * اليومُ الجاري له ورقتُه (`PrayerSheet`): سؤالان متتابعان في لحظة الصلاة.
 * وهنا لا لحظةَ تُغتنم — المالكُ يصحّح سجلَّ يومٍ مضى — فتُعرض الحالةُ ودرجةُ
 * الخشوع معاً في صفٍّ واحد، ويُنهي الأمرَ بضغطتين لا بورقةٍ تُفتح وتُغلق خمس
 * مرّات داخل نافذةٍ مفتوحةٍ أصلاً.
 */
import type { KhushuLevel, PrayerName, PrayerStatus } from "@/lib/types";
import { PRAYER_META, PRAYER_STATUS_META, KHUSHU_LEVELS, KHUSHU_META, prayerStatusMeta, isPrayedStatus } from "@/lib/types";
import { buzz } from "@/lib/utils";

interface PrayerRowProps {
  prayer: PrayerName;
  status: PrayerStatus;
  /** درجةُ الخشوع المسجّلة، إن سُئل عنها وأُجيب. */
  khushu?: KhushuLevel;
  onChange: (status: PrayerStatus) => void;
  onKhushu: (level: KhushuLevel | undefined) => void;
}

const OPTIONS: PrayerStatus[] = ["لم", "منفردة", "جماعة"];

export function PrayerRow({ prayer, status, khushu, onChange, onKhushu }: PrayerRowProps) {
  const meta = PRAYER_META[prayer];
  const active = prayerStatusMeta(status);

  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-3">
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

      {/* سؤالُ القلب يظهر لما أُدِّي وحده — ولا يُسأل عمّا لم يُصلَّ. والضغطةُ
          على الدرجة الحالية تمسحها، فالتصحيحُ لا يحتاج زرَّ مسحٍ ثالثاً. */}
      {isPrayedStatus(status) && (
        <div className="flex items-center gap-1.5 pr-10">
          <span className="text-[10.5px] text-gray-500 shrink-0 w-14">حضورُ القلب</span>
          {KHUSHU_LEVELS.map((l) => {
            const m = KHUSHU_META[l];
            const on = khushu === l;
            return (
              <button
                key={l}
                onClick={() => { buzz(); onKhushu(on ? undefined : l); }}
                aria-pressed={on}
                className="flex-1 text-[11px] font-medium py-1.5 rounded-lg border transition-colors"
                style={
                  on
                    ? { backgroundColor: m.color, borderColor: m.color, color: "#fff" }
                    : { borderColor: "#e5ded0", color: "#9a8c72" }
                }
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
