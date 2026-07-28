// ===================== العدّ التنازلي للأحداث المهمّة =====================
// حسابٌ نقيّ بلا DOM ولا تخزين (يعبر إلى الغلاف الأصليّ كما هو). القاعدة
// الحاكمة هنا هي قاعدة التواريخ في هذا المستودع: المفاتيح محلّية `YYYY-MM-DD`
// وتُقارَن عبر `parseDate` (منتصف اليوم المحلّي) — لا `toISOString()` ولا
// `Date.now()` مباشرةً، وإلّا أزاح UTC اليومَ في الخليج فقال «باقي يومان»
// ليلةَ الحدث.
import type { CountdownEvent } from "./types";
import { parseDate, today } from "./utils";

const DAY_MS = 24 * 60 * 60 * 1000;

// عدد الأيام من `fromKey` إلى تاريخ الحدث: موجبٌ قبله، صفرٌ يومَه، سالبٌ بعده.
// الطرح على منتصف اليوم المحلّي يجعل الفارق سليماً حتى عبر التوقيت الصيفي.
export function daysUntil(dateKey: string, fromKey: string = today()): number {
  const target = parseDate(dateKey).getTime();
  const from = parseDate(fromKey).getTime();
  return Math.round((target - from) / DAY_MS);
}

// كم يبقى الحدثُ معروضاً بعد مروره؟ يومٌ واحد للحدث العادي (كي لا يختفي صباح
// يومه التالي وأنت ما زلت فيه)، وبلا حدٍّ لِما وُسم `countUpAfter` (الميلاد
// يُعدّ منه لا إليه).
const GRACE_DAYS = 1;

export function isVisible(e: CountdownEvent, fromKey: string = today()): boolean {
  const d = daysUntil(e.date, fromKey);
  return d >= 0 || e.countUpAfter === true || d >= -GRACE_DAYS;
}

// ترتيب العرض: الأقربُ وقوعاً أولاً. الأحداث القادمة (d >= 0) تتقدّم دائماً على
// الماضية مهما قرُبت الماضية، ثمّ يُكسر التعادل بالعنوان فيثبت الترتيب عبر
// الأجهزة (لا يعتمد على ترتيب المصفوفة القادم من الدمج).
export function sortEvents(events: CountdownEvent[], fromKey: string = today()): CountdownEvent[] {
  return [...events].sort((a, b) => {
    const da = daysUntil(a.date, fromKey);
    const db = daysUntil(b.date, fromKey);
    const fa = da >= 0 ? 0 : 1;
    const fb = db >= 0 ? 0 : 1;
    if (fa !== fb) return fa - fb;
    // القادمة تصاعدياً (الأقرب أولاً)، والماضية تنازلياً (الأحدث مروراً أولاً).
    if (da !== db) return fa === 0 ? da - db : db - da;
    return a.title.localeCompare(b.title, "ar");
  });
}

// الأحداث المعروضة مرتّبة — بوابةٌ واحدة تستعملها البطاقة وصفحة الإعدادات معاً.
export function visibleEvents(
  events: CountdownEvent[] | undefined,
  fromKey: string = today()
): CountdownEvent[] {
  return sortEvents((events ?? []).filter((e) => isVisible(e, fromKey)), fromKey);
}

// صياغةٌ عربية سليمة للعدد (مثنّى وجمع) — «باقي يومان» لا «باقي 2 يوم».
export function describeDays(days: number): string {
  if (days === 0) return "اليوم";
  if (days === 1) return "غداً";
  if (days === -1) return "أمس";
  const n = Math.abs(days);
  // «بعد/قبل» حرفا جرّ، فالمثنّى بعدهما منصوبٌ: «يومين» لا «يومان».
  const unit =
    n === 2 ? "يومين" : n >= 3 && n <= 10 ? `${n} أيام` : `${n} يوماً`;
  return days > 0 ? `بعد ${unit}` : `قبل ${unit}`;
}

// «شهر/شهران/أشهر» — مشتركةٌ بين المدّة الكاملة وبقيّتها بعد السنوات، فلا
// يخرج «سنة و1 شهراً».
function monthsPhrase(m: number): string {
  return m === 1 ? "شهر" : m === 2 ? "شهران" : m <= 10 ? `${m} أشهر` : `${m} شهراً`;
}

// وحداتٌ أكبر للأحداث البعيدة — «بعد 8 أشهر» أوضح من «بعد 243 يوماً». تُعرض
// كسطرٍ ثانٍ بجانب عدد الأيام لا بدلاً منه (الرقم الدقيق هو المطلوب أصلاً).
export function coarseDistance(days: number): string | null {
  const n = Math.abs(days);
  if (n < 30) return null;
  const months = Math.round(n / 30.44);
  if (months < 12) return `${monthsPhrase(months)} تقريباً`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const y = years === 1 ? "سنة" : years === 2 ? "سنتان" : `${years} سنوات`;
  return rem === 0 ? `${y} تقريباً` : `${y} و${monthsPhrase(rem)} تقريباً`;
}

// نسبة تقدّمٍ من لحظة إنشاء العدّاد إلى الحدث (0..1) — للقوس البصريّ في
// البطاقة. بلا نقطة بداية معروفة نستعمل نافذةً ثابتة (90 يوماً) فيبقى القوس
// ذا معنىً بدل أن يقفز من صفرٍ إلى واحد.
const DEFAULT_WINDOW_DAYS = 90;

export function progressTo(days: number, windowDays = DEFAULT_WINDOW_DAYS): number {
  if (days <= 0) return 1;
  if (days >= windowDays) return 0;
  return 1 - days / windowDays;
}
