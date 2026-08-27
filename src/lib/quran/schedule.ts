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

// المدة القادمة لمقطعٍ حسب تقييمه ومدّته السابقة — قاعدةٌ واحدة صريحة، وأرقامها
// من شدّة التمرين المختارة.
export function nextInterval(
  prevDays: number, rating: HifzRating, p: IntensityPreset = INTENSITY[DEFAULT_INTENSITY],
): number {
  if (rating === 1) return p.needsDays;
  if (rating === 2) return p.goodDays;
  const idx = p.ladder.indexOf(prevDays);
  return idx < 0 ? p.ladder[0] : p.ladder[Math.min(idx + 1, p.ladder.length - 1)];
}

// طيّ سلسلة تقييمات وجهٍ زمنياً (الأقدم أوّلاً) → مدّته الحالية بالأيام.
export function foldInterval(
  ratings: HifzRating[], p: IntensityPreset = INTENSITY[DEFAULT_INTENSITY],
): number {
  let d = 0;
  for (const r of ratings) d = nextInterval(d, r, p);
  return d;
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
  lastReviewed: string | null;
  dueDate: string | null; // lastReviewed + interval (null = لم يُراجَع قَطّ)
  overdueDays: number; // كم يوماً تأخّر (0 إن غير مستحق)
  lapses: number; // عدد مرّات «يحتاج إتقان» عبر تاريخ الوجه
  due: boolean;
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

  const out: PageSchedule[] = [];
  for (let page = firstPage; page <= lastPage; page++) {
    const hits = eventsByPage[page - firstPage];
    const lapses = hits.filter((e) => e.rating === 1).length;
    if (hits.length === 0) {
      out.push({ page, intervalDays: 0, lastReviewed: null, dueDate: null, overdueDays: 0, lapses, due: true });
      continue;
    }
    const intervalDays = foldInterval(hits.map((e) => e.rating), preset);
    const lastReviewed = hits[hits.length - 1].date;
    const dueDate = addDays(lastReviewed, intervalDays);
    const overdueDays = Math.max(0, daysBetween(dueDate, todayStr));
    out.push({ page, intervalDays, lastReviewed, dueDate, overdueDays, lapses, due: dueDate <= todayStr });
  }
  return out;
}

// المدّة القادمة لمقطعٍ لو قُيّم بكذا — لعرض «موعدها القادم» قبل التسجيل، فيرى
// المستخدم أثر تقييمه قبل أن يقع. نأخذ حال أوّل وجهٍ في المقطع (وهو الحاكم غالباً).
export function nextDueDays(s: HifzState, portion: Portion, rating: HifzRating, todayStr: string): number {
  const page = idToPage(portion.fromId);
  const cur = pageSchedules(s, todayStr).find((p) => p.page === page);
  return nextInterval(cur?.intervalDays ?? 0, rating, presetOf(s.plan));
}

export interface DuePage { page: number; portion: Portion; overdueDays: number; lapses: number; neverReviewed: boolean }

// الأوجه المستحقّة اليوم، الأشدُّ تأخّراً أوّلاً ثمّ الأقدم — لكن لا تتجاوز الجبهة.
// `skipRecentBand` يستثني ما تغطّيه «المراجعة القريبة» فلا يظهر الوجه الواحد
// مرّتين في جلسةٍ واحدة (كان هذا التداخل أظهر مصدر إرباك في القسم).
export function duePages(s: HifzState, todayStr: string, skipRecentBand = false): DuePage[] {
  const band = skipRecentBand ? recentBandPages(s) : null;
  return pageSchedules(s, todayStr)
    .filter((p) => p.due)
    .filter((p) => !band || p.page < band.first || p.page > band.last)
    .sort((a, b) => b.overdueDays - a.overdueDays || a.page - b.page)
    .map((p) => {
      const pr = pageRange(p.page);
      return {
        page: p.page,
        portion: { fromId: Math.max(pr.start, s.plan?.startId ?? 1), toId: Math.min(pr.end, s.frontierId) },
        overdueDays: p.overdueDays,
        lapses: p.lapses,
        neverReviewed: p.lastReviewed == null,
      };
    });
}

// طابورٌ محدود بسقف شدّة التمرين: إن كثُرت المتأخّرات تُوزَّع على أيام (لا عشرات
// دفعةً واحدة فتُثبّط). `limit` يُمرَّر في الاختبارات فقط.
export interface DueQueue { pages: DuePage[]; total: number; hidden: number }
export function dueQueue(s: HifzState, todayStr: string, limit?: number, skipRecentBand = false): DueQueue {
  const all = duePages(s, todayStr, skipRecentBand);
  const cap = Math.max(1, Math.round(limit ?? presetOf(s.plan).dailyReviewPages) || 1);
  return { pages: all.slice(0, cap), total: all.length, hidden: Math.max(0, all.length - cap) };
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
