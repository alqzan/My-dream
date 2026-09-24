// ===================== جلسة اليوم — المسار الواحد =====================
// كان قسم الحفظ يعرض مساراتٍ متوازية: «المراجعة القريبة» و«مراجعة مركّزة»
// و«اختبار مفاجئ» و«أخطائي» — فيظهر الوجه الواحد في أربعة أماكن ولا يدري
// المستخدم أيُّها المراجعة الحقيقية. هنا يُبنى مسارٌ واحد مرتّب لليوم، وتُستثنى
// الأوجه المكرّرة، فتمشي في الجلسة خطوةً خطوة حتى تنتهي.
//
// الترتيب مقصود: الجديد أوّلاً والذهن صافٍ ← تثبيت القريب ← المستحقّ بالجدول
// (**الأخطرُ أوّلاً** لا الأقدمُ فحسب — راجع `pageRisk`) ← اختبار مواضع الخطأ
// ← لقمة اختبارٍ من القديم.
//
// **وميزانٌ بين الجديد والقديم** (٠٫١٫٤٥٧) — كان الجديد يتقدّم كلَّ يومٍ مهما
// حصل، وهو ما يعلّمه كلُّ شيخٍ خطأً: لا جديد على قديمٍ مهزوز.
//   • وردٌ سابقٌ أحدثُ تقييمٍ فيه «يحتاج إتقاناً» ⇒ **تثبيتٌ** أوّلاً (يُعاد حفظُه
//     بالمُدرّب ويُسجَّل مراجعةً)، ولا جديد اليوم.
//   • متأخّراتٌ تفوق ضِعف سقف اليوم ⇒ **نصفُ ورد**.
//   والتجاوزُ بيدك دائماً: «زِد حفظك» يبقى ظاهراً.
//
// **والمراجعةُ خطوةٌ واحدة لا عشر** (٠٫١٫٤٥٩، بطلب المالك): كان كلُّ وجهٍ مستحقٍّ
// خطوةً مستقلّة بشاشتها وزرّها وحكمها، فعشرةُ أوجهٍ عشرُ وقفات — والمالك يريد أن
// يسمّعها مرّةً واحدة. فصارت القريبةُ والمستحقُّ واختبارُ القديم **مقاطعَ داخل خطوةٍ
// واحدة** (`review`)، والأوجهُ المتجاورة تتّصل مقطعاً واحداً بترتيب المصحف، والمُدرّب
// ينتقل من مقطعٍ إلى تاليه بلا رجوع. **والجدولُ لم يتغيّر**: ما يدخل المراجعة وسقفُها
// وترتيبُ الخطر كما كان، والتقييمُ ما زال لكلّ وجه (`gradeByPage`) فلا يُنسخ حكمُ
// وجهٍ على جاره لأنّهما صارا في مقطعٍ واحد.

import type { HifzState } from "../types";
import type { Portion } from "./hifz";
import {
  plannedPortion, recentReviewBand, drillsToday, smartTestPortion, testDue,
  countPages, countSpots, countAyat, openMistakes, coveredToday, latestRatingByPage,
} from "./hifz";
import { dueQueue, type DuePage } from "./schedule";
import { idToPage, TOTAL_AYAT, TOTAL_PAGES } from "./meta";
import { prefGet, prefSetJSON, prefRemove } from "../platform/prefs";

export type SessionStep =
  | { kind: "memorize"; portion: Portion }
  | { kind: "consolidate"; portion: Portion } // إعادةُ حفظِ وردٍ سابقٍ مهزوز — يُسجَّل مراجعة
  | { kind: "recent"; portion: Portion }
  // `lapses`/`mistakes` اختياريّان عمداً: لقطةُ جلسةٍ محفوظةٌ من نسخةٍ أقدم لا
  // تحملهما، ورفضُها لأجل وسمٍ تفسيريّ يُضيّع جلسةً في منتصفها.
  | { kind: "due"; portion: Portion; page: number; overdueDays: number; never: boolean; lapses?: number; mistakes?: number }
  | { kind: "drill"; mistakeId: string; ayahId: number; wordIndex: number | null; word?: string }
  | { kind: "test"; portion: Portion }
  | { kind: "review"; runs: ReviewRun[] };

/**
 * مقطعٌ متّصل من مراجعة اليوم. الوسومُ كلّها اختياريّة: تفسيرٌ للعرض («لماذا هذا
 * الوجه الآن؟») لا شرطٌ لقبول لقطةٍ محفوظة.
 */
export interface ReviewRun {
  portion: Portion;
  recent?: boolean; // فيه شيءٌ من المراجعة القريبة
  test?: boolean; // اختبارٌ من القديم — يُسجَّل اختباراً لا مراجعة
  due?: number; // أوجهٌ مستحقّة بالجدول فيه
  never?: number; // منها ما لم يُراجَع قطّ
  overdueDays?: number; // أشدُّ تأخّرٍ فيه
  lapses?: number;
  mistakes?: number;
}

/** ميزانُ الجديد: كاملٌ · نصفٌ لتراكم المتأخّر · موقوفٌ لتثبيت وردٍ مهزوز. */
export type NewPace = "full" | "half" | "hold";

export interface TodayPlan {
  steps: SessionStep[];
  newPortion: Portion | null; // السَّبْق (null إن أُنجز اليوم أو خُتم المصحف أو وُقف للتثبيت)
  pace: NewPace;
  paceNote: string | null; // لماذا نقص الجديد اليوم — جملةٌ لا رقم
  duePages: number; // الأوجه المستحقّة المعروضة اليوم
  dueHidden: number; // مؤجَّلٌ لغدٍ حتى لا يتراكم عبء يومٍ واحد
  dueCap: number; // سقفُ اليوم المتكيّف مع المواظبة (راجع adaptiveReviewCap)
  drills: number; // مواضع الخطأ المُختبَر عليها اليوم
  openMistakes: number; // كلّ المواضع المفتوحة (للعرض لا للاختبار)
  estMinutes: number;
  summary: string; // «ماذا ينتظرني» بجملةٍ واحدة
}

function pagesInPortion(p: Portion | null): number {
  if (!p) return 0;
  return Math.max(1, idToPage(p.toId) - idToPage(p.fromId) + 1);
}

// آخرُ وردٍ سابق (جلساتُ آخر يومٍ قبل اليوم، موصولةً) — null إن لا شيء.
export function lastSabaq(s: HifzState, todayStr: string): Portion | null {
  const before = (s.sessions ?? []).filter((x) => x.date < todayStr);
  if (!before.length) return null;
  const last = before.reduce((d, x) => (x.date > d ? x.date : d), before[0].date);
  const day = before.filter((x) => x.date === last);
  return {
    fromId: Math.min(...day.map((x) => Math.min(x.fromId, x.toId))),
    toId: Math.max(...day.map((x) => Math.max(x.fromId, x.toId))),
  };
}

// هل يحتاج آخرُ وردٍ تثبيتاً؟ أحدثُ تقييمٍ لأيّ وجهٍ فيه «يحتاج إتقاناً»، ولم
// يغطّه عملُ اليوم بعد (فإن ثبّتَّه اليوم لم يُطلب ثانيةً ولو خرج ضعيفاً مرّة أخرى
// — غداً يُنظر فيه من جديد).
export function consolidationPortion(s: HifzState, todayStr: string): Portion | null {
  const p = lastSabaq(s, todayStr);
  if (!p || coveredToday(s, p, todayStr)) return null;
  const rated = latestRatingByPage(s);
  for (let pg = idToPage(p.fromId); pg <= idToPage(p.toId); pg++) {
    if (rated.get(pg)?.rating === 1) return p;
  }
  return null;
}

// نصفُ الورد بالآيات (لا بالوحدة): يعمل أيّاً كانت وحدةُ الخطة.
export function halfPortion(p: Portion): Portion {
  const n = p.toId - p.fromId + 1;
  return { fromId: p.fromId, toId: p.fromId + Math.max(1, Math.ceil(n / 2)) - 1 };
}

/** متأخّراتٌ تفوق هذا المضاعفَ من سقف اليوم تُنصِّف الجديد. */
export const BACKLOG_FACTOR = 2;

export function buildTodayPlan(s: HifzState, todayStr: string): TodayPlan {
  // السَّبْق يُعتبر منجزاً بمجرّد تسجيل جلسة حفظٍ اليوم — وإلا لظلّت البطاقة تعرض
  // ورد الغد وكأنّه مستحقٌّ الآن. من أراد الزيادة يفعلها من «زِد حفظك».
  const sessionToday = (s.sessions ?? []).some((x) => x.date === todayStr);
  const consolidate = sessionToday ? null : consolidationPortion(s, todayStr);
  let newPortion = sessionToday || consolidate ? null : plannedPortion(s);

  // المراجعة القريبة تُعرَض فقط ما لم يغطّها عملُ اليوم (لا نكرّرها في اليوم).
  // الغطاء يُحسب بدمج مدايات اليوم — حفظاً ومراجعةً — لأنّ تسجيل ورد اليوم
  // يُقدّم الجبهة فتنزلق النافذة؛ راجع coveredToday. وما يُثبَّت اليوم يُقصّ من
  // ذيلها — فهو آخر المحفوظ — فلا يُعرض النصّ نفسه مرّتين في جلسة.
  const band = recentReviewBand(s);
  let recentBand = band != null && coveredToday(s, band, todayStr) ? null : band;
  if (recentBand && consolidate && consolidate.fromId <= recentBand.toId) {
    recentBand = consolidate.fromId > recentBand.fromId
      ? { fromId: recentBand.fromId, toId: consolidate.fromId - 1 }
      : null;
  }

  // المستحقّ بالجدول — مستثنىً منه ما تغطّيه المراجعة القريبة (لا ازدواج)، وما
  // يُثبَّت اليوم.
  const dueAll = dueQueue(s, todayStr, undefined, recentBand != null || consolidate != null);
  const duePagesList = consolidate
    ? dueAll.pages.filter((d) => d.page < idToPage(consolidate.fromId) || d.page > idToPage(consolidate.toId))
    : dueAll.pages;
  const drills = drillsToday(s, todayStr);

  let pace: NewPace = consolidate ? "hold" : "full";
  let paceNote: string | null = consolidate ? "وردُك السابق يحتاج تثبيتاً — اليوم تثبيتٌ بلا جديد" : null;
  if (newPortion && dueAll.total > dueAll.cap * BACKLOG_FACTOR) {
    newPortion = halfPortion(newPortion);
    pace = "half";
    paceNote = `المتأخّر ${countPages(dueAll.total)} — نصفُ وردٍ اليوم حتى يخفّ`;
  }

  // لقمة اختبارٍ من القديم — تُختَم بها المراجعة حين يحين دورها ويوجد محفوظٌ كافٍ.
  const test = testDue(s, todayStr) ? smartTestPortion(s, todayStr) : null;
  const runs = reviewRuns(recentBand, duePagesList, test, consolidate);

  const steps: SessionStep[] = [];
  if (consolidate) steps.push({ kind: "consolidate", portion: consolidate });
  if (newPortion) steps.push({ kind: "memorize", portion: newPortion });
  if (runs.length) steps.push({ kind: "review", runs });
  for (const m of drills) {
    steps.push({ kind: "drill", mistakeId: m.id, ayahId: m.ayahId, wordIndex: m.wordIndex, word: m.word });
  }

  // تقدير خشن: ~2 دقيقة لوجه حفظٍ جديد (والتثبيتُ مثله)، ~1 لوجه مراجعة، ~0.5 لموضع خطأ.
  const est =
    pagesInPortion(newPortion) * 2 +
    pagesInPortion(consolidate) * 2 +
    pagesInPortion(recentBand) +
    duePagesList.length +
    drills.length * 0.5 +
    (runs.some((r) => r.test) ? 1 : 0);

  return {
    steps,
    newPortion,
    pace,
    paceNote,
    duePages: duePagesList.length,
    dueHidden: dueAll.hidden,
    dueCap: dueAll.cap,
    drills: drills.length,
    openMistakes: openMistakes(s).length,
    estMinutes: Math.max(1, Math.round(est)),
    summary: summarize(newPortion, consolidate, recentBand, duePagesList.length, drills.length),
  };
}

/**
 * مقاطعُ مراجعة اليوم: القريبةُ والمستحقُّ مرتّبان بترتيب المصحف، وكلُّ متجاورَين
 * (أو متداخلَين) مقطعٌ واحد — فتسمّع الأوجه ١٢ و١٣ و١٤ دفعةً واحدة لا ثلاثاً.
 *
 * والاختبارُ مقطعٌ مستقلٌّ في الآخر لا يُدمج بجاره: يُسجَّل اختباراً لا مراجعة.
 * فإن تقاطع مع مقطعٍ من المراجعة أو مع ما يُثبَّت اليوم (`busy`) سقط — الوجه
 * يُسمَّع مرّةً في الجلسة لا مرّتين.
 */
export function reviewRuns(
  recentBand: Portion | null, due: readonly DuePage[], test: Portion | null, busy: Portion | null = null,
): ReviewRun[] {
  const items: ReviewRun[] = [];
  if (recentBand) items.push({ portion: { ...recentBand }, recent: true });
  for (const d of due) {
    items.push({
      portion: { ...d.portion }, due: 1, never: d.neverReviewed ? 1 : 0,
      overdueDays: d.overdueDays, lapses: d.lapses, mistakes: d.mistakes,
    });
  }
  items.sort((a, b) => a.portion.fromId - b.portion.fromId);

  const runs: ReviewRun[] = [];
  for (const it of items) {
    const last = runs[runs.length - 1];
    if (last && it.portion.fromId <= last.portion.toId + 1) {
      last.portion.toId = Math.max(last.portion.toId, it.portion.toId);
      if (it.recent) last.recent = true;
      last.due = (last.due ?? 0) + (it.due ?? 0);
      last.never = (last.never ?? 0) + (it.never ?? 0);
      last.overdueDays = Math.max(last.overdueDays ?? 0, it.overdueDays ?? 0);
      last.lapses = (last.lapses ?? 0) + (it.lapses ?? 0);
      last.mistakes = (last.mistakes ?? 0) + (it.mistakes ?? 0);
    } else {
      runs.push(it);
    }
  }

  const overlaps = (p: Portion) => test != null && test.fromId <= p.toId && test.toId >= p.fromId;
  if (test && !runs.some((r) => overlaps(r.portion)) && !(busy && overlaps(busy))) {
    runs.push({ portion: { ...test }, test: true });
  }
  return runs;
}

/** عددُ أوجه المراجعة في مقاطعها (مجموعُ أوجه كلّ مقطع). */
export function reviewRunPages(runs: readonly ReviewRun[]): number {
  return runs.reduce((n, r) => n + pagesInPortion(r.portion), 0);
}

// «ماذا ينتظرني» — سطرٌ واحد بلغةٍ واضحة بدل ثلاث بطاقات أرقام.
function summarize(
  newPortion: Portion | null, consolidate: Portion | null, recentBand: Portion | null, duePages: number, drills: number,
): string {
  const parts: string[] = [];
  if (consolidate) parts.push(`تثبيت ${countAyat(consolidate.toId - consolidate.fromId + 1)}`);
  if (newPortion) {
    parts.push(`${countAyat(newPortion.toId - newPortion.fromId + 1)} جديدة`);
  }
  const reviewPages = (recentBand ? pagesInPortion(recentBand) : 0) + duePages;
  if (reviewPages > 0) parts.push(`${countPages(reviewPages)} للمراجعة`);
  if (drills > 0) parts.push(`${countSpots(drills)} للاختبار`);
  if (!parts.length) return "لا شيء مستحقٌّ اليوم — راحةٌ مستحقّة";
  return parts.join(" · ");
}

// ===================== استئناف الجلسة المقطوعة =====================
// لقطة الجلسة تُحفظ محلياً على الجهاز (لا تُزامَن — هي حالة واجهةٍ عابرة): إن
// أغلقتَ الجلسة في منتصفها عدتَ من حيث وقفت بدل البدء من الصفر. تُمسَح عند
// إتمامها، وتُهمَل إن كانت من يومٍ سابق.
const RESUME_KEY = "madar-hifz-session";

export interface SessionTally { memorized: number; reviewed: number; mistakesClosed: number }

export interface SessionSnapshot {
  date: string;
  steps: SessionStep[];
  idx: number;
  /** ما أُنجز من مقاطع خطوة المراجعة الجارية — فالإغلاق في منتصفها لا يُعيدها من أوّلها. */
  sub?: number;
  tally: SessionTally;
}

function isFiniteInteger(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function isPortion(value: unknown): value is Portion {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<Portion>;
  return isFiniteInteger(p.fromId, 1, TOTAL_AYAT) && isFiniteInteger(p.toId, 1, TOTAL_AYAT) && p.fromId <= p.toId;
}

function isSessionStep(value: unknown): value is SessionStep {
  if (!value || typeof value !== "object") return false;
  const step = value as Partial<SessionStep>;
  if (step.kind === "memorize" || step.kind === "consolidate" || step.kind === "recent" || step.kind === "test") {
    return isPortion(step.portion);
  }
  if (step.kind === "due") {
    const tag = (v: unknown) => v === undefined || isFiniteInteger(v);
    return isPortion(step.portion) && isFiniteInteger(step.page, 1, TOTAL_PAGES) &&
      isFiniteInteger(step.overdueDays) && typeof step.never === "boolean" &&
      tag(step.lapses) && tag(step.mistakes);
  }
  if (step.kind === "review") {
    const tag = (v: unknown) => v === undefined || isFiniteInteger(v);
    const flag = (v: unknown) => v === undefined || typeof v === "boolean";
    return Array.isArray(step.runs) && step.runs.length > 0 && step.runs.every((r: unknown) => {
      if (!r || typeof r !== "object") return false;
      const run = r as Partial<ReviewRun>;
      return isPortion(run.portion) && flag(run.recent) && flag(run.test) && tag(run.due) &&
        tag(run.never) && tag(run.overdueDays) && tag(run.lapses) && tag(run.mistakes);
    });
  }
  if (step.kind === "drill") {
    return typeof step.mistakeId === "string" && step.mistakeId.length > 0 &&
      isFiniteInteger(step.ayahId, 1, TOTAL_AYAT) &&
      (step.wordIndex === null || isFiniteInteger(step.wordIndex));
  }
  return false;
}

function isSessionTally(value: unknown): value is SessionTally {
  if (!value || typeof value !== "object") return false;
  const tally = value as Partial<SessionTally>;
  return isFiniteInteger(tally.memorized) && isFiniteInteger(tally.reviewed) &&
    isFiniteInteger(tally.mistakesClosed);
}

export function isValidSessionSnapshot(value: unknown, todayStr: string): value is SessionSnapshot {
  if (!value || typeof value !== "object") return false;
  const snap = value as Partial<SessionSnapshot>;
  return snap.date === todayStr && Array.isArray(snap.steps) && snap.steps.length > 0 &&
    snap.steps.every(isSessionStep) && isFiniteInteger(snap.idx) && snap.idx < snap.steps.length &&
    (snap.sub === undefined || isFiniteInteger(snap.sub)) && isSessionTally(snap.tally);
}

export function loadSession(todayStr: string): SessionSnapshot | null {
  try {
    const raw = prefGet(RESUME_KEY);
    if (!raw) return null;
    const snap: unknown = JSON.parse(raw);
    return isValidSessionSnapshot(snap, todayStr) ? snap : null;
  } catch {
    return null;
  }
}

export function saveSession(snap: SessionSnapshot) {
  prefSetJSON(RESUME_KEY, snap);
}

export function clearSession() {
  prefRemove(RESUME_KEY);
}

// عنوانٌ مختصر لكلّ نوع خطوة — تُستعمل في شريط الخطوات وفي بطاقة «ماذا ينتظرني».
export const STEP_LABEL: Record<SessionStep["kind"], string> = {
  memorize: "السَّبْق",
  consolidate: "تثبيت",
  recent: "القريبة",
  due: "مستحقّ",
  drill: "خطأ",
  test: "اختبار",
  review: "المراجعة",
};

// عدد الأخطاء المفتوحة يفوق ما نختبر عليه اليوم؟ نُخبر المستخدم بذلك صراحةً.
export function drillOverflow(plan: TodayPlan): number {
  return Math.max(0, plan.openMistakes - plan.drills);
}
