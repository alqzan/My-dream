// ===================== تأجيلُ الكتابة إلى التخزين المحلّي =====================
// وسيطُ `persist` في zustand يُسلسل الحالة **كاملةً** ويكتبها عند كلّ تغيير. مع
// بيانات سنواتٍ من الاستعمال قِيس ذلك على متصفّحٍ حقيقيّ بخنق معالجٍ ٤×
// (يقارب جوّالاً متوسّط الفئة):
//
//     الكتلة المحفوظة           = 1.3 م.ب
//     JSON.stringify(المتجر)   =  51ms   ← عند كلّ تعديل
//     كتابةُ الكتلة إلى IndexedDB = 102ms   ← عند كلّ تعديل
//                                 ──────
//                                 ~153ms من الخيط الرئيسيّ لكلّ نقرة
//
// وهذا موجعٌ تحديداً في محرّر المذكرات: `JournalForm` يحفظ في المتجر كلّ 700ms
// أثناء الكتابة، فتقع هذه الـ153ms **مرّةً كلّ 700ms طوال الكتابة**. ومضخّم
// الأثر أنّ صور المذكرات تُحفظ محلّياً `data:` base64، فالكتلة أكبر بكثير.
//
// الحلّ: اجمع الكتابات في واحدة. الكتلة **لقطةٌ كاملة** لا فرقاً تراكمياً، فآخرُ
// قيمةٍ تُغني عن كلّ ما قبلها — «آخر الكاتبين يفوز» هو السلوك الصحيح هنا لا
// تنازلاً عن شيء.
//
// **ما الذي نخسره؟** نافذةُ فقدٍ تتّسع من ~0 إلى `delayMs` عند إغلاقٍ مفاجئ.
// لذلك `flush()` عند إخفاء الصفحة **غيرُ قابلةٍ للتفاوض** (تُوصَل في
// `idbStorage.ts`)، والمهلة قصيرةٌ عمداً. ويبقى خلفها خطُّ دفاعٍ ثانٍ: المزامنة
// السحابية ترفع اللقطة أيضاً.
//
// الوحدة **نقيّة**: `setTimeout` وحده — لا DOM ولا IndexedDB ولا متجر. فتُختبر
// بمؤقّتاتٍ وهمية وتعبر إلى الغلاف الأصليّ كما هي (راجع `docs/APP-STORE-PLAN.md`).
// وهي أختُ `saveScheduler.ts` التي تفعل الشيء نفسه للسحابة — وأخطاؤها الثلاثة
// المذكورة هناك متجنَّبةٌ هنا بالبناء نفسه: المؤقّت يُصفَّر قبل تنفيذ ما عليه،
// و`flush` خاملةٌ إن لم يكن ثمّ شيء (فإخفاءان يُنتجان إفراغاً واحداً)، ولا
// كتابتان متوازيتان.
import type { StateStorage } from "zustand/middleware";

/** ما تنتظره الكتابة قبل أن تنزل إلى القرص (تجمع رشقةَ تعديلاتٍ في واحدة). */
export const PERSIST_DEBOUNCE_MS = 1200;

export interface DeferredStorage extends StateStorage {
  /** اكتب ما هو معلّق **الآن**. خاملةٌ إن لم يكن ثمّ شيء. */
  flush(): Promise<void>;
  /** هل ثمّ كتابةٌ معلّقةٌ أو جارية؟ (للاختبار وللتفكيك.) */
  pending(): boolean;
  /** أوقِف المؤقّت المعلّق — بعد كتابة ما عليه. */
  dispose(): Promise<void>;
}

/** الطابورُ نفسُه على أيّ نوعِ قيمة. `T = string` هو الغلافُ القديم بلا تغيير،
 *  و`T = StorageValue<S>` هو ما يُؤجّل **التسلسل** نفسَه — انظر
 *  `createDeferredJSONStorage` في `idbStorage.ts`. */
export interface DeferredWriter<T> {
  getItem(name: string): Promise<T | null>;
  setItem(name: string, value: T): Promise<void>;
  removeItem(name: string): Promise<void>;
  flush(): Promise<void>;
  pending(): boolean;
  dispose(): Promise<void>;
}

interface DeferredOptions<T> {
  delayMs?: number;
  /** يُنفَّذ **داخل** الإفراغ لا عند الجدولة — وهذا كلُّ المكسب الجديد. */
  serialize?: (value: T) => string;
  /** لقراءةِ ما على القرص حين لا شيء معلّق. */
  deserialize?: (raw: string) => T;
}

export function createDeferredStorage(
  inner: StateStorage,
  opts: { delayMs?: number } = {}
): DeferredStorage {
  const w = createDeferredWriter<string>(inner, opts);
  return {
    getItem: (name) => w.getItem(name),
    setItem: (name, value) => w.setItem(name, value),
    removeItem: (name) => w.removeItem(name),
    flush: () => w.flush(),
    pending: () => w.pending(),
    dispose: () => w.dispose(),
  };
}

export function createDeferredWriter<T>(
  inner: StateStorage,
  {
    delayMs = PERSIST_DEBOUNCE_MS,
    serialize = (v: T) => v as unknown as string,
    deserialize = (raw: string) => raw as unknown as T,
  }: DeferredOptions<T> = {}
): DeferredWriter<T> {
  // آخرُ قيمةٍ لكلّ مفتاح. `Map` لا قيمةٌ مفردة: `persist` يكتب مفتاحاً واحداً
  // اليوم، لكنّ الغلاف عامٌّ ولا يصحّ أن يخلط مفتاحين لو أُضيف ثانٍ.
  const queued = new Map<string, T>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing = false;
  // Keep the active drain promise so a strict flush called while an IndexedDB
  // write is in flight waits for that write (and for any queued follow-up)
  // instead of observing only the currently empty queue.
  let activeDrain: Promise<void> | null = null;
  let disposed = false;

  const clear = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };

  const retryAfterFailure = () => {
    // A failed IndexedDB write must remain observable as pending work. Retry
    // later instead of silently dropping the batch that drain already lifted.
    if (!disposed && queued.size && timer === null) {
      timer = setTimeout(() => {
        timer = null;
        startDrain();
      }, delayMs);
    }
  };

  function drain(): Promise<void> {
    // A concurrent caller joins the same promise. This is the critical
    // difference between a lifecycle flush and a best-effort timer callback:
    // the caller must wait for an already-started write to settle.
    if (activeDrain) return activeDrain;
    // A stale timer can fire after a concurrent drain has already consumed the
    // queue. Do not install an already-resolved promise as the next active
    // drain; future writes must be able to create a fresh one.
    if (!queued.size) return Promise.resolve();
    const run = (async () => {
      writing = true;
      try {
        while (queued.size) {
          // نلتقط الدفعة ونُفرغ الطابور **قبل** الانتظار: تعديلٌ يقع أثناء
          // الكتابة يدخل طابوراً نظيفاً فلا تبتلعه هذه الجولة صامتاً.
          const batch = [...queued.entries()];
          queued.clear();
          try {
            for (const [name, value] of batch) {
              // **التسلسلُ هنا لا عند الجدولة**: رشقةُ عشرِ تعديلاتٍ تُسلسَل مرّةً
              // لا عشراً. هذا نصفُ الكلفة الذي بقي بعد تأجيل الكتابة.
              await inner.setItem(name, serialize(value));
            }
          } catch (error) {
            // Requeue the failed snapshot. If a newer value for the same key was
            // queued while the write was in flight, keep that newer value instead.
            for (const [name, value] of batch) {
              if (!queued.has(name)) queued.set(name, value);
            }
            throw error;
          }
        }
      } finally {
        writing = false;
      }
    })();
    activeDrain = run;
    const clearActive = () => {
      if (activeDrain === run) activeDrain = null;
    };
    // Attach a rejection handler to the cleanup branch so timer-driven drains
    // never create an unhandled rejection; callers still receive `run` itself.
    void run.then(clearActive, clearActive);
    return run;
  }

  function startDrain() {
    // Timer-driven writes have no caller waiting on their promise. Handle the
    // rejection here and retain/retry the queued snapshot instead of creating
    // an unhandled rejection.
    void drain().catch(() => retryAfterFailure());
  }

  function schedule() {
    if (disposed) return;
    clear();
    timer = setTimeout(() => {
      // يُصفَّر **قبل** التنفيذ، فلا يبقى شبحُ مؤقّتٍ يرى `flush` كتابةً معلّقةً
      // لا وجود لها (العطل الأول في saveScheduler.ts).
      timer = null;
      startDrain();
    }, delayMs);
  }

  return {
    async getItem(name) {
      // قيمةٌ معلّقةٌ لم تنزل بعد هي الأحدث — أعِدها بدل القيمة القديمة على
      // القرص، وإلا رأى قارئٌ حالةً رجعت للخلف.
      const q = queued.get(name);
      if (q != null) return q;
      const raw = await inner.getItem(name);
      return raw == null ? null : deserialize(raw);
    },

    async setItem(name, value) {
      if (disposed) { await inner.setItem(name, serialize(value)); return; }
      queued.set(name, value);
      schedule();
    },

    async removeItem(name) {
      // الحذف فوريّ: كتابةٌ معلّقةٌ لنفس المفتاح تسقط، وإلّا أعادت إحياء ما حُذف.
      queued.delete(name);
      if (!queued.size) clear();
      await inner.removeItem(name);
    },

    async flush() {
      clear();
      // Even with an empty queue, a timer-driven drain may still be writing.
      // Join it so callers deleting a source document cannot race the write.
      if (!queued.size && !activeDrain) return;
      try {
        await drain();
      } catch (error) {
        retryAfterFailure();
        throw error;
      }
    },

    pending: () => queued.size > 0 || writing || timer !== null,

    async dispose() {
      clear();
      // Mark the wrapper disposed only after the final drain succeeds. If the
      // backing store rejects, the queue stays retryable rather than being
      // stranded during teardown.
      try {
        await drain();
        disposed = true;
      } catch (error) {
        retryAfterFailure();
        throw error;
      }
    },
  };
}
