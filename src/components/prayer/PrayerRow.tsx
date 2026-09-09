"use client";
/**
 * صفُّ تعديلِ فرضٍ في **يومٍ مضى** (نافذةُ سجلّ الشهر).
 *
 * كان هذا الموضعُ آخرَ ما بقي على شكله القديم: زرّان ونصفٌ بأسلوب Tailwind
 * الرماديّ، بحالاتٍ ثلاثٍ لا أربع (لا «فاتتني» ولا «قضاءً» أصلاً) وبصياغةٍ
 * تخالف ما يراه المالك في المطالبة وفي صفحة الصلاة. صار يسأل السؤالين
 * نفسَيهما بالشكل نفسِه عبر `PrayerAnswer` — والاختلافُ الوحيد المسموح
 * كثافةُ العرض لا شكلُه.
 */
import type { KhushuLevel, PrayerName, PrayerStatus } from "@/lib/types";
import { PRAYER_META } from "@/lib/types";
import { PrayerAnswer } from "@/components/madar/prayer/PrayerAnswer";

interface PrayerRowProps {
  prayer: PrayerName;
  status: PrayerStatus;
  khushu?: KhushuLevel;
  /** «أمس» أو «قبل يومين» — يُلحق بالسؤال فيُعرف أيُّ يومٍ يُعدَّل. */
  when?: string;
  onChange: (status: PrayerStatus) => void;
  onKhushu: (level: KhushuLevel | undefined) => void;
}

export function PrayerRow({ prayer, status, khushu, when, onChange, onKhushu }: PrayerRowProps) {
  return (
    <div className="mdr mdr-answer-card">
      <span className="mdr-answer-card-icon" aria-hidden>{PRAYER_META[prayer].icon}</span>
      <PrayerAnswer
        prayer={prayer}
        when={when}
        status={status}
        khushu={khushu}
        dense
        onStatus={onChange}
        onKhushu={onKhushu}
      />
    </div>
  );
}
