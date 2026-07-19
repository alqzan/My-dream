import type { HifzState, HifzUnit } from "../types";
import { calcStreak } from "../utils";
import {
  TOTAL_AYAT, TOTAL_PAGES, idToPage, idToJuz, idToSurahAyah, pageRange, SURAHS,
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

// مواطن الضعف: مقاطع قُيّمت «تحتاج إتقاناً» (1) في الحفظ أو المراجعة، الأحدث أولاً.
export function weakSpots(s: HifzState): { fromId: number; toId: number; date: string }[] {
  const all = [
    ...s.sessions.filter((x) => x.rating === 1).map((x) => ({ fromId: x.fromId, toId: x.toId, date: x.date })),
    ...s.reviews.filter((x) => x.rating === 1).map((x) => ({ fromId: x.fromId, toId: x.toId, date: x.date })),
  ];
  const seen = new Set<string>();
  return all
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .filter((x) => { const k = `${x.fromId}-${x.toId}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 6);
}
