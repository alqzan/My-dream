// ===================== تفضيلات قراءة المصحف =====================
// تكبيرُ الوجه: يُضبط مرّةً في قارئ الصفحات ويسري على كلّ لوحٍ يعرض المصحف
// (الحفظ والتسميع واختبار مواضع الخطأ) — فصورةُ الوجه واحدةٌ في كلّ الشاشات،
// وهي بيت القصيد في الحفظ البصريّ. تعيش على الجهاز وحده (لا تُزامَن).
//
// **لماذا تكبيرٌ لا «حجم خطّ»؟** لأنّ الوجه صار بأسطر المصحف الحقيقية: خمسةَ
// عشر سطراً ينتهي كلٌّ منها حيث ينتهي في المطبوع، ومقاسُ الخطّ فيها مشتقٌّ من
// عرض الوجه لا مختارٌ استقلالاً (راجع `mushafLayout.ts`). فكِبَرُ الخطّ وضيقُ
// التباعد لم يعودا خيارين منفصلين — الوجه يكبر كلّه معاً أو لا يكبر. من رفع
// الخطّ وحده كسَر انطباق الأسطر على عرضها، وهو ما كنّا عليه.
//
// مفتاح التخزين هو نفسه القديم `madar-mushaf-read`؛ التفضيل القديم (حجمٌ
// وتباعد) يُقرأ فيُترجَم تكبيراً بنسبة حجمه إلى الحجم الأصليّ، فلا يجد المستخدم
// وجهاً عاد إلى مقاسٍ لم يخترْه. القراءة/الكتابة هنا وحدها — لا `localStorage`
// منثوراً في المكوّنات (راجع CLAUDE.md: كلّ ما هو منصّة خلف واجهةٍ قابلة
// للاستبدال).
export interface ReadPrefs {
  zoom: number; // تكبير الوجه (1 = ملء العرض)
}

export const DEFAULT_READ_PREFS: ReadPrefs = { zoom: 1 };
export const READ_PREFS_KEY = "madar-mushaf-read";

export const ZOOM_RANGE = { min: 0.8, max: 2, step: 0.1 };

/** الحجم الذي كان تلقائياً في التفضيل القديم — أساسُ ترجمته تكبيراً. */
const LEGACY_BASE_SIZE = 22;

export function clampZoom(z: number): number {
  const stepped = Math.round(z / ZOOM_RANGE.step) * ZOOM_RANGE.step;
  return Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, Math.round(stepped * 10) / 10));
}

/** ترجمةُ التفضيل المخزَّن (جديدِه وقديمِه) إلى تكبير. نقيّةٌ ومختبَرة. */
export function readPrefsFrom(raw: unknown): ReadPrefs {
  if (!raw || typeof raw !== "object") return DEFAULT_READ_PREFS;
  const r = raw as { zoom?: unknown; size?: unknown };
  if (typeof r.zoom === "number" && Number.isFinite(r.zoom)) return { zoom: clampZoom(r.zoom) };
  if (typeof r.size === "number" && Number.isFinite(r.size) && r.size > 0) {
    return { zoom: clampZoom(r.size / LEGACY_BASE_SIZE) };
  }
  return DEFAULT_READ_PREFS;
}

export function loadReadPrefs(): ReadPrefs {
  if (typeof window === "undefined") return DEFAULT_READ_PREFS;
  try {
    return readPrefsFrom(JSON.parse(window.localStorage.getItem(READ_PREFS_KEY) || "null"));
  } catch { /* ignore */ }
  return DEFAULT_READ_PREFS;
}

export function saveReadPrefs(p: ReadPrefs): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(READ_PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
