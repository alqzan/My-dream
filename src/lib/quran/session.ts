// ===================== جلسة اليوم — المسار الواحد =====================
// كان قسم الحفظ يعرض مساراتٍ متوازية: «المراجعة القريبة» و«مراجعة مركّزة»
// و«اختبار مفاجئ» و«أخطائي» — فيظهر الوجه الواحد في أربعة أماكن ولا يدري
// المستخدم أيُّها المراجعة الحقيقية. هنا يُبنى مسارٌ واحد مرتّب لليوم، وتُستثنى
// الأوجه المكرّرة، فتمشي في الجلسة خطوةً خطوة حتى تنتهي.
//
// الترتيب مقصود: الجديد أوّلاً والذهن صافٍ ← تثبيت القريب ← المستحقّ بالجدول
// (الأشدّ تأخّراً أوّلاً) ← اختبار مواضع الخطأ ← لقمة اختبارٍ من القديم.

import type { HifzState } from "../types";
import type { Portion } from "./hifz";
import {
  plannedPortion, recentReviewBand, drillsToday, smartTestPortion, testDue,
  countPages, countSpots, countAyat, openMistakes, coveredToday,
} from "./hifz";
import { dueQueue, type DuePage } from "./schedule";
import { idToPage } from "./meta";

export type SessionStep =
  | { kind: "memorize"; portion: Portion }
  | { kind: "recent"; portion: Portion }
  | { kind: "due"; portion: Portion; page: number; overdueDays: number; never: boolean }
  | { kind: "drill"; mistakeId: string; ayahId: number; wordIndex: number | null; word?: string }
  | { kind: "test"; portion: Portion };

export interface TodayPlan {
  steps: SessionStep[];
  newPortion: Portion | null; // السَّبْق (null إن أُنجز اليوم أو خُتم المصحف)
  duePages: number; // الأوجه المستحقّة المعروضة اليوم
  dueHidden: number; // مؤجَّلٌ لغدٍ حتى لا يتراكم عبء يومٍ واحد
  drills: number; // مواضع الخطأ المُختبَر عليها اليوم
  openMistakes: number; // كلّ المواضع المفتوحة (للعرض لا للاختبار)
  estMinutes: number;
  summary: string; // «ماذا ينتظرني» بجملةٍ واحدة
}

function pagesInPortion(p: Portion | null): number {
  if (!p) return 0;
  return Math.max(1, idToPage(p.toId) - idToPage(p.fromId) + 1);
}

export function buildTodayPlan(s: HifzState, todayStr: string): TodayPlan {
  // السَّبْق يُعتبر منجزاً بمجرّد تسجيل جلسة حفظٍ اليوم — وإلا لظلّت البطاقة تعرض
  // ورد الغد وكأنّه مستحقٌّ الآن. من أراد الزيادة يفعلها من «زِد حفظك».
  const sessionToday = (s.sessions ?? []).some((x) => x.date === todayStr);
  const newPortion = sessionToday ? null : plannedPortion(s);

  // المراجعة القريبة تُعرَض فقط ما لم يغطّها عملُ اليوم (لا نكرّرها في اليوم).
  // الغطاء يُحسب بدمج مدايات اليوم — حفظاً ومراجعةً — لأنّ تسجيل ورد اليوم
  // يُقدّم الجبهة فتنزلق النافذة؛ راجع coveredToday.
  const band = recentReviewBand(s);
  const recentBand = band != null && coveredToday(s, band, todayStr) ? null : band;

  // المستحقّ بالجدول — مستثنىً منه ما تغطّيه المراجعة القريبة (لا ازدواج).
  const due = dueQueue(s, todayStr, undefined, recentBand != null);
  const drills = drillsToday(s, todayStr);

  const steps: SessionStep[] = [];
  if (newPortion) steps.push({ kind: "memorize", portion: newPortion });
  if (recentBand) steps.push({ kind: "recent", portion: recentBand });
  for (const d of due.pages as DuePage[]) {
    steps.push({ kind: "due", portion: d.portion, page: d.page, overdueDays: d.overdueDays, never: d.neverReviewed });
  }
  for (const m of drills) {
    steps.push({ kind: "drill", mistakeId: m.id, ayahId: m.ayahId, wordIndex: m.wordIndex, word: m.word });
  }
  // لقمة اختبارٍ من القديم — تُختَم بها الجلسة حين يحين دورها ويوجد محفوظٌ كافٍ.
  if (testDue(s, todayStr)) {
    const t = smartTestPortion(s, todayStr);
    if (t) steps.push({ kind: "test", portion: t });
  }

  // تقدير خشن: ~2 دقيقة لوجه حفظٍ جديد، ~1 لوجه مراجعة، ~0.5 لموضع خطأ.
  const est =
    pagesInPortion(newPortion) * 2 +
    pagesInPortion(recentBand) +
    due.pages.length +
    drills.length * 0.5 +
    (steps.some((x) => x.kind === "test") ? 1 : 0);

  return {
    steps,
    newPortion,
    duePages: due.pages.length,
    dueHidden: due.hidden,
    drills: drills.length,
    openMistakes: openMistakes(s).length,
    estMinutes: Math.max(1, Math.round(est)),
    summary: summarize(newPortion, recentBand, due.pages.length, drills.length),
  };
}

// «ماذا ينتظرني» — سطرٌ واحد بلغةٍ واضحة بدل ثلاث بطاقات أرقام.
function summarize(
  newPortion: Portion | null, recentBand: Portion | null, duePages: number, drills: number,
): string {
  const parts: string[] = [];
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
  tally: SessionTally;
}

export function loadSession(todayStr: string): SessionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as SessionSnapshot;
    if (snap?.date !== todayStr || !Array.isArray(snap.steps) || !snap.steps.length) return null;
    if (snap.idx >= snap.steps.length) return null; // منتهية
    return snap;
  } catch {
    return null;
  }
}

export function saveSession(snap: SessionSnapshot) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(RESUME_KEY, JSON.stringify(snap)); } catch {}
}

export function clearSession() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(RESUME_KEY); } catch {}
}

// عنوانٌ مختصر لكلّ نوع خطوة — تُستعمل في شريط الخطوات وفي بطاقة «ماذا ينتظرني».
export const STEP_LABEL: Record<SessionStep["kind"], string> = {
  memorize: "السَّبْق",
  recent: "القريبة",
  due: "مستحقّ",
  drill: "خطأ",
  test: "اختبار",
};

// عدد الأخطاء المفتوحة يفوق ما نختبر عليه اليوم؟ نُخبر المستخدم بذلك صراحةً.
export function drillOverflow(plan: TodayPlan): number {
  return Math.max(0, plan.openMistakes - plan.drills);
}
