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
import { recentReviewBand, plannedPortion, openMistakes } from "./hifz";
import { idToPage, pageRange } from "./meta";
import { parseDate, toDateStr } from "../utils";

// سلّم الإتقان بالأيام: أوّل إتقانٍ 7، ثمّ 14، 30، 60 عند استمرار الإتقان.
export const MASTERY_LADDER: readonly number[] = [7, 14, 30, 60];
export const RATE_NEEDS_DAYS = 1; // «يحتاج إتقان» → غداً
export const RATE_GOOD_DAYS = 3; // «جيد» → بعد 3 أيام

// المدة القادمة لمقطعٍ حسب تقييمه ومدّته السابقة — قاعدةٌ واحدة صريحة.
export function nextInterval(prevDays: number, rating: HifzRating): number {
  if (rating === 1) return RATE_NEEDS_DAYS;
  if (rating === 2) return RATE_GOOD_DAYS;
  const idx = MASTERY_LADDER.indexOf(prevDays);
  return idx < 0 ? MASTERY_LADDER[0] : MASTERY_LADDER[Math.min(idx + 1, MASTERY_LADDER.length - 1)];
}

// طيّ سلسلة تقييمات وجهٍ زمنياً (الأقدم أوّلاً) → مدّته الحالية بالأيام.
export function foldInterval(ratings: HifzRating[]): number {
  let d = 0;
  for (const r of ratings) d = nextInterval(d, r);
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
interface RatedEvent { fromPage: number; toPage: number; date: string; rating: HifzRating }

function ratedEvents(s: HifzState): RatedEvent[] {
  const all = [...(s.sessions ?? []), ...(s.reviews ?? [])];
  return all
    .filter((e): e is typeof e & { rating: HifzRating } => e.rating === 1 || e.rating === 2 || e.rating === 3)
    .map((e) => ({ fromPage: idToPage(e.fromId), toPage: idToPage(e.toId), date: e.date, rating: e.rating }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// جدول كلّ وجهٍ محفوظ [بداية الخطة .. الجبهة]. الأوجه غير المُقيَّمة بعدُ مستحقّةٌ
// لأوّل مراجعة (intervalDays=0, dueDate=null, due=true).
export function pageSchedules(s: HifzState, todayStr: string): PageSchedule[] {
  const from = s.plan?.startId ?? 1;
  if (!s.plan || s.frontierId < from) return [];
  const firstPage = idToPage(from);
  const lastPage = idToPage(s.frontierId);
  const events = ratedEvents(s);

  const out: PageSchedule[] = [];
  for (let page = firstPage; page <= lastPage; page++) {
    const hits = events.filter((e) => e.fromPage <= page && e.toPage >= page);
    const lapses = hits.filter((e) => e.rating === 1).length;
    if (hits.length === 0) {
      out.push({ page, intervalDays: 0, lastReviewed: null, dueDate: null, overdueDays: 0, lapses, due: true });
      continue;
    }
    const intervalDays = foldInterval(hits.map((e) => e.rating));
    const lastReviewed = hits[hits.length - 1].date;
    const dueDate = addDays(lastReviewed, intervalDays);
    const overdueDays = Math.max(0, daysBetween(dueDate, todayStr));
    out.push({ page, intervalDays, lastReviewed, dueDate, overdueDays, lapses, due: dueDate <= todayStr });
  }
  return out;
}

export interface DuePage { page: number; portion: Portion; overdueDays: number; lapses: number; neverReviewed: boolean }

// الأوجه المستحقّة اليوم، الأشدُّ تأخّراً أوّلاً ثمّ الأقدم — لكن لا تتجاوز الجبهة.
export function duePages(s: HifzState, todayStr: string): DuePage[] {
  return pageSchedules(s, todayStr)
    .filter((p) => p.due)
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

// طابورٌ محدود بهدفٍ يومي: إن كثُرت المتأخّرات تُوزَّع على أيام (لا عشرات دفعةً).
export interface DueQueue { pages: DuePage[]; total: number; hidden: number }
export function dueQueue(s: HifzState, todayStr: string, limit = 7): DueQueue {
  const all = duePages(s, todayStr);
  const cap = Math.max(1, Math.round(limit) || 1);
  return { pages: all.slice(0, cap), total: all.length, hidden: Math.max(0, all.length - cap) };
}

// ===================== جلسة اليوم (تجميعة واحدة متدرّجة) =====================
// بطاقة «جلسة اليوم» تعرض من هذه: مقدار الحفظ الجديد، عدد المستحقّ للمراجعة،
// عدد الأخطاء المفتوحة، ووقتٌ تقريبي — بزرٍّ واحد «ابدأ جلسة اليوم».
export interface TodaySession {
  newPortion: Portion | null; // السَّبْق (الحفظ الجديد)
  recentBand: Portion | null; // المراجعة القريبة (آخر ما حُفظ)
  due: DueQueue; // المراجعة المستحقّة (محدودة بالهدف اليومي)
  openMistakes: number; // مواطن الضعف والأخطاء المفتوحة
  estMinutes: number; // وقتٌ تقريبيّ للجلسة
}

function pagesInPortion(p: Portion | null): number {
  if (!p) return 0;
  return Math.max(1, idToPage(p.toId) - idToPage(p.fromId) + 1);
}

export function todaySession(s: HifzState, todayStr: string, reviewGoalPages = 7): TodaySession {
  const newPortion = plannedPortion(s);
  const recentBand = recentReviewBand(s);
  const due = dueQueue(s, todayStr, reviewGoalPages);
  const openMk = openMistakes(s).length;
  // تقدير خشن: ~2 دقيقة لكلّ وجه حفظٍ جديد، ~1 لكلّ وجه مراجعة، ~0.5 لكلّ خطأ.
  const est =
    pagesInPortion(newPortion) * 2 +
    Math.max(pagesInPortion(recentBand), due.pages.length) * 1 +
    openMk * 0.5;
  return { newPortion, recentBand, due, openMistakes: openMk, estMinutes: Math.max(1, Math.round(est)) };
}
