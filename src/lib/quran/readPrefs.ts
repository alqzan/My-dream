// ===================== تفضيلات قراءة المصحف =====================
// حجم الخطّ وتباعد الأسطر: تُضبط مرّةً في قارئ الصفحات وتسري على كلّ لوحٍ يعرض
// المصحف (الحفظ والتسميع واختبار مواضع الخطأ) — فصورةُ الوجه واحدةٌ في كلّ
// الشاشات، وهي بيت القصيد في الحفظ البصريّ. تعيش على الجهاز وحده (لا تُزامَن).
//
// مفتاح التخزين هو نفسه القديم `madar-mushaf-read` فتنتقل تفضيلات المستخدم
// الحالية كما هي. القراءة/الكتابة هنا وحدها — لا `localStorage` منثوراً في
// المكوّنات (راجع CLAUDE.md: كلّ ما هو منصّة خلف واجهةٍ قابلة للاستبدال).
export interface ReadPrefs {
  size: number; // حجم خطّ النصّ بالبكسل
  lh: number; // تباعد الأسطر
}

export const DEFAULT_READ_PREFS: ReadPrefs = { size: 22, lh: 2.6 };
export const READ_PREFS_KEY = "madar-mushaf-read";

export const SIZE_RANGE = { min: 16, max: 34, step: 2 };
export const LH_RANGE = { min: 1.8, max: 3.4, step: 0.2 };

export function loadReadPrefs(): ReadPrefs {
  if (typeof window === "undefined") return DEFAULT_READ_PREFS;
  try {
    const r = JSON.parse(window.localStorage.getItem(READ_PREFS_KEY) || "null");
    if (r && typeof r.size === "number" && typeof r.lh === "number") return { size: r.size, lh: r.lh };
  } catch { /* ignore */ }
  return DEFAULT_READ_PREFS;
}

export function saveReadPrefs(p: ReadPrefs): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(READ_PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
