import type { HifzState, HifzUnit, HifzRating } from "../types";
import { calcStreak, parseDate } from "../utils";
import {
  TOTAL_AYAT, TOTAL_PAGES, TOTAL_JUZ, idToPage, idToJuz, idToSurahAyah, juzRange, pageRange, SURAHS,
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
  // نصف/ربع وجه — نسبة من آيات الوجه الحالي (تراعي تفاوت طول الأوجه).
  const pr = pageRange(idToPage(startId));
  const pageLen = pr.end - pr.start + 1;
  const frac = unit === "half" ? 0.5 : 0.25;
  const step = Math.max(1, Math.round(pageLen * frac * amt));
  return Math.min(startId + step - 1, TOTAL_AYAT);
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
    spanPages: Math.round((spanAyat / TOTAL_AYAT) * TOTAL_PAGES),
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

// وتيرة الحفظ وتقدير موعد الإتمام من الجلسات.
export interface HifzPace {
  perDay: number; // متوسط آيات/يوم على أيام النشاط
  finishInDays: number | null;
  text: string;
}
export function hifzPace(s: HifzState): HifzPace {
  const byDay = new Map<string, number>();
  for (const x of s.sessions) {
    byDay.set(x.date, (byDay.get(x.date) ?? 0) + (x.toId - x.fromId + 1));
  }
  const activeDays = byDay.size;
  const totalAyat = [...byDay.values()].reduce((a, b) => a + b, 0);
  const perDay = activeDays > 0 ? totalAyat / activeDays : 0;
  const remaining = Math.max(0, TOTAL_AYAT - s.frontierId);
  if (perDay <= 0 || remaining <= 0) return { perDay, finishInDays: null, text: "" };
  const days = Math.ceil(remaining / perDay);
  let text: string;
  if (days <= 45) text = `على وتيرتك تُتمّ خلال ~${days} يوماً`;
  else if (days < 730) text = `على وتيرتك تُتمّ خلال ~${Math.round(days / 30)} شهراً`;
  else text = `على وتيرتك تُتمّ خلال ~${(days / 365).toFixed(1)} سنة`;
  return { perDay, finishInDays: days, text };
}

// مقطع المراجعة الدورية: يدور بالوجه داخل المحفوظ [البداية .. الجبهة].
export function reviewPortion(s: HifzState): Portion | null {
  const from = s.plan?.startId ?? 1;
  if (s.frontierId < from) return null; // لا محفوظ بعد
  let cursor = s.reviewCursorId || from;
  if (cursor < from || cursor > s.frontierId) cursor = from;
  const pr = pageRange(idToPage(cursor));
  const start = Math.max(cursor, pr.start, from);
  const end = Math.min(pr.end, s.frontierId);
  return { fromId: start, toId: Math.max(start, end) };
}

// الموضع التالي لمؤشّر المراجعة بعد مراجعة مقطعٍ ينتهي عند toId (يدور).
export function nextReviewCursor(s: HifzState, toId: number): number {
  const from = s.plan?.startId ?? 1;
  const next = toId + 1;
  return next > s.frontierId ? from : next;
}

// أحدث تقييم لكل مقطع (بمفتاح المدى) عبر الحفظ والمراجعة معاً.
function latestRatingByRange(s: HifzState): Map<string, { fromId: number; toId: number; date: string; rating?: 1 | 2 | 3 }> {
  const events = [
    ...s.sessions.map((x) => ({ fromId: x.fromId, toId: x.toId, date: x.date, rating: x.rating })),
    ...s.reviews.map((x) => ({ fromId: x.fromId, toId: x.toId, date: x.date, rating: x.rating })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1)); // تصاعدي: الأحدث يكتب أخيراً
  const m = new Map<string, { fromId: number; toId: number; date: string; rating?: 1 | 2 | 3 }>();
  for (const e of events) m.set(`${e.fromId}-${e.toId}`, e);
  return m;
}

// مواطن الضعف: مقاطع أحدثُ تقييمٍ لها «تحتاج إتقاناً» (1) — أي لم تُتقَن بعد.
export function weakSpots(s: HifzState): { fromId: number; toId: number; date: string }[] {
  return [...latestRatingByRange(s).values()]
    .filter((e) => e.rating === 1)
    .sort((a, b) => (a.date < b.date ? -1 : 1)) // الأقدم أولاً (الأحوج للمراجعة)
    .map((e) => ({ fromId: e.fromId, toId: e.toId, date: e.date }))
    .slice(0, 8);
}

// مراجعة أذكى: تُقدّم مواطن الضعف المفتوحة (لم تُتقَن) على الدورة المتسلسلة.
export interface SmartReview { portion: Portion; reason: "weak" | "cycle" }
export function smartReview(s: HifzState): SmartReview | null {
  const weak = weakSpots(s);
  if (weak.length) return { portion: { fromId: weak[0].fromId, toId: weak[0].toId }, reason: "weak" };
  const cyc = reviewPortion(s);
  return cyc ? { portion: cyc, reason: "cycle" } : null;
}

// ما يحتاجه اليوم: هل بقي وردٌ للحفظ؟ وهل بقيت مراجعة؟ (للتذكير في الرئيسية)
export function hifzTodo(s: HifzState, todayStr: string): { needWird: boolean; needReview: boolean } {
  if (!s.plan) return { needWird: false, needReview: false };
  const sessionToday = s.sessions.some((x) => x.date === todayStr);
  const reviewToday = s.reviews.some((x) => x.date === todayStr);
  const hasMemorized = s.frontierId >= (s.plan.startId ?? 1);
  return {
    needWird: plannedPortion(s) != null && !sessionToday,
    needReview: hasMemorized && !reviewToday,
  };
}

// ===================== خريطة الحفظ =====================
// حالة كل جزءٍ من الثلاثين للعرض في لوحة كاملة: ما حُفظ، ما رُوجع حديثاً، وما
// يحتاج مراجعة. الفاصل الزمني الذي يُعدّ بعده الجزءُ «محتاجاً للمراجعة».
export const REVIEW_DUE_DAYS = 7;

export type JuzState = "none" | "partial" | "fresh" | "due" | "weak";

export interface JuzCell {
  juz: number;
  totalAyat: number;
  memorizedAyat: number;
  fill: number; // 0..1 نسبة المحفوظ من الجزء
  memStart: number; // معرّف أوّل آية محفوظة في الجزء (0 إن لا شيء)
  memEnd: number; // معرّف آخر آية محفوظة
  lastDate?: string; // آخر حفظٍ/مراجعةٍ مسّت الجزء
  lastRating?: HifzRating;
  daysSince: number | null;
  state: JuzState;
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

export function hifzMap(s: HifzState, todayStr: string): JuzCell[] {
  const from = s.plan?.startId ?? 1;
  const frontierJuz = s.frontierId >= 1 ? idToJuz(s.frontierId) : 0;
  const events = [
    ...s.sessions.map((x) => ({ from: x.fromId, to: x.toId, date: x.date, rating: x.rating })),
    ...s.reviews.map((x) => ({ from: x.fromId, to: x.toId, date: x.date, rating: x.rating })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1)); // تصاعدي: الأحدث آخراً

  const cells: JuzCell[] = [];
  for (let j = 1; j <= TOTAL_JUZ; j++) {
    const r = juzRange(j);
    const total = r.end - r.start + 1;
    const memStart = Math.max(r.start, from);
    const memEnd = Math.min(r.end, s.frontierId);
    const memAyat = Math.max(0, memEnd - memStart + 1);
    if (memAyat === 0) {
      cells.push({ juz: j, totalAyat: total, memorizedAyat: 0, fill: 0, memStart: 0, memEnd: 0, daysSince: null, state: "none" });
      continue;
    }
    const overlapping = events.filter((e) => e.to >= r.start && e.from <= r.end);
    const last = overlapping[overlapping.length - 1];
    const daysSince = last ? daysBetween(last.date, todayStr) : null;
    let state: JuzState;
    if (last?.rating === 1) state = "weak";
    else if (memAyat < total && j === frontierJuz) state = "partial"; // الجزء الجاري حفظه
    else if (daysSince == null || daysSince >= REVIEW_DUE_DAYS) state = "due";
    else state = "fresh";
    cells.push({
      juz: j, totalAyat: total, memorizedAyat: memAyat, fill: memAyat / total,
      memStart, memEnd, lastDate: last?.date, lastRating: last?.rating, daysSince, state,
    });
  }
  return cells;
}

export interface HifzMapCounts { memorized: number; fresh: number; due: number; weak: number; partial: number }
export function mapCounts(cells: JuzCell[]): HifzMapCounts {
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
