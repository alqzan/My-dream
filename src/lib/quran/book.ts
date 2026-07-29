// ===================== المصحف بوصفه كتاباً =====================
// `page.ts` يجيب: أين تقع الآية من صفحتها. وهذا الملفّ يجيب سؤالاً آخر: **كيف
// يُمسك هذا المصحف باليد** — أيّ صفحتين مفتوحتان معاً، وأين الكعب من كلّ صفحة،
// وكم ورقةً تحت إبهامك الأيمن وكم تحت الأيسر.
//
// الكتاب العربيّ يُقرأ من اليمين: في الوجه المفتوح تكون الفردية يُمنى والزوجية
// يُسرى (الفاتحة ص1 يمين، وأوّل البقرة ص2 يسار). ومن ثمّ:
//   • **الكعب** في داخل كلّ صفحة: يسارَ اليُمنى، ويمينَ اليُسرى.
//   • **ما قرأتَه يتراكم على اليمين**، وما بقي على اليسار — عكس الكتاب اللاتينيّ.
//   • **الورقة تُقلَب من اليسار إلى اليمين** حين تتقدّم: الورقة الراقدة على
//     اليسار (ظاهرُها الصفحة الزوجية) تدور على الكعب فيظهر باطنُها — الفردية
//     التالية — على اليمين. لذلك السحب يميناً تقدّمٌ، والسحب يساراً رجوع.
// كلّ ذلك حسابٌ نقيّ بلا DOM، فيبقى مختبَراً ويعبر إلى الغلاف الأصليّ كما هو.
import { TOTAL_PAGES } from "./meta";
import { pageSide, facingPage, clampPage } from "./page";

export interface Spread {
  right: number; // الصفحة اليُمنى (فردية)
  left: number | null; // اليُسرى (زوجية) — null في آخر المصحف إن لم يكن لها مقابل
}

// الوجه المفتوح الذي تقع فيه صفحةٌ ما: الصفحتان المتقابلتان معاً.
export function spreadOf(page: number): Spread {
  const p = clampPage(page);
  return pageSide(p) === "يمنى"
    ? { right: p, left: facingPage(p) }
    : { right: facingPage(p) ?? p, left: p };
}

// هل الصفحتان في وجهٍ مفتوحٍ واحد؟ (انتقالٌ بينهما تصفّحٌ بالعين لا قلبُ ورقة.)
export function sameSpread(a: number, b: number): boolean {
  const sa = spreadOf(a);
  const sb = spreadOf(b);
  return sa.right === sb.right && sa.left === sb.left;
}

// سماكةُ المصحف حول موضعك: كم ورقةً خلفك (يميناً) وكم أمامك (يساراً).
export interface LeafStack {
  before: number;
  after: number;
  beforePct: number; // 0..1
  afterPct: number; // 0..1
}

export function leafStack(page: number): LeafStack {
  const p = clampPage(page);
  const before = p - 1;
  const after = TOTAL_PAGES - p;
  const span = TOTAL_PAGES - 1;
  return { before, after, beforePct: before / span, afterPct: after / span };
}

// عرضُ حافّة الأوراق بالبكسل من نسبتها — سماكةٌ محسوسة لا رقمٌ يُقرأ. الحدّ
// الأدنى ليس صفراً: حتى في الصفحة الأولى للمصحف غلافٌ له سمك.
export const EDGE_MIN_PX = 3;
export const EDGE_MAX_PX = 15;

export function edgeWidth(pct: number): number {
  const t = Math.max(0, Math.min(1, pct));
  return Math.round(EDGE_MIN_PX + (EDGE_MAX_PX - EDGE_MIN_PX) * t);
}

// أيّ حافّةٍ من الصفحة هي الطرف الخارجيّ (المقابل للكعب)؟ يمينُ اليُمنى ويسارُ
// اليُسرى — وهي الحافّة التي تُمسك بها الورقة لتقلبها، وفيها تظهر السماكة.
export function outerEdge(page: number): "right" | "left" {
  return pageSide(clampPage(page)) === "يمنى" ? "right" : "left";
}

// اتّجاه التقدّم بالسحب: الورقة تنتقل من اليسار إلى اليمين، فالإزاحة الموجبة
// (يميناً) تقدّمٌ والسالبة رجوع. دالّةٌ واحدة تُترجم الإزاحة إلى خطوةٍ صفحية.
export const TURN_THRESHOLD_PX = 64;

export function turnStep(dx: number, threshold: number = TURN_THRESHOLD_PX): -1 | 0 | 1 {
  if (dx >= threshold) return 1; // سُحبت الورقة يميناً → الوجه التالي
  if (dx <= -threshold) return -1;
  return 0;
}
