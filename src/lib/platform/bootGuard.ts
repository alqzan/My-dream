// ===================== حارسُ حلقة الانهيار عند الإقلاع =====================
// «حدثت مشكلة بشكل متكرر» في Safari ليست خطأ JS يلتقطه `error.tsx`: هي النظامُ
// يقتل عمليّة الصفحة (ذاكرةٌ نفدت أو صفحةٌ علقت)، ثمّ يعيد تحميلها فتنهار
// ثانيةً. لا شاشةَ خطأ ولا أثر — والمالك محبوسٌ خارج بياناته.
//
// الحارس يعدّ الإقلاعات التي لم تبلغ «الاستقرار» (عشرون ثانيةً حيّة، أو خروجٌ
// طبيعيّ إلى الخلفية). انهياران متتاليان ⇒ الإقلاعُ التالي **وضعٌ آمن**: بلا
// مزامنة ولا استيراد رسائل البنك ولا مقاصة تلقائية — أثقلُ ما يعمل بعد الترطيب.
// فيفتح التطبيق، وتبقى البيانات على الجهاز كما هي، ويُعرض **آخرُ طورٍ بلغه
// الإقلاعُ المنهار** وحجمُ كتلة المتجر: دليلٌ يُصلَح عليه السبب لا تخمين.
//
// الوضعُ الآمن **لازمٌ حتى يُخرَج منه صراحةً**: لو انطفأ بعد إقلاعٍ مستقرّ لعاد
// التطبيق يعدّ انهيارين قبل كلّ حماية. والكتابةُ في `localStorage` متزامنة،
// فتنجو من قتل العمليّة — IndexedDB لا تضمن ذلك.
import { prefGet, prefSet, prefRemove } from "./prefs";

const ATTEMPTS_KEY = "madar-boot-attempts";
const PHASE_KEY = "madar-boot-phase";
const CRASH_PHASE_KEY = "madar-boot-crash-phase";
const SAFE_KEY = "madar-safe-mode";
const STORE_BYTES_KEY = "madar-boot-store-bytes";
const RESCUE_KEY = "madar-store-rescue";

/** كم إقلاعاً منهاراً متتالياً قبل الوضع الآمن. */
export const CRASH_THRESHOLD = 2;
/** كم يبقى الإقلاعُ حيّاً حتى يُعدّ مستقرّاً. */
export const STABLE_AFTER_MS = 20_000;

let started = false;
let safe = false;
let rescue = false;

/** يُنادى مرّةً في أوّل الإقلاع (قبل قراءة المتجر). متكرّرُه بلا أثر. */
export function beginBoot(): boolean {
  if (started) return safe;
  started = true;
  const unfinished = Number(prefGet(ATTEMPTS_KEY) ?? "0") || 0;
  // إقلاعٌ سابقٌ لم يستقرّ = انهار. طورُه الأخير هو الدليل.
  const crashPhase = unfinished > 0 ? prefGet(PHASE_KEY) ?? "start" : null;
  if (crashPhase) prefSet(CRASH_PHASE_KEY, crashPhase);
  if (unfinished >= CRASH_THRESHOLD) {
    // **الانهيارُ داخل قراءة المتجر نفسِها** (`store:*`) لا يعالجه الوضع الآمن:
    // هو يقرأ الكتلة نفسَها فينهار في النقطة نفسِها إلى الأبد. فهنا **إنقاذ**:
    // تُترك الكتلةُ القديمة في IndexedDB كما هي — لا تُقرأ ولا يُكتب فوقها —
    // ويعمل التطبيق على مفتاحٍ جديد تملؤه المزامنةُ من السحابة (وهي تحمل
    // مراجعَ الوسائط لا بايتاتها، فتبقى صغيرة). والمزامنةُ لذلك **تعمل** هنا.
    if (crashPhase?.startsWith("store:")) prefSet(RESCUE_KEY, "1");
    else prefSet(SAFE_KEY, "1");
  }
  safe = prefGet(SAFE_KEY) === "1";
  rescue = prefGet(RESCUE_KEY) === "1";
  prefSet(ATTEMPTS_KEY, String(unfinished + 1));
  prefSet(PHASE_KEY, "start");
  return safe;
}

export function isSafeMode(): boolean {
  return safe;
}

/** المتجرُ القديم معزولٌ لأنّ قراءتَه تُسقط الصفحة (راجع `beginBoot`). */
export function isStoreRescue(): boolean {
  return rescue;
}

/** المفتاحُ الذي يُقرأ منه المتجر ويُكتب إليه. في الإنقاذ مفتاحٌ مجاور، فتبقى
 *  الكتلةُ القديمة سليمةً لاستعادةٍ لاحقة بدل أن يُكتب فوقها. */
export function storeKeyFor(name: string): string {
  return rescue ? `${name}:rescue` : name;
}

/** يسجّل طور الإقلاع الجاري — يبقى بعد القتل فيدلّ أين وقع. */
export function markBootPhase(phase: string): void {
  if (!started) return;
  prefSet(PHASE_KEY, phase);
}

/** حجمُ كتلة المتجر المقروءة (بالحروف) — أوّلُ ما يُسأل عنه في انهيار ذاكرة. */
export function recordStoreBytes(length: number): void {
  prefSet(STORE_BYTES_KEY, String(length));
}

/** بلغ الإقلاعُ الاستقرار (أو خرج المالك طبيعياً): لا يُعدّ انهياراً. */
export function markBootStable(): void {
  if (!started) return;
  prefSet(ATTEMPTS_KEY, "0");
  prefSet(PHASE_KEY, "stable");
}

export interface BootReport {
  crashPhase: string | null;
  storeBytes: number | null;
}

export function bootReport(): BootReport {
  const bytes = Number(prefGet(STORE_BYTES_KEY));
  return {
    crashPhase: prefGet(CRASH_PHASE_KEY),
    storeBytes: Number.isFinite(bytes) && bytes > 0 ? bytes : null,
  };
}

/** خروجٌ صريح من الوضع الآمن — الإقلاعُ التالي عاديّ ويبدأ العدّ من صفر. */
export function exitSafeMode(): void {
  prefRemove(SAFE_KEY);
  prefRemove(CRASH_PHASE_KEY);
  prefSet(ATTEMPTS_KEY, "0");
}

/** خروجٌ صريح من وضع الإنقاذ — «جرّب بياناتي الأصلية مرة أخرى». الإقلاعُ
 *  التالي يقرأ المفتاحَ الأصليّ (`storeKeyFor` بلا `:rescue`) لا المفتاحَ
 *  المجاور، ويبدأ عدّ الانهيارات من صفر. **لا يحذف شيئاً**: الكتلةُ الأصلية
 *  بقيت في IndexedDB طوال الإنقاذ ولم تُقرأ ولا كُتب فوقها (راجع `beginBoot`)،
 *  فلو انهار الإقلاعُ التالي أيضاً يعود المالك إلى الإنقاذ ولم يفقد شيئاً. */
export function exitRescueMode(): void {
  prefRemove(RESCUE_KEY);
  prefRemove(CRASH_PHASE_KEY);
  prefSet(ATTEMPTS_KEY, "0");
}

/** للاختبارات وحدها. */
export function __resetBootGuardForTests(): void {
  started = false;
  safe = false;
  rescue = false;
}
