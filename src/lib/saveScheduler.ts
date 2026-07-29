// ===================== جدولةُ الحفظ المؤجَّل =====================
// آلةُ حالةٍ صغيرة تحكم **متى** يُرفع التعديل المحلّي إلى السحابة. أُخرجت من
// `SyncProvider` لسببٍ واحد: كانت مؤقّتاتُها تعيش في `useRef` داخل أثرٍ لا يمسّه
// اختبار، وهي التي تقرّر ألّا يضيع تعديلٌ سُجّل قبل إقفال الشاشة بلحظة. الآن
// نقيّةٌ (لا DOM ولا Firebase ولا متجر — `setTimeout` وحده) فتُختبر بمؤقّتاتٍ
// وهمية، وتعبر إلى الغلاف الأصليّ كما هي.
//
// الأخطاء الثلاثة التي وُلدت هذه الوحدة لسدّها:
//
//   ١) **مرجعُ مؤقّتٍ لا يُصفَّر عند انطلاقه.** كان `saveTimer.current` يبقى
//      محمّلاً برقم مؤقّتٍ انتهى، فيرى `flush` «حفظاً معلّقاً» لا وجود له
//      فيحفظ من جديد — عند **كلّ** إخفاءٍ للصفحة. هنا يُصفَّر المرجع **قبل**
//      تنفيذ ما عليه، فلا يبقى شبحُ مؤقّت.
//
//   ٢) **إخفاءان يُنتجان حفظين.** `visibilitychange` و`pagehide` تقعان معاً في
//      الانتقال الواحد على iOS. `flush` هنا خاملةٌ إن لم يكن ثمّ شيءٌ معلّق،
//      وحارسُ `running` يجعل الثانية لا تُطلق حفظاً موازياً للأولى.
//
//   ٣) **حفظان متوازيان يتسابقان على `revision`.** كلّ حفظٍ يقرأ السحابة ثمّ
//      يكتب بمعاملةٍ على المراجعة؛ فحفظان معاً يعني تعارضَ مراجعةٍ مؤكّداً
//      وإعادةَ محاولةٍ لا لزوم لها. هنا حفظٌ واحد في الطريق دائماً، والتعديل
//      الذي يقع أثناءه يُرفع رايةَ `dirty` فيُحفظ بعد انتهائه — فلا يُفقد ولا
//      يُزاحم.

/** أقلُّ ما ينتظره التعديل قبل رفعه (يجمع رشقةَ تعديلاتٍ في حفظٍ واحد). */
export const SAVE_DEBOUNCE_MS = 1500;
export const RETRY_BASE_MS = 2000;
export const RETRY_MAX_MS = 30000;

export interface SaveScheduler {
  /** تعديلٌ محليّ وقع: احفظ بعد المهلة (وألغِ أيّ إعادة محاولةٍ معلّقة). */
  schedule(): void;
  /** أفرِغ ما هو معلّق **الآن** — عند إخفاء الصفحة. خاملةٌ إن لم يكن ثمّ شيء. */
  flush(): void;
  /** أوقِف كلّ مؤقّتٍ معلّق (تفكيك المكوّن). */
  dispose(): void;
  /** هل ثمّ حفظٌ معلّقٌ أو جارٍ؟ (للاختبار وللواجهة.) */
  pending(): boolean;
}

export interface SaveSchedulerOptions {
  /** الحفظ نفسه. يُرفض عند الفشل فتتولّى إعادةُ المحاولة بتباعدٍ متضاعف. */
  save: () => Promise<void>;
  /** حُفظ بنجاح (تُصفَّر عندها مهلةُ إعادة المحاولة). */
  onSuccess?: () => void;
  /** فشل الحفظ — ومعه هل بدأت إعادةُ محاولةٍ مجدولة. */
  onError?: (err: unknown) => void;
  /** بدأ حفظٌ فعليّ (لإظهار «يزامن…»). */
  onStart?: () => void;
  delayMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
}

export function createSaveScheduler({
  save,
  onSuccess,
  onError,
  onStart,
  delayMs = SAVE_DEBOUNCE_MS,
  retryBaseMs = RETRY_BASE_MS,
  retryMaxMs = RETRY_MAX_MS,
}: SaveSchedulerOptions): SaveScheduler {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = retryBaseMs;
  // حفظٌ في الطريق الآن — لا يُطلق ثانٍ بجانبه.
  let running = false;
  // تعديلٌ محليّ لم يدخل حفظاً مكتملاً بعد. يُرفع عند الجدولة ويُنزَّل عند بدء
  // الحفظ؛ فإن وقع تعديلٌ **أثناء** الحفظ رُفع من جديد فحُفظ بعده.
  let dirty = false;
  let disposed = false;

  const clearSave = () => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  };
  const clearRetry = () => {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  };

  function run() {
    if (disposed || running) return;
    running = true;
    dirty = false; // ما بعد هذه اللحظة تعديلٌ جديد يستحقّ حفظاً آخر
    onStart?.();
    save().then(
      () => {
        running = false;
        retryDelay = retryBaseMs;
        onSuccess?.();
        // تعديلٌ وقع بينما كنّا نحفظ — لم تشمله هذه الرحلة، فيُجدول له حفظ.
        if (dirty && !disposed) schedule();
      },
      (err) => {
        running = false;
        // تعديلٌ جديد يغني عن إعادة المحاولة: لقطتُه تشمل ما فشل رفعه.
        if (dirty && !disposed) { onError?.(err); schedule(); return; }
        if (!disposed) {
          clearRetry();
          retryTimer = setTimeout(() => { retryTimer = null; run(); }, retryDelay);
          retryDelay = Math.min(retryDelay * 2, retryMaxMs);
        }
        onError?.(err);
      }
    );
  }

  function schedule() {
    if (disposed) return;
    dirty = true;
    // إعادةُ محاولةٍ معلّقة تسقط: اللقطة الجديدة تشمل ما فشل رفعه.
    clearRetry();
    // حفظٌ جارٍ الآن؟ رايةُ `dirty` كفيلةٌ بحفظٍ تالٍ بعده — ولا مؤقّتَ نضيفه
    // فوقه (وإلّا انطلق مؤقّتٌ ثانٍ فوجد `running` فسقط بلا أثر).
    if (running) return;
    clearSave();
    saveTimer = setTimeout(() => { saveTimer = null; run(); }, delayMs);
  }

  function flush() {
    if (disposed) return;
    // لا شيء معلّق (ولا حفظٌ جارٍ يغطّيه) → لا تُطلق حفظاً من العدم. هذا ما
    // يجعل `visibilitychange` و`pagehide` معاً إفراغاً **واحداً**.
    if (!dirty && !saveTimer && !retryTimer) return;
    // حفظٌ جارٍ الآن يبتلع الإفراغ: `run` تنسحب أمام `running`، وتبقى رايةُ
    // `dirty` فيُجدول حفظٌ بعده. إن جُمِّد التبويب قبل أن يفرغ فالتعديل باقٍ في
    // المتجر (IndexedDB)، ويرفعه `pushLocal` عند الإقلاع التالي — يتأخّر ولا يضيع.
    clearSave();
    clearRetry();
    run();
  }

  return {
    schedule,
    flush,
    dispose() {
      disposed = true;
      clearSave();
      clearRetry();
    },
    pending: () => dirty || running || saveTimer !== null || retryTimer !== null,
  };
}
