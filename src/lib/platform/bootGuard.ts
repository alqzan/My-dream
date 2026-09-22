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

/** كم إقلاعاً منهاراً متتالياً قبل الوضع الآمن. */
export const CRASH_THRESHOLD = 2;
/** كم يبقى الإقلاعُ حيّاً حتى يُعدّ مستقرّاً. */
export const STABLE_AFTER_MS = 20_000;

let started = false;
let safe = false;

/** يُنادى مرّةً في أوّل الإقلاع (قبل قراءة المتجر). متكرّرُه بلا أثر. */
export function beginBoot(): boolean {
  if (started) return safe;
  started = true;
  const unfinished = Number(prefGet(ATTEMPTS_KEY) ?? "0") || 0;
  // إقلاعٌ سابقٌ لم يستقرّ = انهار. طورُه الأخير هو الدليل.
  if (unfinished > 0) prefSet(CRASH_PHASE_KEY, prefGet(PHASE_KEY) ?? "start");
  if (unfinished >= CRASH_THRESHOLD) prefSet(SAFE_KEY, "1");
  safe = prefGet(SAFE_KEY) === "1";
  prefSet(ATTEMPTS_KEY, String(unfinished + 1));
  prefSet(PHASE_KEY, "start");
  return safe;
}

export function isSafeMode(): boolean {
  return safe;
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

/** للاختبارات وحدها. */
export function __resetBootGuardForTests(): void {
  started = false;
  safe = false;
}
