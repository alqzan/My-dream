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
 * يعيد كل الصلوات المستحقّة مرتّبةً بالزمن — الأقدمُ أوّلاً.
 *
 * قبلَها كنّا نختار آخر صلاةٍ فقط ضمن نافذة ثماني ساعات، فمن فتح التطبيق مساءً
 * لم يُسأل إلا عن آخر صلاة وضاع ما قبلها بلا تسجيل. ثمّ صارت تجمع اليومَ كلَّه،
 * وهي الآن تمتدّ لأيامٍ مضت (`duePrayerRemindersRange`).
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


/* ═══════════════════ المطالبة تمتدّ لما مضى من الأيام ═══════════════════ */

/**
 * كم يوماً إلى الوراء تُجمع المطالبة.
 *
 * **لماذا حدٌّ أصلاً؟** بلا حدٍّ تفتح المطالبةُ على المالك صلواتِ شهورٍ لم
 * يسجّلها قطّ، فتصير حائطَ تأنيبٍ يُغلَق ولا يُقرأ — وهو عكسُ الغرض. وسبعةُ
 * أيام تغطّي «سافرتُ أسبوعاً» و«انشغلتُ أياماً» وهما الحالتان الواقعيّتان،
 * وما قدُم عن ذلك مكانُه تقويمُ صفحة الصلاة يُعدَّل بهدوء.
 */
export const REMINDER_LOOKBACK_DAYS = 7;

/**
 * مفاتيحُ آخر `days` يومًا منتهيةً بـ`endDate` — الأقدمُ أوّلاً.
 * (لا `Date` في التوقيع: مفاتيحُ التاريخ محليّةٌ نصّية كما في كلّ المستودع.)
 */
export function lookbackDates(endDate: string, days = REMINDER_LOOKBACK_DAYS): string[] {
  const [y, m, d] = endDate.split("-").map(Number);
  const end = new Date(y, m - 1, d);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const cur = new Date(end);
    cur.setDate(cur.getDate() - i);
    const mm = String(cur.getMonth() + 1).padStart(2, "0");
    const dd = String(cur.getDate()).padStart(2, "0");
    out.push(`${cur.getFullYear()}-${mm}-${dd}`);
  }
  return out;
}

/**
 * كلُّ ما استُحقّ ولم يُسجَّل عبر عدّة أيام، الأقدمُ أوّلاً.
 *
 * المواقيتُ والسجلُّ يُطلبان بدالّتين لا يُمرَّران جدولاً جاهزاً: حسابُ مواقيت
 * سبعةِ أيامٍ يقع عند النداء، والدالّة تبقى نقيّةً قابلةً للاختبار بمواقيت
 * مصنوعة.
 */
export function duePrayerRemindersRange(
  now: Date,
  dates: string[],
  timesFor: (date: string) => Record<PrayerName, Date> | null,
  logFor: (date: string) => PrayerLog | undefined,
  delayMs = PRAYER_REMINDER_DELAY_MS
): PrayerReminderCandidate[] {
  return dates
    .flatMap((date) => duePrayerReminders(now, date, timesFor(date), logFor(date), delayMs))
    .sort((a, b) => a.adhanAt.getTime() - b.adhanAt.getTime());
}

/** تجميعُ الصفوف بيومها — الأقدمُ أوّلاً، وترتيبُ الفروض داخل اليوم محفوظ. */
export function groupByDate(
  candidates: PrayerReminderCandidate[]
): { date: string; items: PrayerReminderCandidate[] }[] {
  const byDate = new Map<string, PrayerReminderCandidate[]>();
  for (const c of candidates) {
    const list = byDate.get(c.date);
    if (list) list.push(c);
    else byDate.set(c.date, [c]);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, items]) => ({ date, items }));
}

/**
 * مسمّى اليوم في ترويسة مجموعته: «اليوم · أمس · قبل يومين · قبل ٣ أيام».
 * نصٌّ نقيٌّ يُختبر، والأرقامُ تُهنَّد عند العرض لا هنا.
 *
 * **للماضي واليومِ الجاري فقط.** تاريخٌ قادمٌ يُرجع «اليوم» — فلا تُنادِها على
 * تاريخٍ قد يكون في المستقبل (تقويمُ الشهر يعرض أياماً قادمة) دون أن تحرس
 * ذلك عند النداء؛ المطالبةُ لا تُنتج تواريخَ قادمةً أصلاً.
 */
export function relativeDayLabel(date: string, todayStr: string): string {
  const day = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).getTime(); };
  const diff = Math.round((day(todayStr) - day(date)) / 864e5);
  if (diff <= 0) return "اليوم";
  if (diff === 1) return "أمس";
  if (diff === 2) return "قبل يومين";
  return `قبل ${diff} أيام`;
}
