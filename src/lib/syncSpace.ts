// صلاحية مفتاح المزامنة **كمقطع مسارٍ في Firestore**.
//
// النموذج بلا تسجيل دخول: القيمة التي يحفظها المالك في «مفتاح المزامنة» تُستعمل
// حرفياً مقطعَ مسارٍ في كل نداء Firestore (`userData/{key}`, ‏`userData/{key}/
// inbox`, …). ومقاطع المسار عند Firestore محكومةٌ بقواعد معرّف المستند: لا تحمل
// `/`، وليست `.` ولا `..`، ولا تطابق `__…__`، وطولها بين بايتٍ و1500 بايت.
//
// لماذا وحدةٌ مستقلة بدل شرطٍ داخل `firebase.ts`: قيمةٌ مخالفة (رابطُ موقعٍ
// لُصق سهواً في خانة المفتاح مثلاً) تجعل `doc()`/`collection()` **ترمي فوراً
// وتزامنياً** — لا وعداً مرفوضاً يُلتقط بـcatch. ولأن `SyncProvider` و
// `PendingInboxWatcher` ينادانها داخل useEffect، كان الرمي يتسلّق إلى حدّ الخطأ
// فيسقط التطبيق كاملَه على كل إقلاع (شاشة «صار خطأ مؤقت في التحميل») بلا طريقٍ
// للوصول إلى صفحة الإعدادات لتصحيح المفتاح — أي قفلٌ تامّ لا مخرج منه من داخل
// التطبيق. فالتحقّق هنا، عند البوابة، وقبل أن تلمس القيمةُ Firebase أصلاً.
//
// نقيّة عمداً: بلا `window` ولا DOM ولا Firebase — فتُختبر وحدةً وتعبر إلى
// الغلاف الأصليّ بلا تعديل (راجع docs/APP-STORE-PLAN.md).

/** حدّ Firestore لمعرّف المستند: 1500 بايت UTF-8 (لا حرفاً). */
export const MAX_SYNC_SPACE_BYTES = 1500;

export type SyncSpaceProblem =
  | "empty" // فارغ أو مسافاتٌ فقط
  | "slash" // يحمل `/` — الحالة العملية الوحيدة تقريباً: رابطٌ لُصق مكان المفتاح
  | "dots" // `.` أو `..` وحدهما
  | "reserved" // `__…__` محجوزٌ لمعرّفات Firestore الداخلية
  | "control" // محرف تحكّمٍ غير مرئي (لصقٌ من مصدرٍ مشوّه)
  | "tooLong";

// eslint-disable-next-line no-control-regex -- محارف التحكّم هي بالضبط ما نمنعه
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const encoder = new TextEncoder();

/** المشكلة الأولى في القيمة، أو `null` إن كانت مقطعَ مسارٍ صالحاً.
 *  لا تقصّ القيمة ولا تعدّلها — قرار القصّ لنداءِ الحفظ، لا لهذه. */
export function syncSpaceProblem(value: string | null | undefined): SyncSpaceProblem | null {
  if (!value) return "empty";
  if (!value.trim()) return "empty";
  if (value.includes("/")) return "slash";
  if (value === "." || value === "..") return "dots";
  if (/^__.*__$/.test(value)) return "reserved";
  if (CONTROL_CHARS.test(value)) return "control";
  if (encoder.encode(value).length > MAX_SYNC_SPACE_BYTES) return "tooLong";
  return null;
}

export function isValidSyncSpace(value: string | null | undefined): value is string {
  return syncSpaceProblem(value) === null;
}

/** رسالةٌ عربية تشرح للمالك ما الخطأ في القيمة وكيف يصلحه. لا تُدرج القيمة
 *  نفسها أبداً — قد تكون مفتاحاً سرياً صحيحاً أخطأ في حرفٍ واحد فقط. */
export function describeSyncSpaceProblem(problem: SyncSpaceProblem): string {
  switch (problem) {
    case "empty":
      return "المفتاح فارغ.";
    case "slash":
      return "هذا يشبه رابطاً لا مفتاحاً — مفتاح المزامنة لا يحتوي على «/». الصق المفتاح السري نفسه (أو ولّد مفتاحاً قوياً)، لا عنوان الموقع ولا عنوان الـWorker.";
    case "dots":
      return "«.» و«..» غير صالحتين كمفتاح.";
    case "reserved":
      return "المفتاح لا يصحّ أن يبدأ وينتهي بـ«__» (صيغة محجوزة).";
    case "control":
      return "المفتاح يحتوي محارف غير مرئية — أعد نسخه نصاً عادياً.";
    case "tooLong":
      return `المفتاح أطول من الحدّ المسموح (${MAX_SYNC_SPACE_BYTES} بايت).`;
  }
}
