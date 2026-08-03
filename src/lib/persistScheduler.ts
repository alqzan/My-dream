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

export function createDeferredStorage(
  inner: StateStorage,
  { delayMs = PERSIST_DEBOUNCE_MS }: { delayMs?: number } = {}
): DeferredStorage {
  // آخرُ قيمةٍ لكلّ مفتاح. `Map` لا قيمةٌ مفردة: `persist` يكتب مفتاحاً واحداً
  // اليوم، لكنّ الغلاف عامٌّ ولا يصحّ أن يخلط مفتاحين لو أُضيف ثانٍ.
  const queued = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing = false;
  let disposed = false;

  const clear = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };

  async function drain(): Promise<void> {
    // كتابةٌ جاريةٌ الآن تبتلع هذه: ما يصل أثناءها يبقى في الطابور، ويُجدول له
    // مرورٌ تالٍ في ذيل هذه الكتابة.
    if (writing) return;
    writing = true;
    try {
      while (queued.size) {
        // نلتقط الدفعة ونُفرغ الطابور **قبل** الانتظار: تعديلٌ يقع أثناء
        // الكتابة يدخل طابوراً نظيفاً فلا تبتلعه هذه الجولة صامتاً.
        const batch = [...queued.entries()];
        queued.clear();
        for (const [name, value] of batch) {
          await inner.setItem(name, value);
        }
      }
    } finally {
      writing = false;
    }
  }

  function schedule() {
    if (disposed) return;
    clear();
    timer = setTimeout(() => {
      // يُصفَّر **قبل** التنفيذ، فلا يبقى شبحُ مؤقّتٍ يرى `flush` كتابةً معلّقةً
      // لا وجود لها (العطل الأول في saveScheduler.ts).
      timer = null;
      void drain();
    }, delayMs);
  }

  return {
    async getItem(name) {
      // قيمةٌ معلّقةٌ لم تنزل بعد هي الأحدث — أعِدها بدل القيمة القديمة على
      // القرص، وإلا رأى قارئٌ حالةً رجعت للخلف.
      const q = queued.get(name);
      if (q != null) return q;
      return inner.getItem(name);
    },

    async setItem(name, value) {
      if (disposed) { await inner.setItem(name, value); return; }
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
      if (!queued.size) return;
      clear();
      await drain();
    },

    pending: () => queued.size > 0 || writing || timer !== null,

    async dispose() {
      clear();
      disposed = true;
      await drain();
    },
  };
}
