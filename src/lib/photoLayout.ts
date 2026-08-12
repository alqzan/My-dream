// ===================== تخطيط كولاج صور المذكرة =====================
// «شبكةٌ واحدة لكل عدد» بدل صورةٍ مقصوصةٍ بارتفاعٍ ثابت: الصورة الواحدة تأخذ
// إطاراً مريحاً (4:3)، والصورتان تتجاوران مربّعتين، والثلاث تُبنى حول صورةٍ
// كبيرةٍ وصغيرتين، والأربع فأكثر تأخذ تخطيطاً «مجلّاتياً» (كبيرةٌ + اثنتان +
// عريضة). الزائد عن المعروض يُختصر بشارة «+N» على آخر بلاطة.
//
// نقيّ تماماً: لا React ولا DOM — يُرجع أرقام الشبكة فقط، فيبقى مختبَراً
// ويعبر إلى الغلاف الأصليّ بلا تعديل (راجع docs/APP-STORE-PLAN.md).

/** بلاطةٌ واحدة بموضعها في شبكة CSS (1-based كما في `grid-column-start`). */
export interface CollageTile {
  /** فهرس الصورة في مصفوفة المصادر الأصلية. */
  index: number;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

export interface CollageLayout {
  cols: number;
  rows: number;
  /** نسبة العرض إلى الارتفاع للكولاج كاملاً — تُحجز المساحة قبل وصول البايتات. */
  aspect: string;
  tiles: CollageTile[];
  /** كم صورةً بقيت خلف شارة «+N» على آخر بلاطة (0 = لا شيء مخفيّ). */
  overflow: number;
}

const EMPTY: CollageLayout = { cols: 1, rows: 1, aspect: "4 / 3", tiles: [], overflow: 0 };

/**
 * تخطيط الكولاج لعدد صورٍ معلوم. `count` عددُ **المصادر** لا البايتات الحاضرة:
 * المساحة تُحجز أوّلاً فلا يقفز التخطيط لحظة وصول صورةٍ من مخزن الهاش.
 */
export function collageLayout(count: number): CollageLayout {
  if (count <= 0) return EMPTY;

  if (count === 1) {
    return {
      cols: 1,
      rows: 1,
      aspect: "4 / 3",
      tiles: [{ index: 0, col: 1, row: 1, colSpan: 1, rowSpan: 1 }],
      overflow: 0,
    };
  }

  if (count === 2) {
    // خليّتان مربّعتان جنباً إلى جنب.
    return {
      cols: 2,
      rows: 1,
      aspect: "2 / 1",
      tiles: [
        { index: 0, col: 1, row: 1, colSpan: 1, rowSpan: 1 },
        { index: 1, col: 2, row: 1, colSpan: 1, rowSpan: 1 },
      ],
      overflow: 0,
    };
  }

  if (count === 3) {
    // كبيرةٌ (ثلثا العرض) وصغيرتان مكدّستان — الكبيرة أوّلاً في اتجاه القراءة.
    return {
      cols: 3,
      rows: 2,
      aspect: "3 / 2",
      tiles: [
        { index: 0, col: 1, row: 1, colSpan: 2, rowSpan: 2 },
        { index: 1, col: 3, row: 1, colSpan: 1, rowSpan: 1 },
        { index: 2, col: 3, row: 2, colSpan: 1, rowSpan: 1 },
      ],
      overflow: 0,
    };
  }

  // أربعٌ فأكثر: كبيرةٌ مربّعة (نصف العرض) + صغيرتان فوق + عريضةٌ تحتهما.
  // ما زاد عن الأربع يُعدّ خلف شارة «+N» على البلاطة العريضة.
  return {
    cols: 4,
    rows: 2,
    aspect: "2 / 1",
    tiles: [
      { index: 0, col: 1, row: 1, colSpan: 2, rowSpan: 2 },
      { index: 1, col: 3, row: 1, colSpan: 1, rowSpan: 1 },
      { index: 2, col: 4, row: 1, colSpan: 1, rowSpan: 1 },
      { index: 3, col: 3, row: 2, colSpan: 2, rowSpan: 1 },
    ],
    overflow: count - 4,
  };
}

// ===================== جدار المعرض =====================
// المعرض شبكةُ ثلاثة أعمدة، لكن الرتابة تقتل الصفحة: كل صورةٍ سادسة (بادئةً
// بالأولى) تتمدّد مربّعاً مضاعفاً 2×2، والباقي بلاطاتٌ مفردة. الدورة طولها 6
// **لأنّ خاناتها تقسم على الأعمدة تماماً**: 4 خانات للكبيرة + 5 مفردات = 9 =
// ثلاثة صفوفٍ تامّة، فلا تتراكم فجوةٌ مهما طال الجدار (والحارس في الاختبار).
const WALL_CYCLE = 6;

/** هل تتمدّد البلاطةُ رقم `i` (من بداية مجموعتها) إلى مربّع 2×2؟ */
export function isWallFeature(i: number): boolean {
  return i % WALL_CYCLE === 0;
}
