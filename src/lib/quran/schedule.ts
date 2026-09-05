// ===================== مراجعة متباعدة على مستوى الوجه =====================
// «آخر N وجه» وحدها لا تكفي لمراجعة كامل المحفوظ: تبقى الأوجه القديمة بلا موعد.
// هذا الطابور يعطي كلَّ وجهٍ محفوظ موعدَ استحقاقٍ واضحاً بقواعد مفهومة وقابلة
// للاختبار (لا خوارزمية غامضة):
//
//   • «يحتاج إتقان» (1) → مستحقٌّ غداً (ويزيد عدّاد التعثّر lapses).
//   • «جيد»        (2) → بعد 3 أيام.
//   • «متقن»       (3) → 7 ثمّ 14 ثمّ 30 ثمّ 60 يوماً عند استمرار الإتقان.
//   • أيّ خطأٍ يُعيد المقطع إلى مدةٍ قصيرة (يبدأ سلّم الإتقان من جديد).
//
// كلّ ذلك مُشتَقٌّ من سجلّي الحفظ والمراجعة الموجودَين (sessions/reviews) — بلا
// حالةٍ جديدة في AppData، فلا ترحيلَ ولا مخاطرَ دمجٍ أو نسخٍ احتياطي. الوجه هو
// الوحدة الثابتة الصغيرة (لا نطاقات عشوائية متغيّرة)، فتبقى الحالة مستقرّة عبر
// الأجهزة ما دامت الجلسات تتّحد بلا فقد.
//
// **والسلّم وحده لا يكفي.** وجهان يقفان على درجةٍ واحدة وأحدُهما تعثّرتَ فيه
// خمس مرّات والآخر ما أخطأتَ فيه قطّ — فيعودان إليك في اليوم نفسه. وثلاثةٌ
// تُصلح ذلك، كلُّها مشتقّةٌ من السجلّ نفسه بلا حقلٍ جديد:
//
//   ١. **معامل الرسوخ** (`ease`): لكلّ وجهٍ معاملٌ يُشتقّ من تقييماته هو
//      (٠٫٦ … ١٫٤) يضرب درجةَ السلّم — فيقصّرها على المتعثّر ويمدّها على
//      الراسخ. التعثّر لا يُضرَب فيه: العودةُ بعد الخطأ قصيرةٌ للجميع.
//   ٢. **مكافأة التأخّر**: من صمد حفظُه أربعين يوماً وهو مجدولٌ لأربعةَ عشر فقد
//      أثبت أطولَ ممّا ظنّ الجدول — فلا نُعيده إلى أربعةَ عشر. المدةُ القادمة
//      تأخذ ما انقضى فعلاً (بحدّ ضِعف الدرجة، وسقفٍ لا يتجاوز أعلى السلّم).
//   ٣. **الترتيب بالمخاطرة لا بالتأخّر وحده**: تأخّرُ ثلاثة أيام على مدةِ سبعةٍ
//      أخطرُ من تأخّرِ ثلاثةٍ على مدةِ ستّين. الخطر نسبةٌ لا عدد أيام، ويثقل
//      بالتعثّر وبمواضع الخطأ المفتوحة في الوجه.
//
// وسقفُ اليوم صار يتكيّف مع مواظبتك (`adaptiveReviewCap`) بدل رقمٍ ثابت: من
// انقطع يعود إلى حملٍ ألطف، ومن واظب يُرفع سقفُه فيلحق متأخّراته.

import type { HifzState, HifzRating } from "../types";
import type { Portion } from "./hifz";
import { recentBandPages, plannedPortion, openMistakes } from "./hifz";
import { presetOf, INTENSITY, DEFAULT_INTENSITY, type IntensityPreset } from "./intensity";
import { idToPage, pageRange, idToSurahAyah, SURAHS } from "./meta";
import { parseDate, toDateStr } from "../utils";

// سلّم «متوازن» (الافتراضي) — تبقى مصدّرةً للاختبارات وللعرض حين لا خطة.
export const MASTERY_LADDER: readonly number[] = INTENSITY[DEFAULT_INTENSITY].ladder;
export const RATE_NEEDS_DAYS = INTENSITY[DEFAULT_INTENSITY].needsDays; // «يحتاج إتقان» → غداً
export const RATE_GOOD_DAYS = INTENSITY[DEFAULT_INTENSITY].goodDays; // «جيد» → بعد 3 أيام

// ===================== معامل الرسوخ =====================
/** حدُّ المعامل: لا يقصر عن ٦٠٪ من درجة السلّم ولا يمدّها فوق ١٤٠٪. */
export const EASE_RANGE = { min: 0.6, max: 1.4 } as const;
export const EASE_START = 1;

/** أثرُ التقييم الواحد في المعامل — تعثّرٌ يخصم، وإتقانٌ يزيد زيادةً هادئة. */
const EASE_STEP: Record<HifzRating, number> = { 1: 0.82, 2: 0.95, 3: 1.06 };

export function clampEase(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return EASE_START;
  return Math.min(EASE_RANGE.max, Math.max(EASE_RANGE.min, Math.round(v * 100) / 100));
}

/** المعامل بعد تقييمٍ جديد. */
export function nextEase(prev: number, rating: HifzRating): number {
  return clampEase((Number.isFinite(prev) && prev > 0 ? prev : EASE_START) * EASE_STEP[rating]);
}

/**
 * درجةُ السلّم التي تقابل مدّةً ما.
 *
 * لا نطابق القيمة حرفياً (`indexOf`) لأنّ المدد صارت مضروبةً في المعامل فلا
 * تقع على أرقام السلّم بالضبط — نأخذ أقربَ درجة. وما دون ثلاثة أرباع أوّل
 * درجةٍ ليس على السلّم أصلاً (كان «جيّداً» أو «يحتاج إتقان») فيبدأ من أوّله.
 */
function rungOf(ladder: readonly number[], days: number): number {
  if (!(days > 0) || days < ladder[0] * 0.75) return -1;
  let best = 0;
  for (let i = 1; i < ladder.length; i++) {
    if (Math.abs(ladder[i] - days) < Math.abs(ladder[best] - days)) best = i;
  }
  return best;
}

export interface IntervalOpts {
  /** معامل رسوخ الوجه (1 = محايد، وهو الافتراضي فلا يتبدّل سلوكٌ قديم). */
  ease?: number;
  /** ما انقضى فعلاً منذ المراجعة السابقة — لمكافأة التأخّر عند الإتقان. */
  elapsedDays?: number;
}

// المدة القادمة لمقطعٍ حسب تقييمه ومدّته السابقة — قاعدةٌ واحدة صريحة، وأرقامها
// من شدّة التمرين المختارة، ومعاملُ رسوخه يشدّها أو يرخيها.
export function nextInterval(
  prevDays: number, rating: HifzRating, p: IntensityPreset = INTENSITY[DEFAULT_INTENSITY],
  opts: IntervalOpts = {},
): number {
  const ease = clampEase(opts.ease ?? EASE_START);
  // التعثّر يعود بالجميع إلى المدة القصيرة نفسها — لا معاملَ يخفّفها أو يشدّها.
  if (rating === 1) return Math.max(1, p.needsDays);
  if (rating === 2) return Math.max(1, Math.round(p.goodDays * ease));

  // «متقن»: الدرجة التالية على السلّم — والمدّةُ السابقة تُقسم على المعامل أوّلاً
  // كي تُقاس بمقياس السلّم نفسه (وإلّا ضاعت درجتُها بعد أوّل ضرب).
  const baseline = ease > 0 ? prevDays / ease : prevDays;
  const idx = rungOf(p.ladder, baseline);
  const rung = idx < 0 ? p.ladder[0] : p.ladder[Math.min(idx + 1, p.ladder.length - 1)];

  // مكافأة التأخّر: صمودٌ أطولُ من المجدول دليلٌ أقوى من الجدول نفسه.
  const elapsed = Math.max(0, Math.round(opts.elapsedDays ?? 0));
  const base = elapsed > rung ? Math.min(elapsed, rung * 2) : rung;

  const ceiling = p.ladder[p.ladder.length - 1] * EASE_RANGE.max;
  return Math.max(1, Math.min(Math.round(base * ease), Math.round(ceiling)));
}

/** حالُ وجهٍ بعد طيّ سجلّه: مدّتُه ومعاملُ رسوخه وعدد تعثّراته. */
export interface PageMemory {
  intervalDays: number;
  ease: number;
  lapses: number;
}

/**
 * طيّ سجلّ وجهٍ زمنياً (الأقدم أوّلاً) → مدّتُه ومعاملُه.
 *
 * المعاملُ يُحدَّث **قبل** حساب المدّة، فتقييمُ اليوم يظهر أثرُه اليوم لا غداً:
 * من تعثّر الآن لا يُمنح مدّةَ الراسخ ثمّ يُعاقَب في الجولة التالية.
 */
export function foldMemory(
  events: readonly { rating: HifzRating; date: string }[],
  p: IntensityPreset = INTENSITY[DEFAULT_INTENSITY],
): PageMemory {
  let intervalDays = 0;
  let ease = EASE_START;
  let lapses = 0;
  let prevDate: string | null = null;
  for (const e of events) {
    const elapsedDays = prevDate ? Math.max(0, daysBetween(prevDate, e.date)) : 0;
    ease = nextEase(ease, e.rating);
    intervalDays = nextInterval(intervalDays, e.rating, p, { ease, elapsedDays });
    if (e.rating === 1) lapses++;
    prevDate = e.date;
  }
  return { intervalDays, ease, lapses };
}

function addDays(dateStr: string, days: number): string {
  const dt = parseDate(dateStr);
  dt.setDate(dt.getDate() + days);
  return toDateStr(dt);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

export interface PageSchedule {
  page: number;
  intervalDays: number; // المدة الحالية (0 = لم يُقيَّم بعد)
  ease: number; // معامل الرسوخ المشتقّ من سجلّ الوجه
  lastReviewed: string | null;
  dueDate: string | null; // lastReviewed + interval (null = لم يُراجَع قَطّ)
  overdueDays: number; // كم يوماً تأخّر (0 إن غير مستحق)
  lapses: number; // عدد مرّات «يحتاج إتقان» عبر تاريخ الوجه
  mistakes: number; // مواضع خطأ مفتوحة داخل الوجه
  risk: number; // أولويّة المراجعة — راجع pageRisk
  due: boolean;
}

/**
 * خطرُ الوجه: أيّهما أحقُّ بالمراجعة الآن.
 *
 * التأخّر **نسبةٌ لا عدد أيام**: ثلاثةٌ على مدةِ سبعةٍ نصفُ المدة، وثلاثةٌ على
 * ستّين لا شيء. ويثقل الخطرُ بالتعثّر السابق وبمواضع الخطأ المفتوحة في الوجه —
 * فهي دليلٌ حاضرٌ على هشاشته لا تاريخٌ مضى. والوجه الذي لم يُراجَع قطّ له وزنٌ
 * ثابت يقدّمه على المتأخّر اليسير ولا يزاحم المتعثّر الشديد.
 */
export const NEVER_REVIEWED_RISK = 2.5;
export function pageRisk(p: {
  intervalDays: number; overdueDays: number; lapses: number; mistakes: number; lastReviewed: string | null;
}): number {
  const mistakes = p.mistakes * 0.5;
  if (p.lastReviewed == null) return Math.round((NEVER_REVIEWED_RISK + mistakes) * 100) / 100;
  const ratio = p.intervalDays > 0 ? p.overdueDays / p.intervalDays : p.overdueDays;
  return Math.round((ratio * 2 + p.lapses * 0.6 + mistakes) * 100) / 100;
}

// حدث حفظٍ أو مراجعةٍ مُقيَّم يمسّ مدى أوجه — نطويه على مستوى الوجه.
interface RatedEvent { fromPage: number; toPage: number; date: string; rating: HifzRating; at: number | null; order: number }

function ratedEvents(s: HifzState): RatedEvent[] {
  const all = [...(s.sessions ?? []), ...(s.reviews ?? [])];
  const events = all
    .filter((e): e is typeof e & { rating: HifzRating } => e.rating === 1 || e.rating === 2 || e.rating === 3)
    .map((e, order) => ({
      fromPage: idToPage(e.fromId),
      toPage: idToPage(e.toId),
      date: e.date,
      rating: e.rating,
      at: typeof e.at === "number" && Number.isFinite(e.at) ? e.at : null,
      order,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.at ?? -Infinity) - (b.at ?? -Infinity) || a.order - b.order);

  // أكثر من ضغطة على نفس المقطع في اليوم نفسه لا تمثّل مراجعاتٍ متباعدة
  // مستقلة. نحتفظ بالسجلّات كما هي للتاريخ والتراجع، لكن لا نسمح لها بتضخيم
  // سلّم المباعدة؛ الأحدث (وبترتيب المصفوفة، الأحدث أولاً عند غياب at) يفوز.
  const latest = new Map<string, RatedEvent>();
  for (const event of events) {
    const key = `${event.date}:${event.fromPage}:${event.toPage}`;
    const current = latest.get(key);
    const eventIsLater = !current ||
      (event.at !== null && current.at === null) ||
      (event.at !== null && current.at !== null && event.at > current.at) ||
      (event.at === current.at && event.order > current.order);
    if (eventIsLater) latest.set(key, event);
  }
  return [...latest.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.at ?? -Infinity) - (b.at ?? -Infinity) || a.order - b.order);
}

// جدول كلّ وجهٍ محفوظ [بداية الخطة .. الجبهة]. الأوجه غير المُقيَّمة بعدُ مستحقّةٌ
// لأوّل مراجعة (intervalDays=0, dueDate=null, due=true).
export function pageSchedules(s: HifzState, todayStr: string): PageSchedule[] {
  const from = s.plan?.startId ?? 1;
  if (!s.plan || s.frontierId < from) return [];
  const firstPage = idToPage(from);
  const lastPage = idToPage(s.frontierId);
  const events = ratedEvents(s);
  const preset = presetOf(s.plan);

  // Index each rated range once instead of scanning the full event list for
  // every page. A long-running plan can contain thousands of ratings; this
  // preserves the exact range semantics while changing the hot loop from
  // pages×events to events×covered-pages.
  const eventsByPage: RatedEvent[][] = Array.from(
    { length: Math.max(0, lastPage - firstPage + 1) },
    () => [],
  );
  for (const event of events) {
    const start = Math.max(firstPage, event.fromPage);
    const end = Math.min(lastPage, event.toPage);
    for (let page = start; page <= end; page++) {
      eventsByPage[page - firstPage].push(event);
    }
  }

  // مواضع الخطأ المفتوحة موزّعةً على أوجهها — تُحسب مرّةً لا لكلّ وجه.
  const mistakesByPage = new Map<number, number>();
  for (const m of openMistakes(s)) {
    const pg = idToPage(m.ayahId);
    mistakesByPage.set(pg, (mistakesByPage.get(pg) ?? 0) + 1);
  }

  const out: PageSchedule[] = [];
  for (let page = firstPage; page <= lastPage; page++) {
    const hits = eventsByPage[page - firstPage];
    const mistakes = mistakesByPage.get(page) ?? 0;
    if (hits.length === 0) {
      const never = {
        page, intervalDays: 0, ease: EASE_START, lastReviewed: null, dueDate: null,
        overdueDays: 0, lapses: 0, mistakes, due: true,
      };
      out.push({ ...never, risk: pageRisk(never) });
      continue;
    }
    const { intervalDays, ease, lapses } = foldMemory(hits, preset);
    const lastReviewed = hits[hits.length - 1].date;
    const dueDate = addDays(lastReviewed, intervalDays);
    const overdueDays = Math.max(0, daysBetween(dueDate, todayStr));
    const row = {
      page, intervalDays, ease, lastReviewed, dueDate, overdueDays, lapses, mistakes,
      due: dueDate <= todayStr,
    };
    out.push({ ...row, risk: pageRisk(row) });
  }
  return out;
}

// المدّة القادمة لمقطعٍ لو قُيّم بكذا — لعرض «موعدها القادم» قبل التسجيل، فيرى
// المستخدم أثر تقييمه قبل أن يقع. نأخذ حال أوّل وجهٍ في المقطع (وهو الحاكم غالباً)
// بمعامل رسوخه وتأخّره الفعليّ، فالمعروض هو ما سيُسجَّل لا تقديرٌ عنه.
export function nextDueDays(s: HifzState, portion: Portion, rating: HifzRating, todayStr: string): number {
  const page = idToPage(portion.fromId);
  const cur = pageSchedules(s, todayStr).find((p) => p.page === page);
  const ease = nextEase(cur?.ease ?? EASE_START, rating);
  const elapsedDays = cur?.lastReviewed ? Math.max(0, daysBetween(cur.lastReviewed, todayStr)) : 0;
  return nextInterval(cur?.intervalDays ?? 0, rating, presetOf(s.plan), { ease, elapsedDays });
}

export interface DuePage {
  page: number; portion: Portion; overdueDays: number; lapses: number;
  mistakes: number; risk: number; neverReviewed: boolean;
}

// الأوجه المستحقّة اليوم، **الأخطرُ أوّلاً** (راجع `pageRisk`) ثمّ الأشدُّ تأخّراً
// ثمّ الأقدم — لكن لا تتجاوز الجبهة. `skipRecentBand` يستثني ما تغطّيه «المراجعة
// القريبة» فلا يظهر الوجه الواحد مرّتين في جلسةٍ واحدة (كان هذا التداخل أظهر
// مصدر إرباك في القسم).
export function duePages(s: HifzState, todayStr: string, skipRecentBand = false): DuePage[] {
  const band = skipRecentBand ? recentBandPages(s) : null;
  return pageSchedules(s, todayStr)
    .filter((p) => p.due)
    .filter((p) => !band || p.page < band.first || p.page > band.last)
    .sort((a, b) => b.risk - a.risk || b.overdueDays - a.overdueDays || a.page - b.page)
    .map((p) => {
      const pr = pageRange(p.page);
      return {
        page: p.page,
        portion: { fromId: Math.max(pr.start, s.plan?.startId ?? 1), toId: Math.min(pr.end, s.frontierId) },
        overdueDays: p.overdueDays,
        lapses: p.lapses,
        mistakes: p.mistakes,
        risk: p.risk,
        neverReviewed: p.lastReviewed == null,
      };
    });
}

// ===================== سقفُ اليوم يتكيّف مع المواظبة =====================
/** نافذةُ قياس المواظبة بالأيام. */
export const CONSISTENCY_WINDOW = 14;

/** نسبةُ الأيام التي جرى فيها حفظٌ أو مراجعة في النافذة (0..1) — مواظبةٌ لا حجم. */
export function reviewConsistency(s: HifzState, todayStr: string): number {
  const start = toDateStr(new Date(parseDate(todayStr).getTime() - (CONSISTENCY_WINDOW - 1) * 86400000));
  const days = new Set<string>();
  for (const e of [...(s.sessions ?? []), ...(s.reviews ?? [])]) {
    if (e.date >= start && e.date <= todayStr) days.add(e.date);
  }
  return Math.min(1, days.size / CONSISTENCY_WINDOW);
}

/**
 * سقفُ أوجه المراجعة اليوم.
 *
 * الرقم الثابت يخذل الطرفين: من انقطع أسبوعاً يعود فيجد عشرين وجهاً فينسحب،
 * ومن يواظب كلّ يوم يبقى محبوساً في سبعةٍ ومتأخّراتُه لا تنقص. فالسقف يدور مع
 * المواظبة بين ٧٠٪ و١٥٠٪ من سقف الشدّة، ولا ينزل عن وجهين.
 */
export function adaptiveReviewCap(s: HifzState, todayStr: string, p: IntensityPreset = presetOf(s.plan)): number {
  const factor = 0.7 + reviewConsistency(s, todayStr) * 0.8;
  return Math.max(2, Math.round(p.dailyReviewPages * factor));
}

// طابورٌ محدود بسقف اليوم المتكيّف: إن كثُرت المتأخّرات تُوزَّع على أيام (لا عشرات
// دفعةً واحدة فتُثبّط). `limit` يتجاوز التكيّف — يُمرَّر في الاختبارات فقط.
export interface DueQueue { pages: DuePage[]; total: number; hidden: number; cap: number }
export function dueQueue(s: HifzState, todayStr: string, limit?: number, skipRecentBand = false): DueQueue {
  const all = duePages(s, todayStr, skipRecentBand);
  const cap = Math.max(1, Math.round(limit ?? adaptiveReviewCap(s, todayStr)) || 1);
  return { pages: all.slice(0, cap), total: all.length, hidden: Math.max(0, all.length - cap), cap };
}

// ما يحتاجه اليوم (للتذكير اللطيف في الرئيسية): هل بقي وردُ حفظٍ جديد؟ وهل بقيت
// مراجعةٌ *مستحقّةٌ فعلاً* حسب جدول المباعدة؟ نعتمد `duePages` — لا مجرّد «لم
// يُراجَع اليوم» — كي يختفي التذكير بمجرّد إنجاز مستحقّات اليوم، ولا يظهر أصلاً
// حين لا يكون هناك ما يُستحقّ (كان الفحص القديم ينبّه كلَّ يومٍ لم يُسجَّل فيه أيُّ
// مراجعة، فيبقى ظاهراً رغم إتمام الجلسة أو خلوّ اليوم من المستحقّ).
export function hifzTodo(s: HifzState, todayStr: string): { needWird: boolean; needReview: boolean } {
  if (!s.plan) return { needWird: false, needReview: false };
  const sessionToday = (s.sessions ?? []).some((x) => x.date === todayStr);
  return {
    needWird: plannedPortion(s) != null && !sessionToday,
    needReview: duePages(s, todayStr).length > 0,
  };
}

// ===================== تقرير قرآني أسبوعي =====================
// حصيلةٌ موجزة لآخر 7 أيام: ما حُفظ، ما رُوجع، عدد الجلسات، أقدم مراجعة مستحقّة،
// وأكثر موضعٍ تكرّر فيه الخطأ — مُشتَقٌّ من السجلّ بلا حالةٍ جديدة.
export interface QuranWeekReport {
  memorizedAyat: number; // آيات حُفظت هذا الأسبوع
  memorizedPages: number; // أوجه مُغطّاة بجلسات الأسبوع
  reviewedCount: number; // عدد المراجعات هذا الأسبوع
  sessions: number; // عدد جلسات الحفظ هذا الأسبوع
  oldestDueDays: number; // أقدم مراجعة مستحقّة (بالأيام تأخّراً؛ 0 إن لا شيء)
  dueTotal: number; // إجمالي الأوجه المستحقّة الآن
  topMistake: { ayahId: number; ref: string; hits: number } | null;
  hasActivity: boolean;
}

export function quranWeeklyReport(s: HifzState, todayStr: string): QuranWeekReport {
  const weekStart = toDateStr(new Date(parseDate(todayStr).getTime() - 6 * 86400000));
  const inWeek = (d: string) => d >= weekStart && d <= todayStr;
  const weekSessions = (s.sessions ?? []).filter((x) => inWeek(x.date));
  const weekReviews = (s.reviews ?? []).filter((x) => inWeek(x.date));

  const pages = new Set<number>();
  let memorizedAyat = 0;
  for (const x of weekSessions) {
    memorizedAyat += Math.max(0, x.toId - x.fromId + 1);
    for (let p = idToPage(x.fromId); p <= idToPage(x.toId); p++) pages.add(p);
  }

  const due = duePages(s, todayStr);
  const oldestDueDays = due[0]?.overdueDays ?? 0;

  const worst = openMistakes(s)[0] ?? null;
  const topMistake = worst
    ? (() => {
        const { surah, ayah } = idToSurahAyah(worst.ayahId);
        return { ayahId: worst.ayahId, ref: `${SURAHS[surah - 1]?.name ?? ""} ${ayah}`, hits: worst.hits.length };
      })()
    : null;

  return {
    memorizedAyat,
    memorizedPages: pages.size,
    reviewedCount: weekReviews.length,
    sessions: weekSessions.length,
    oldestDueDays,
    dueTotal: due.length,
    topMistake,
    hasActivity: weekSessions.length > 0 || weekReviews.length > 0,
  };
}
