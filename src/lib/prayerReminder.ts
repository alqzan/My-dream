import type { PrayerLog, PrayerName } from "./types";
import { PRAYERS } from "./types";

/** مدة الانتظار بعد الأذان قبل مطالبة التسجيل. */
export const PRAYER_REMINDER_DELAY_MS = 30 * 60 * 1000;

export interface PrayerReminderCandidate {
  date: string;
  prayer: PrayerName;
  adhanAt: Date;
  remindAt: Date;
  token: string;
}
/**
 * يعيد كل الصلوات التي حان تذكيرها ولم تُسجّل بعد.
 *
 * لا نعتبر «فائتة» أو «قضاء» حالةً فارغة: إذا اختار المالك إحدى الحالتين
 * فهذا قرارٌ صريح، ولا ينبغي للمطالبة أن تعيد فتح نفسها فوقه. كما أن ترتيب
 * `PRAYERS` يحافظ على ترتيب اليوم، وتتكفّل الواجهة باختيار أول عنصر غير مؤجّل.
 */
export function duePrayerReminders(
  now: Date,
  date: string,
  times: Record<PrayerName, Date> | null,
  log: PrayerLog | undefined,
  delayMs = PRAYER_REMINDER_DELAY_MS
): PrayerReminderCandidate[] {
  if (!times) return [];
  const nowMs = now.getTime();
  return PRAYERS.flatMap((prayer) => {
    const adhanAt = times[prayer];
    if (!(adhanAt instanceof Date) || !Number.isFinite(adhanAt.getTime())) return [];
    const remindAt = new Date(adhanAt.getTime() + delayMs);
    const status = log?.prayers[prayer];
    if (nowMs < remindAt.getTime() || (status && status !== "لم")) return [];
    return [{
      date,
      prayer,
      adhanAt,
      remindAt,
      token: `${date}:${prayer}`,
    }];
  });
}
