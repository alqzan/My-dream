import type { HifzState, HifzUnit, HifzRating, HifzMistake } from "../types";
import { calcStreak, parseDate, toDateStr } from "../utils";
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

// ===================== ورد المراجعة (نافذة متحرّكة) =====================
// المراجعة اليومية على مبدأ «آخر N وجه»: مقطعٌ يغطّي آخر reviewWindowPages وجهاً
// محفوظاً حتى الجبهة. كلّما تقدّمت الجبهة بحفظٍ جديد تنزلق النافذة تلقائياً فيخرج
// الأقدم — بلا ضبطٍ يدوي.
export const DEFAULT_REVIEW_WINDOW = 5;
export const RANDOM_TEST_INTERVAL_DAYS = 3;

export function reviewWindowPages(s: HifzState): number {
  const n = s.plan?.reviewWindowPages ?? DEFAULT_REVIEW_WINDOW;
  return Math.min(Math.max(Math.round(n) || DEFAULT_REVIEW_WINDOW, 1), 15);
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

// اختبار مفاجئ: وجهٌ عشوائيٌّ ضمن المحفوظ [startPage..frontierPage] (null إن لا
// محفوظ). يُستدعى مرّة ويُثبَّت في حالة المكوّن حتى لا يتغيّر مع كل رسم.
export function randomTestPage(s: HifzState): Portion | null {
  const from = s.plan?.startId ?? 1;
  if (s.frontierId < from) return null;
  const firstPage = idToPage(from);
  const lastPage = idToPage(s.frontierId);
  const p = firstPage + Math.floor(Math.random() * (lastPage - firstPage + 1));
  const pr = pageRange(p);
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
export function mistakeKey(ayahId: number, wordIndex: number | null): string {
  return `${ayahId}:${wordIndex ?? "all"}`;
}

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

// بعد كم مرّةٍ متتاليةٍ من التسميع الناجح نقترح إغلاق الخطأ تلقائياً.
export const MISTAKE_MASTERY_SUGGEST = 2;

// عدد مرّات تسميع موضع الخطأ بنجاح (تقييم ≥ 2) بعد آخر وقوعٍ له — مُشتقٌّ من
// المراجعات/الجلسات المتداخلة مع آية الموضع، بلا حالةٍ جديدة. يقود اقتراح
// الإغلاق التلقائي دون حذف تاريخ الخطأ (يُغلَق مع الاحتفاظ بالإحصائية).
export function mistakeRecallSuccesses(s: HifzState, m: Pick<HifzMistake, "ayahId" | "hits">): number {
  const lastHit = m.hits[m.hits.length - 1] ?? "";
  return [...s.sessions, ...s.reviews].filter(
    (e) => (e.rating ?? 0) >= 2 && e.fromId <= m.ayahId && e.toId >= m.ayahId && e.date > lastHit,
  ).length;
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
