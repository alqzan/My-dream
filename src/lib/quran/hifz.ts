import type { HifzState, HifzUnit, HifzRating, HifzMistake } from "../types";
import { calcStreak, parseDate, toDateStr, today } from "../utils";
import { presetOf } from "./intensity";
import {
  TOTAL_AYAT, TOTAL_PAGES, TOTAL_JUZ, TOTAL_HIZB, idToPage, idToJuz, idToHizb, idToSurahAyah,
  juzRange, hizbRange, pageRange, describeRange, SURAHS,
} from "./meta";

export interface Portion { fromId: number; toId: number }

// نهاية المقطع اليومي انطلاقاً من startId حسب وحدة الخطة ومقدارها.
export function portionEnd(startId: number, unit: HifzUnit, amount: number): number {
  const amt = Math.max(1, Math.floor(amount) || 1);
  if (unit === "ayah") return Math.min(startId + amt - 1, TOTAL_AYAT);
  if (unit === "page") {
    const targetPage = Math.min(idToPage(startId) + amt - 1, TOTAL_PAGES);
    return Math.min(pageRange(targetPage).end, TOTAL_AYAT);
  }
  // نصف/ربع وجه — نتراكم آيةً آيةً بوزن صفحة كلٍّ منها (1/طول صفحتها)، فنبلغ
  // المقدار المطلوب من الأوجه بدقّة حتى لو بدأ المقطع من وسط وجه أو عبَر عدة
  // أوجه متفاوتة الطول (كان الحساب سابقاً نسبةً من الوجه الأول فقط ثم يُضرب).
  const frac = unit === "half" ? 0.5 : 0.25;
  const targetPages = frac * amt; // المقدار المطلوب مقيساً بالأوجه
  let acc = 0;
  let id = startId;
  while (id <= TOTAL_AYAT) {
    const pr = pageRange(idToPage(id));
    acc += 1 / (pr.end - pr.start + 1);
    if (acc >= targetPages - 1e-9) break;
    id++;
  }
  return Math.min(id, TOTAL_AYAT);
}

// ورد اليوم: المقطع التالي من الجبهة حسب الخطة (null إن لا خطة أو أُتمّ المصحف).
export function plannedPortion(s: HifzState): Portion | null {
  if (!s.plan) return null;
  const start = s.frontierId + 1;
  if (start > TOTAL_AYAT) return null;
  return { fromId: start, toId: portionEnd(start, s.plan.unit, s.plan.amount) };
}

export interface HifzProgress {
  startId: number;
  spanAyat: number; // آيات محفوظة (من نقطة البداية حتى الجبهة)
  spanPages: number; // تقديرٌ بالأوجه
  pct: number; // نسبة إتمام الخطة (من البداية إلى آخر المصحف)
  page: number; // الوجه الحالي (موضع الجبهة)
  juz: number; // الجزء الحالي
  at: { surah: number; ayah: number; surahName: string } | null; // موضع الجبهة
  remainingAyat: number; // إلى آخر المصحف
  done: boolean; // أتمّ حتى آخر المصحف
}

export function hifzProgress(s: HifzState): HifzProgress {
  const startId = s.plan?.startId ?? 1;
  const spanAyat = s.frontierId >= startId ? s.frontierId - startId + 1 : 0;
  const target = TOTAL_AYAT - startId + 1;
  const pct = target > 0 ? Math.min(100, Math.round((spanAyat / target) * 100)) : 0;
  const at = s.frontierId >= 1 ? posOf(s.frontierId) : null;
  return {
    startId,
    spanAyat,
    // الأوجه الفعلية بين بداية الخطة والجبهة من page metadata (لا نسبة عامة).
    spanPages: s.frontierId >= startId ? idToPage(s.frontierId) - idToPage(startId) + 1 : 0,
    pct,
    page: s.frontierId >= 1 ? idToPage(s.frontierId) : 0,
    juz: s.frontierId >= 1 ? idToJuz(s.frontierId) : 0,
    at,
    remainingAyat: Math.max(0, TOTAL_AYAT - s.frontierId),
    done: s.frontierId >= TOTAL_AYAT,
  };
}

export function posOf(id: number): { surah: number; ayah: number; surahName: string } {
  const { surah, ayah } = idToSurahAyah(id);
  return { surah, ayah, surahName: SURAHS[surah - 1]?.name ?? "" };
}

// سلسلة أيام الحفظ المتتابعة (جلسة في اليوم).
export function hifzStreak(s: HifzState): number {
  return calcStreak(s.sessions.map((x) => x.date));
}

// وتيرة الحفظ وتقدير موعد الإتمام. نعرض وتيرتين: على أيام النشاط (متفائلة)،
// والواقعية على آخر 30 يوماً *متضمّنةً الأيام بلا حفظ* — والتقدير يُبنى على
// الواقعية. لا نعرض موعداً إذا كانت البيانات قليلةً جداً (`enough=false`).
export interface HifzPace {
  perDay: number; // متوسط آيات/يوم على أيام النشاط
  perDayReal: number; // الوتيرة الواقعية (آخر 30 يوماً شاملةً الخمول)
  finishInDays: number | null; // على الوتيرة الواقعية (null إن لم تكفِ البيانات)
  text: string;
  enough: boolean; // هل البيانات كافية لعرض تقديرٍ موثوق؟
}
export function hifzPace(s: HifzState, todayStr: string = today()): HifzPace {
  const byDay = new Map<string, number>();
  for (const x of s.sessions) {
    byDay.set(x.date, (byDay.get(x.date) ?? 0) + (x.toId - x.fromId + 1));
  }
  const activeDays = byDay.size;
  const totalAyat = [...byDay.values()].reduce((a, b) => a + b, 0);
  const perDay = activeDays > 0 ? totalAyat / activeDays : 0;
  const remaining = Math.max(0, TOTAL_AYAT - s.frontierId);

  // الوتيرة الواقعية: مجموع آيات آخر نافذةٍ ÷ طول النافذة (بالأيام، شاملةً
  // الخمول). النافذة = أقلّ من 30 يوماً وعمر الخطة (منذ أوّل جلسة).
  const dates = [...byDay.keys()].sort();
  let perDayReal = 0;
  if (dates.length) {
    const ageDays = Math.max(1, daysBetween(dates[0], todayStr) + 1);
    const windowDays = Math.min(30, ageDays);
    const windowStart = toDateStr(new Date(parseDate(todayStr).getTime() - (windowDays - 1) * 86400000));
    let recent = 0;
    for (const [d, n] of byDay) if (d >= windowStart && d <= todayStr) recent += n;
    perDayReal = recent / windowDays;
  }

  // بياناتٌ كافية: 5 أيام نشاطٍ على الأقل وحفظٌ معتبر — وإلا لا نُقدّر موعداً.
  const enough = activeDays >= 5 && totalAyat >= 50;
  const finishInDays = enough && perDayReal > 0 && remaining > 0 ? Math.ceil(remaining / perDayReal) : null;

  let text = "";
  if (finishInDays != null) {
    if (finishInDays <= 45) text = `على وتيرتك الواقعية تُتمّ خلال ~${finishInDays} يوماً`;
    else if (finishInDays < 730) text = `على وتيرتك الواقعية تُتمّ خلال ~${Math.round(finishInDays / 30)} شهراً`;
    else text = `على وتيرتك الواقعية تُتمّ خلال ~${(finishInDays / 365).toFixed(1)} سنة`;
  }
  return { perDay, perDayReal, finishInDays, text, enough };
}

// ===================== المراجعة القريبة (نافذة متحرّكة) =====================
// أوّل خطوةٍ بعد السَّبْق: «آخر N وجه» محفوظاً حتى الجبهة — ما زال طريّاً ويحتاج
// تثبيتاً قبل أن يدخل جدول المباعدة. كلّما تقدّمت الجبهة انزلقت النافذة فخرج
// الأقدم إلى الجدول. N يأتي من شدّة التمرين (لا مقبض يدوي).
export const RANDOM_TEST_INTERVAL_DAYS = 3;

export function reviewWindowPages(s: HifzState): number {
  return presetOf(s.plan).recentPages;
}

// مقطع «آخر N وجه» المحفوظة (null إن لا محفوظ بعد).
export function recentReviewBand(s: HifzState): Portion | null {
  const from = s.plan?.startId ?? 1;
  if (s.frontierId < from) return null;
  const pages = reviewWindowPages(s);
  const frontierPage = idToPage(s.frontierId);
  const startPage = Math.max(1, frontierPage - pages + 1);
  const start = Math.max(pageRange(startPage).start, from);
  return { fromId: start, toId: s.frontierId };
}

// نطاق الأوجه الذي تغطّيه المراجعة القريبة — لاستثنائه من طابور المستحقّ فلا
// يظهر الوجه الواحد مرّتين في الجلسة نفسها.
export function recentBandPages(s: HifzState): { first: number; last: number } | null {
  const band = recentReviewBand(s);
  return band ? { first: idToPage(band.fromId), last: idToPage(band.toId) } : null;
}

// ===================== الاختبار الذكي =====================
// بدل وجهٍ عشوائيٍّ بحت (قد يعيد عليك ما راجعتَه قبل ساعة)، نرجّح الوجه الذي
// طال عهدُك به وكثُر تعثّرك فيه: النقاط = أيام الغياب + 5 لكلّ تعثّر سابق، ثمّ
// نختار عشوائياً من أعلى الثلث حتى لا يتكرّر الوجه نفسه كلّ مرّة. نستثني ما
// تغطّيه المراجعة القريبة ما دام في المحفوظ ما هو أبعد منها.
export function smartTestPortion(s: HifzState, todayStr: string): Portion | null {
  const from = s.plan?.startId ?? 1;
  if (s.frontierId < from) return null;
  const firstPage = idToPage(from);
  const lastPage = idToPage(s.frontierId);
  const band = recentBandPages(s);
  const olderLast = band ? band.first - 1 : lastPage;
  // نفضّل ما قبل النافذة القريبة، فإن لم يوجد فكلُّ المحفوظ.
  const hi = olderLast >= firstPage ? olderLast : lastPage;

  const seen = latestRatingByPage(s);
  const scored: { page: number; score: number }[] = [];
  for (let p = firstPage; p <= hi; p++) {
    const last = seen.get(p);
    const idle = last ? Math.max(0, daysBetween(last.date, todayStr)) : 60; // لم يُمَسّ قَطّ ⇒ أولى
    const lapse = last?.rating === 1 ? 5 : 0;
    scored.push({ page: p, score: idle + lapse });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  const poolSize = Math.max(1, Math.ceil(scored.length / 3));
  const pick = scored[Math.floor(Math.random() * poolSize)].page;
  const pr = pageRange(pick);
  return { fromId: Math.max(pr.start, from), toId: Math.min(pr.end, s.frontierId) };
}

// هل حان الاختبار الدوري؟ (بعد فاصلٍ من آخر اختبار، وبشرط وجود محفوظ).
export function testDue(s: HifzState, todayStr: string): boolean {
  const from = s.plan?.startId ?? 1;
  if (s.frontierId < from) return false;
  if (!s.lastTestDate) return true;
  return daysBetween(s.lastTestDate, todayStr) >= RANDOM_TEST_INTERVAL_DAYS;
}

// ===================== الأخطاء (تحديد مواضع الخطأ) =====================
// المفتاح المنطقي للموضع هو `ayahId` + `wordIndex` (null = الآية كاملة)، ويُطابَق
// عليهما مباشرةً في المتجر — لا مفتاحَ نصّياً وسيطاً بعد أن زالت لقطة المواضع
// المحلّية من شاشة التسميع (صارت تُقرأ من الحالة المحفوظة).

// الأخطاء المفتوحة (غير المُتقنة) مرتّبةً: الأكثر تكراراً أوّلاً ثم الأحدث.
export function openMistakes(s: HifzState): HifzMistake[] {
  return (s.mistakes ?? [])
    .filter((m) => !m.resolved && m.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length || (a.updatedAt < b.updatedAt ? 1 : -1));
}

// خريطة أخطاء آيةٍ بعينها: wordIndex → الخطأ (للتلوين المسبق أثناء المراجعة).
// مفتاح "all" يمثّل وسم الآية كاملةً.
export function mistakesForAyah(s: HifzState, ayahId: number): Map<number | "all", HifzMistake> {
  const m = new Map<number | "all", HifzMistake>();
  for (const x of s.mistakes ?? []) {
    if (x.ayahId !== ayahId || x.resolved || x.hits.length === 0) continue;
    m.set(x.wordIndex == null ? "all" : x.wordIndex, x);
  }
  return m;
}

// عدد الأخطاء المفتوحة الواقعة ضمن مدى معرّفات [from, to].
export function mistakesInRange(s: HifzState, from: number, to: number): number {
  return (s.mistakes ?? []).filter(
    (m) => !m.resolved && m.hits.length > 0 && m.ayahId >= from && m.ayahId <= to,
  ).length;
}

// الأخطاء المفتوحة داخل مقطعٍ مرتّبةً بموضعها في المصحف (الآية ثمّ الكلمة) —
// تُعرض تحت النصّ أثناء التسميع فيرى المستخدم ما هو موسومٌ عليه الآن، ويُزيل ما
// أتقنه بضغطة.
export function openMistakesInRange(s: HifzState, from: number, to: number): HifzMistake[] {
  return (s.mistakes ?? [])
    .filter((m) => !m.resolved && m.hits.length > 0 && m.ayahId >= from && m.ayahId <= to)
    .sort((a, b) => a.ayahId - b.ayahId || (a.wordIndex ?? -1) - (b.wordIndex ?? -1));
}

// هل هذا الموضع من تعثّر *اليوم*، أم وسمٌ سابق ما زال مفتوحاً؟ التمييز ضروريّ:
// أحمرُ الشاشة كان يخلط الاثنين، فيظنّ المستخدم أنّ وسماً قديماً خطأٌ سجّله الآن.
export function markedToday(m: Pick<HifzMistake, "hits">, todayStr: string): boolean {
  return m.hits[m.hits.length - 1] === todayStr;
}

// مواضع تعثّر اليوم داخل المقطع — أساسُ اشتقاق تقييم المراجعة. نشتقّه من الحالة
// المحفوظة لا من لقطةٍ في ذاكرة الشاشة: فإن أزلتَ وسماً أو أُغلق موضعٌ تحدّث
// التقييمُ فوراً، وإن عدتَ للشاشة بعد انقطاعٍ بقي العدد صحيحاً.
export function marksTodayInRange(s: HifzState, from: number, to: number, todayStr: string): number {
  return openMistakesInRange(s, from, to).filter((m) => markedToday(m, todayStr)).length;
}

// ===================== اختبار مواضع الخطأ =====================
// كان الموضع يُعرَض مكشوفاً وتحته زرّ «أتقنته» — لا اختبار فيه أصلاً. صار
// المُختبِر يطمس الكلمة ويسألك عنها، ونتيجتُك هي التي تقرّر:
//   • أصبتَ ⇒ okStreak++ ، وعند بلوغه MISTAKE_MASTERY يُغلَق الموضع تلقائياً.
//   • أخطأتَ ⇒ ضربةٌ جديدة (يرتفع العدّاد) وokStreak = 0 ، فيعود لاختبار الغد.
// نجاحان متتاليان يكفيان — لا رأيَ للمستخدم في «هل أتقنتُه؟» بل نتيجةُ اختبار.
export const MISTAKE_MASTERY = 2;

// عدد النجاحات المتتالية على الموضع منذ آخر خطأ (نتيجة اختبارٍ صريح لا استنتاج).
export function mistakeStreak(m: Pick<HifzMistake, "okStreak">): number {
  return Math.max(0, m.okStreak ?? 0);
}

// مواضع اليوم للاختبار: المفتوحة التي لم تُختبَر اليوم بعد، الأكثر تكراراً أوّلاً
// (وهو ترتيب openMistakes)، مقصورةً على سقف شدّة التمرين.
//
// السقف *يوميّ* لا «سقفٌ لكلّ دفعة»: نخصم ما اختُبِر اليوم فعلاً — بما فيه ما
// أُغلق منه فخرج من المفتوحة. بغير هذا الخصم، ما إن تُتمّ مواضع الجلسة حتى يطرح
// الباقي نفسه جلسةً جديدة، فلا تنتهي جلسة اليوم أبداً ما دامت المواضع أكثر من
// السقف — وهو ما كان يُعيد بطاقة «جلسة اليوم» بعد إتمامها.
export function drillsToday(s: HifzState, todayStr: string): HifzMistake[] {
  const cap = presetOf(s.plan).drillsPerDay;
  const doneToday = (s.mistakes ?? []).filter((m) => m.lastDrill === todayStr).length;
  const left = Math.max(0, cap - doneToday);
  if (left === 0) return [];
  return openMistakes(s).filter((m) => m.lastDrill !== todayStr).slice(0, left);
}

// هل غطّى عملُ اليوم — حفظاً ومراجعةً — هذا المقطع كاملاً؟
//
// كان فحص «المراجعة القريبة» يطلب مراجعةً واحدةً تحيط بالمقطع؛ فإذا سجّلتَ ورد
// اليوم تقدّمت الجبهة فانزلقت نافذة القريبة، فلم تعُد مراجعةُ الجلسة تحيط
// بالنافذة الجديدة، فتعود الخطوة وكأنّها لم تُنجَز. هنا نجمع مدايات اليوم كلَّها
// وندمجها ثمّ نتحقّق من الغطاء — وورد اليوم يُحتسب لأنّك سمّعته مراراً في
// المُدرّب لحظة حفظه.
export function coveredToday(s: HifzState, p: Portion, todayStr: string): boolean {
  const spans = [
    ...(s.sessions ?? []).filter((x) => x.date === todayStr),
    ...(s.reviews ?? []).filter((x) => x.date === todayStr),
  ]
    .map((x) => ({ from: Math.min(x.fromId, x.toId), to: Math.max(x.fromId, x.toId) }))
    .sort((a, b) => a.from - b.from);
  let cursor = p.fromId;
  for (const sp of spans) {
    if (sp.from > cursor) break; // ثغرة: ما بعدها لا يسدّ ما قبلها
    if (sp.to >= cursor) cursor = sp.to + 1;
    if (cursor > p.toId) return true;
  }
  return cursor > p.toId;
}

// ===================== اشتقاق التقييم من الأخطاء =====================
// أنت تسِم مواضع تعثّرك أثناء التسميع، فلا معنى لأن نسألك بعدها «كيف كانت
// مراجعتك؟» — الجواب عندنا. القاعدة صريحة ومفهومة:
//   • لا موضع        ⇒ متقن (3)
//   • حتى حدّ التسامح ⇒ جيّد (2)   — الحدّ = آيتان لكلّ عشر آيات، وأدناه موضعان
//   • فوق ذلك        ⇒ يحتاج إتقاناً (1)
// يبقى للمستخدم أن يخالف الاشتقاق بضغطة (قد يكون تعثّره لحناً لا نسياناً).
export function mistakeTolerance(ayatCount: number): number {
  return Math.max(2, Math.round(Math.max(1, ayatCount) / 5));
}

export function gradeFromMistakes(marks: number, ayatCount: number): HifzRating {
  if (marks <= 0) return 3;
  return marks <= mistakeTolerance(ayatCount) ? 2 : 1;
}

export const RATING_LABEL: Record<HifzRating, string> = {
  3: "متقن",
  2: "جيّد",
  1: "يحتاج إتقاناً",
};

// جملةٌ تشرح للمستخدم لماذا خرج هذا التقييم — لا رقمٌ يهبط بلا سبب.
export function explainGrade(marks: number, ayatCount: number): string {
  if (marks <= 0) return `سمّعتَ ${countAyat(ayatCount)} بلا تعثّر`;
  return `${countSpots(marks)} في ${countAyat(ayatCount)}`;
}

export function countAyat(n: number): string {
  if (n === 1) return "آية واحدة";
  if (n === 2) return "آيتين";
  return n <= 10 ? `${n} آيات` : `${n} آية`;
}

export function countSpots(n: number): string {
  if (n === 1) return "موضعٌ واحد";
  if (n === 2) return "موضعان";
  return n <= 10 ? `${n} مواضع` : `${n} موضعاً`;
}

// صيغة الأوجه بعربيةٍ سليمة وأرقامٍ لاتينية (تُستعمل في ملخّص الجلسة).
export function countPages(n: number): string {
  if (n === 1) return "وجه واحد";
  if (n === 2) return "وجهان";
  return n <= 10 ? `${n} أوجه` : `${n} وجهاً`;
}

// صيغة الأيام (لعرض موعد المراجعة القادمة).
export function countDays(n: number): string {
  if (n <= 0) return "اليوم";
  if (n === 1) return "غداً";
  if (n === 2) return "بعد يومين";
  return n <= 10 ? `بعد ${n} أيام` : `بعد ${n} يوماً`;
}

// أحدث تقييمٍ مسّ كلَّ وجهٍ محفوظ (بتداخل الوجه لا بمطابقة المدى النصّي). هكذا
// إذا كان وجهٌ ضعيفاً ثمّ راجعه المستخدم لاحقاً ضمن مدى مختلف وأتقنه، تتحدّث
// حالتُه — كان المفتاح النصّي `fromId-toId` يُبقيه ضعيفاً لأنّ المدى اختلف.
export function latestRatingByPage(s: HifzState): Map<number, { date: string; rating?: HifzRating }> {
  const from = s.plan?.startId ?? 1;
  const m = new Map<number, { date: string; rating?: HifzRating }>();
  if (s.frontierId < from) return m;
  const firstPage = idToPage(from);
  const lastPage = idToPage(s.frontierId);
  const events = [
    ...s.sessions.map((x) => ({ fromId: x.fromId, toId: x.toId, date: x.date, rating: x.rating })),
    ...s.reviews.map((x) => ({ fromId: x.fromId, toId: x.toId, date: x.date, rating: x.rating })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1)); // تصاعدي: الأحدث يكتب أخيراً
  for (const e of events) {
    const ef = Math.max(firstPage, idToPage(e.fromId));
    const et = Math.min(lastPage, idToPage(e.toId));
    for (let p = ef; p <= et; p++) m.set(p, { date: e.date, rating: e.rating });
  }
  return m;
}

// مواطن الضعف: أوجهٌ أحدثُ تقييمٍ مسّها «يحتاج إتقاناً» (1). تُدمَج الأوجه
// المتّصلة في مدى واحد (بتاريخ أقدم مراجعةٍ فيها) ويُرتَّب الأحوجُ (الأقدم) أوّلاً.
export function weakSpots(s: HifzState): { fromId: number; toId: number; date: string }[] {
  const from = s.plan?.startId ?? 1;
  const byPage = latestRatingByPage(s);
  const weakPages = [...byPage.entries()]
    .filter(([, v]) => v.rating === 1)
    .map(([page, v]) => ({ page, date: v.date }))
    .sort((a, b) => a.page - b.page);

  // ادمج الأوجه المتّصلة في مقاطع.
  const spans: { fromId: number; toId: number; date: string }[] = [];
  for (const wp of weakPages) {
    const pr = pageRange(wp.page);
    const fromId = Math.max(pr.start, from);
    const toId = Math.min(pr.end, s.frontierId);
    const last = spans[spans.length - 1];
    if (last && idToPage(last.toId) === wp.page - 1) {
      last.toId = toId;
      if (wp.date < last.date) last.date = wp.date; // أقدم مراجعةٍ في المقطع
    } else {
      spans.push({ fromId, toId, date: wp.date });
    }
  }
  return spans.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 8);
}

// ===================== خريطة الحفظ =====================
// حالة كل جزءٍ من الثلاثين للعرض في لوحة كاملة: ما حُفظ، ما رُوجع حديثاً، وما
// يحتاج مراجعة. الفاصل الزمني الذي يُعدّ بعده الجزءُ «محتاجاً للمراجعة».
export const REVIEW_DUE_DAYS = 7;

export type JuzState = "none" | "partial" | "fresh" | "due" | "weak";

// حبيبة الخريطة: أجزاء (30)، أحزاب (60)، أو أوجه (604).
export type MapUnit = "juz" | "hizb" | "page";

export interface UnitCell {
  n: number; // رقم الوحدة (1-based)
  start: number; // معرّف أوّل آية في الوحدة
  end: number; // معرّف آخر آية
  totalAyat: number;
  memorizedAyat: number;
  fill: number; // 0..1 نسبة المحفوظ من الوحدة
  memStart: number; // معرّف أوّل آية محفوظة (0 إن لا شيء)
  memEnd: number;
  lastDate?: string; // آخر حفظٍ/مراجعةٍ مسّت الوحدة
  lastRating?: HifzRating;
  daysSince: number | null;
  state: JuzState;
}

export const MAP_UNIT_COUNT: Record<MapUnit, number> = { juz: TOTAL_JUZ, hizb: TOTAL_HIZB, page: TOTAL_PAGES };

function unitRange(unit: MapUnit, n: number) {
  return unit === "juz" ? juzRange(n) : unit === "hizb" ? hizbRange(n) : pageRange(n);
}
function unitOf(unit: MapUnit, id: number): number {
  return unit === "juz" ? idToJuz(id) : unit === "hizb" ? idToHizb(id) : idToPage(id);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

// حالة كل وحدة (جزء/حزب/وجه) للعرض في الخريطة.
export function hifzUnits(s: HifzState, todayStr: string, unit: MapUnit): UnitCell[] {
  const from = s.plan?.startId ?? 1;
  const frontierUnit = s.frontierId >= 1 ? unitOf(unit, s.frontierId) : 0;
  const events = [
    ...s.sessions.map((x) => ({ from: x.fromId, to: x.toId, date: x.date, rating: x.rating })),
    ...s.reviews.map((x) => ({ from: x.fromId, to: x.toId, date: x.date, rating: x.rating })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));

  const count = MAP_UNIT_COUNT[unit];
  const cells: UnitCell[] = [];
  for (let n = 1; n <= count; n++) {
    const r = unitRange(unit, n);
    const total = r.end - r.start + 1;
    const memStart = Math.max(r.start, from);
    const memEnd = Math.min(r.end, s.frontierId);
    const memAyat = Math.max(0, memEnd - memStart + 1);
    if (memAyat === 0) {
      cells.push({ n, start: r.start, end: r.end, totalAyat: total, memorizedAyat: 0, fill: 0, memStart: 0, memEnd: 0, daysSince: null, state: "none" });
      continue;
    }
    const overlapping = events.filter((e) => e.to >= r.start && e.from <= r.end);
    const last = overlapping[overlapping.length - 1];
    const daysSince = last ? daysBetween(last.date, todayStr) : null;
    let state: JuzState;
    if (last?.rating === 1) state = "weak";
    else if (memAyat < total && n === frontierUnit) state = "partial";
    else if (daysSince == null || daysSince >= REVIEW_DUE_DAYS) state = "due";
    else state = "fresh";
    cells.push({
      n, start: r.start, end: r.end, totalAyat: total, memorizedAyat: memAyat, fill: memAyat / total,
      memStart, memEnd, lastDate: last?.date, lastRating: last?.rating, daysSince, state,
    });
  }
  return cells;
}

export interface HifzMapCounts { memorized: number; fresh: number; due: number; weak: number; partial: number }
export function mapCounts(cells: UnitCell[]): HifzMapCounts {
  const c: HifzMapCounts = { memorized: 0, fresh: 0, due: 0, weak: 0, partial: 0 };
  for (const x of cells) {
    if (x.state === "none") continue;
    c.memorized++;
    if (x.state === "fresh") c.fresh++;
    else if (x.state === "due") c.due++;
    else if (x.state === "weak") c.weak++;
    else if (x.state === "partial") c.partial++;
  }
  return c;
}

// ===================== سلسلة تقدّم الحفظ عبر الزمن =====================
// نقاط يومية بعدد الآيات المحفوظة تراكمياً منذ بداية الخطة حتى اليوم — للرسم
// البياني. تُبنى من مجموع آيات الجلسات في كل يوم.
export interface HifzPoint { date: string; ayat: number; cumAyat: number }

export function hifzSeries(s: HifzState, todayStr: string): HifzPoint[] {
  if (!s.plan || !s.sessions.length) return [];
  const perDay = new Map<string, number>();
  for (const x of s.sessions) perDay.set(x.date, (perDay.get(x.date) ?? 0) + (x.toId - x.fromId + 1));
  const startStr = [...perDay.keys()].sort()[0] ?? s.plan.createdAt;
  const start = parseDate(startStr);
  const end = parseDate(todayStr);
  const out: HifzPoint[] = [];
  let cum = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = toDateStr(d);
    const ayat = perDay.get(key) ?? 0;
    cum += ayat;
    out.push({ date: key, ayat, cumAyat: cum });
  }
  return out;
}

// مجموع الآيات المحفوظة خلال آخر N يوماً (اليوم ضمنها).
export function memorizedInWindow(s: HifzState, days: number, todayStr: string): number {
  const cutoff = parseDate(todayStr);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutStr = toDateStr(cutoff);
  return s.sessions
    .filter((x) => x.date >= cutStr && x.date <= todayStr)
    .reduce((a, x) => a + (x.toId - x.fromId + 1), 0);
}

// تحويل عدد الآيات إلى تقديرٍ بالأوجه.
export function ayatToPages(ayat: number): number {
  return Math.round((ayat / TOTAL_AYAT) * TOTAL_PAGES);
}

// مقارنة الوتيرة: آيات آخر 30 يوماً مقابل الـ30 التي قبلها.
export interface PaceCompare { thisMonth: number; prevMonth: number; deltaPct: number | null; faster: boolean }
export function paceCompare(s: HifzState, todayStr: string): PaceCompare {
  const last30 = memorizedInWindow(s, 30, todayStr);
  const prev30 = memorizedInWindow(s, 60, todayStr) - last30;
  const deltaPct = prev30 > 0 ? Math.round(((last30 - prev30) / prev30) * 100) : null;
  return { thisMonth: last30, prevMonth: prev30, deltaPct, faster: last30 >= prev30 };
}

// تقرير حفظٍ نصّي مختصر — للنسخ/المشاركة.
export function hifzReport(s: HifzState, todayStr: string): string {
  if (!s.plan) return "لا توجد خطة حفظ بعد.";
  const prog = hifzProgress(s);
  const pace = hifzPace(s);
  const streak = hifzStreak(s);
  const startName = SURAHS[idToSurahAyah(s.plan.startId).surah - 1]?.name ?? "";
  const completed: number[] = [];
  for (let j = 1; j <= 30; j++) {
    const r = juzRange(j);
    if (r.start >= s.plan.startId && r.end <= s.frontierId) completed.push(j);
  }
  const weak = weakSpots(s).map((w) => describeRange(w.fromId, w.toId));
  const L: string[] = [];
  L.push(`📖 تقرير الحفظ — ${todayStr}`);
  L.push("");
  L.push(`الخطة: تبدأ من سورة ${startName}`);
  L.push(`الموضع الحالي: ${prog.at ? `${prog.at.surahName} ${prog.at.ayah}` : "—"} · صفحة ${prog.page}/${TOTAL_PAGES} · الجزء ${prog.juz}`);
  L.push(`المحفوظ: ${prog.spanAyat} آية ≈ ${prog.spanPages} وجه (${prog.pct}%)`);
  L.push(`سلسلة الحفظ: ${streak} يوم`);
  if (pace.text) L.push(`الوتيرة: ${pace.text.replace("على وتيرتك ", "")}`);
  L.push(`الأجزاء المكتملة (${completed.length}): ${completed.length ? completed.join("، ") : "لا شيء بعد"}`);
  if (weak.length) L.push(`مواطن تحتاج إتقاناً: ${weak.join(" · ")}`);
  L.push("");
  L.push("— من تطبيق مدار");
  return L.join("\n");
}
