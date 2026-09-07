// ===================== تفضيلات قراءة المصحف =====================
// ثلاثةُ تفضيلاتٍ تحكم صورةَ الوجه في كلّ شاشةٍ تعرض المصحف (القراءة والحفظ
// والتسميع واختبار مواضع الخطأ) — فصورةُ الوجه واحدةٌ أينما ظهر، وهي بيت
// القصيد في الحفظ البصريّ. تعيش على الجهاز وحده (لا تُزامَن).
//
// **لماذا تكبيرٌ لا «حجم خطّ»؟** لأنّ الوجه صار بأسطر المصحف الحقيقية: خمسةَ
// عشر سطراً ينتهي كلٌّ منها حيث ينتهي في المطبوع، ومقاسُ الخطّ فيها مشتقٌّ من
// عرض الوجه لا مختارٌ استقلالاً (راجع `mushafLayout.ts`). فكِبَرُ الخطّ وضيقُ
// التباعد لم يعودا خيارين منفصلين — الوجه يكبر كلّه معاً أو لا يكبر. من رفع
// الخطّ وحده كسَر انطباق الأسطر على عرضها، وهو ما كنّا عليه.
//
// **والنموذج (`skin`) ورقةٌ لا سمة**: أربعُ صفحاتٍ للوجه الواحد (ورق · المدينة ·
// ليل · سادة) تختلف في الورق والحبر وشكل التحديد، ولا تمسّ الأسطر ولا مواضعها
// أبداً — الصورةُ المحفوظة هي هي، والذي يتغيّر ما حولها. القيمُ في `MUSHAF_SKINS`
// أدناه، وتنفيذُها أصنافُ `mushaf-skin-*` في `globals.css`.
//
// **و«ملء الطول» (`fill`)** يوزّع الأسطر على ارتفاع الشاشة كلّه بدل أن تقف
// الورقةُ على نسبة المطبوع فيبقى تحتها فراغ. في الجوّال (شاشةٌ أطول من الوجه)
// هذا هو الفرق بين «وجهٍ في نافذة» و«مصحفٍ بيدك».
//
// مفتاح التخزين هو نفسه القديم `madar-mushaf-read`؛ التفضيل القديم (حجمٌ
// وتباعد) يُقرأ فيُترجَم تكبيراً بنسبة حجمه إلى الحجم الأصليّ، فلا يجد المستخدم
// وجهاً عاد إلى مقاسٍ لم يخترْه. القراءة/الكتابة هنا وحدها — لا `localStorage`
// منثوراً في المكوّنات (راجع CLAUDE.md: كلّ ما هو منصّة خلف واجهةٍ قابلة
// للاستبدال).

/** نموذجُ عرض الوجه — ورقُه وحبرُه وشكلُ تحديده. */
export type MushafSkin = "warm" | "madina" | "night" | "plain";

export const MUSHAF_SKINS: { id: MushafSkin; label: string; hint: string }[] = [
  { id: "warm", label: "ورق", hint: "كريميّ دافئ · تحديدٌ بقلم" },
  { id: "madina", label: "المدينة", hint: "ورقٌ ناصع · إطارٌ وتحديدٌ هادئ" },
  { id: "night", label: "ليل", hint: "حبرٌ داكن · تحديدٌ بهالة" },
  { id: "plain", label: "سادة", hint: "بلا ورقٍ ولا ظلّ · النصّ وحده" },
];

const SKIN_IDS = MUSHAF_SKINS.map((s) => s.id);

export interface ReadPrefs {
  zoom: number; // تكبير الوجه (1 = ملء العرض)
  skin: MushafSkin; // نموذج العرض
  fill: boolean; // توزيع الأسطر على ارتفاع الشاشة في وضع ملء الشاشة
}

export const DEFAULT_READ_PREFS: ReadPrefs = { zoom: 1, skin: "warm", fill: true };
export const READ_PREFS_KEY = "madar-mushaf-read";

export const ZOOM_RANGE = { min: 0.8, max: 2, step: 0.1 };

/** الحجم الذي كان تلقائياً في التفضيل القديم — أساسُ ترجمته تكبيراً. */
const LEGACY_BASE_SIZE = 22;

export function clampZoom(z: number): number {
  const stepped = Math.round(z / ZOOM_RANGE.step) * ZOOM_RANGE.step;
  return Math.min(ZOOM_RANGE.max, Math.max(ZOOM_RANGE.min, Math.round(stepped * 10) / 10));
}

/** نموذجٌ من قيمةٍ مخزَّنة — وما لم يُعرَف يعود إلى الافتراضيّ لا إلى صنفٍ لا وجود له. */
export function skinFrom(raw: unknown): MushafSkin {
  return typeof raw === "string" && (SKIN_IDS as string[]).includes(raw)
    ? (raw as MushafSkin)
    : DEFAULT_READ_PREFS.skin;
}

/** ترجمةُ التفضيل المخزَّن (جديدِه وقديمِه) إلى تفضيلٍ كامل. نقيّةٌ ومختبَرة. */
export function readPrefsFrom(raw: unknown): ReadPrefs {
  if (!raw || typeof raw !== "object") return DEFAULT_READ_PREFS;
  const r = raw as { zoom?: unknown; size?: unknown; skin?: unknown; fill?: unknown };
  const skin = skinFrom(r.skin);
  const fill = typeof r.fill === "boolean" ? r.fill : DEFAULT_READ_PREFS.fill;
  if (typeof r.zoom === "number" && Number.isFinite(r.zoom)) return { zoom: clampZoom(r.zoom), skin, fill };
  if (typeof r.size === "number" && Number.isFinite(r.size) && r.size > 0) {
    return { zoom: clampZoom(r.size / LEGACY_BASE_SIZE), skin, fill };
  }
  return { ...DEFAULT_READ_PREFS, skin, fill };
}

export function loadReadPrefs(): ReadPrefs {
  if (typeof window === "undefined") return DEFAULT_READ_PREFS;
  try {
    return readPrefsFrom(JSON.parse(window.localStorage.getItem(READ_PREFS_KEY) || "null"));
  } catch { /* ignore */ }
  return DEFAULT_READ_PREFS;
}

/** حفظُ ما تغيّر وحده — الباقي يبقى كما هو في التخزين لا كما هو في الافتراضيّ. */
export function saveReadPrefs(p: Partial<ReadPrefs>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(READ_PREFS_KEY, JSON.stringify({ ...loadReadPrefs(), ...p }));
  } catch { /* ignore */ }
}
