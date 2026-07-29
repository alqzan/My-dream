// ===================== موضع الآية في المصحف =====================
// «صورةُ الصفحة» هي ما يثبّت الحفظ: الحافظ يتذكّر أن الآية في أعلى الصفحة
// اليُمنى، أو في آخر سطرٍ من اليُسرى. هذا الملفّ يحسب ذلك الموضع حساباً نقيّاً
// (بلا DOM ولا React) من بنية المصحف وحدها، فيبقى مختبَراً ويعبر إلى الغلاف
// الأصليّ كما هو.
//
// **الموضع الرأسيّ تقريبٌ، وقد قُصِد**: هذا الملفّ يحسب الثلث من **ترتيب الآية
// بين آيات صفحتها** لا من رقم سطرها. و«يُمنى/يُسرى» معلومةٌ قاطعة (تُشتقّ من رقم
// الصفحة).
//
// وأرقامُ الأسطر صارت معلومةً بعدُ في `mushafLayout.ts` (تخطيط مصحف المدينة
// المقيس)، فمن أراد «السطر الحادي عشر» بدل «أسفل الصفحة» فمصدرُه هناك — ولا
// يُشتقّ هنا حتى لا يستورد الحسابُ النقيّ حزمَ البيانات الثقيلة لأجل عبارةٍ في
// بطاقة.
import { pageRange, idToPage, TOTAL_PAGES } from "./meta";

// الكتاب العربيّ يُفتح من اليمين، فأوّل صفحةٍ في الوجه المفتوح هي الفردية:
// الفردية يُمنى والزوجية يُسرى. (الفاتحة ص1 يُمنى، والبقرة ص2 يُسرى.)
export type PageSide = "يمنى" | "يسرى";

export function pageSide(page: number): PageSide {
  return page % 2 === 1 ? "يمنى" : "يسرى";
}

// الصفحة المقابلة في الوجه المفتوح نفسه. أوّل وجهٍ في المصحف هو الفاتحة (ص1،
// يُمنى) وأوّل البقرة (ص2، يُسرى)، فالتقرين ‎1↔2‎ و‎3↔4‎ — لا ‎2↔3‎.
// الحارس يبقى لأن مصحفاً بعدد صفحاتٍ فرديّ يترك آخرَ صفحةٍ بلا مقابل.
export function facingPage(page: number): number | null {
  const other = page % 2 === 1 ? page + 1 : page - 1;
  if (other < 1 || other > TOTAL_PAGES) return null;
  return other;
}

// أين تقع الآية رأسياً داخل صفحتها؟ ثلثٌ أعلى/أوسط/أسفل، محسوبةً من ترتيب
// الآية بين آيات صفحتها. صفحةٌ فيها آيةٌ واحدة (آيات البقرة الطوال) → «الصفحة
// كلّها».
export type VerticalZone = "أعلى الصفحة" | "وسط الصفحة" | "أسفل الصفحة" | "الصفحة كلّها";

export interface AyahPlace {
  page: number;
  side: PageSide;
  zone: VerticalZone;
  // ترتيب الآية بين آيات الصفحة (1-based) وعددها — يُعرض كما هو، فهو دقيقٌ
  // تماماً بخلاف الثلث التقريبيّ.
  index: number;
  count: number;
}

export function placeOf(id: number): AyahPlace {
  const page = idToPage(id);
  const { start, end } = pageRange(page);
  const count = end - start + 1;
  const index = id - start + 1;
  return { page, side: pageSide(page), zone: zoneOf(index, count), index, count };
}

export function zoneOf(index: number, count: number): VerticalZone {
  if (count <= 1) return "الصفحة كلّها";
  // نسبةُ منتصف الآية من الصفحة: تجعل آيةً واحدةً في صفحةٍ من آيتين تقع في
  // «أعلى» والأخرى في «أسفل» بدل أن تنزلق كلتاهما إلى الوسط.
  const t = (index - 0.5) / count;
  if (t < 1 / 3) return "أعلى الصفحة";
  if (t < 2 / 3) return "وسط الصفحة";
  return "أسفل الصفحة";
}

// وصفٌ عربيّ جاهز للعرض: «ص 262 · يُمنى · أعلى الصفحة».
export function describePlace(p: AyahPlace): string {
  return `ص ${p.page} · ${p.side} · ${p.zone}`;
}

// تنقّلٌ بحدود المصحف (لا صفحة 0 ولا 605).
export function clampPage(page: number): number {
  return Math.min(TOTAL_PAGES, Math.max(1, page));
}
