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
 * يعيد كل الصلوات المستحقّة اليوم مرتّبةً بترتيب اليوم.
 *
 * قبلَها كنّا نختار آخر صلاةٍ فقط ضمن نافذة ثماني ساعات، فمن فتح التطبيق مساءً
 * لم يُسأل إلا عن آخر صلاة وضاع ما قبلها بلا تسجيل. المطالبةُ الآن واحدةٌ
 * تجمعها كلَّها — والحدُّ الطبيعيّ هو اليومُ نفسه، إذ `duePrayerReminders`
 * محصورةٌ أصلاً في تاريخٍ واحد، ولمن لا يريدها زرُّ «لا تذكرني اليوم».
 */
export function pickPrayerReminderGroup(
  candidates: PrayerReminderCandidate[],
  now: Date
): PrayerReminderCandidate[] {
  const nowMs = now.getTime();
  return candidates
    .filter((candidate) => candidate.remindAt.getTime() <= nowMs)
    .sort((a, b) => a.adhanAt.getTime() - b.adhanAt.getTime());
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
    // أي حالةٍ موجودة غير «لم» تعني أن المستخدم حسم الصلاة — حتى لو كانت
    // «فائتة» أو «قضاء». لا نعتمد على truthiness هنا حتى لا تعود مطالبة سجلٍ
    // قديم يحمل قيمةً فارغةً أو غير متوقعة.
    if (nowMs < remindAt.getTime() || (status !== undefined && status !== "لم")) return [];
    return [{
      date,
      prayer,
      adhanAt,
      remindAt,
      token: `${date}:${prayer}`,
    }];
  });
}
