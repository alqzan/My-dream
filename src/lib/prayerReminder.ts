import type { PrayerLog, PrayerName } from "./types";
import { PRAYERS } from "./types";

/** مدة الانتظار بعد الأذان قبل مطالبة التسجيل. */
export const PRAYER_REMINDER_DELAY_MS = 30 * 60 * 1000;

/** لا نوقظ المستخدم بسبب صلاةٍ قديمة جداً عند فتح التطبيق. */
export const PRAYER_REMINDER_MAX_AGE_MS = 4 * 60 * 60 * 1000;

export interface PrayerReminderCandidate {
  date: string;
  prayer: PrayerName;
  adhanAt: Date;
  remindAt: Date;
  token: string;
}

/**
 * يختار تذكيراً واحداً حديثاً فقط.
 *
 * عندما يعود المستخدم بعد ساعات قد تكون عدة صلوات غير مسجلة. اختيار أقدمها
 * يجعل النافذة تبدو كأنها تتراكم وتعيد نفسها، لذلك نأخذ آخر صلاة مستحقة ضمن
 * عمرٍ معقول ونترك الصلوات الأقدم للسجل اليدوي داخل شاشة الصلاة.
 */
export function pickSmartPrayerReminder(
  candidates: PrayerReminderCandidate[],
  now: Date,
  maxAgeMs = PRAYER_REMINDER_MAX_AGE_MS
): PrayerReminderCandidate | null {
  const nowMs = now.getTime();
  const ageLimit = Math.max(0, maxAgeMs);
  return candidates
    .filter((candidate) => {
      const age = nowMs - candidate.remindAt.getTime();
      return age >= 0 && age <= ageLimit;
    })
    .sort((a, b) => b.adhanAt.getTime() - a.adhanAt.getTime())[0] ?? null;
}

/** آخر وقت أذانٍ حُسمت صلاته، حتى لا نعيد فتح سجلٍ أقدم بعد إجابة الأحدث. */
export function latestRecordedPrayerAt(
  times: Record<PrayerName, Date> | null,
  log: PrayerLog | undefined
): number {
  if (!times || !log) return 0;
  return PRAYERS.reduce((latest, prayer) => {
    const status = log.prayers[prayer];
    const adhanAt = times[prayer];
    if (status === undefined || status === "لم" || !(adhanAt instanceof Date)) return latest;
    const timestamp = adhanAt.getTime();
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, 0);
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
