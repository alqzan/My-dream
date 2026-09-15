import { get, set, del } from "idb-keyval";
import type { StateStorage, PersistStorage, StorageValue } from "zustand/middleware";
import { createDeferredStorage, createDeferredWriter } from "./persistScheduler";

// IndexedDB-backed storage for the persisted store. localStorage caps at
// ~5MB and overflows once there are many journal entries + daily photos
// ("The quota has been exceeded"); IndexedDB allows hundreds of MB.
export const idbStorage: StateStorage = {
  getItem: async (name) => {
    const value = await get<string>(name);
    if (value != null) return value;
    // One-time migration: if nothing in IDB yet, pull any legacy value that
    // was previously saved in localStorage so existing data isn't lost.
    if (typeof window !== "undefined") {
      const legacy = window.localStorage.getItem(name);
      if (legacy != null) {
        await set(name, legacy);
        try { window.localStorage.removeItem(name); } catch { /* ignore */ }
        return legacy;
      }
    }
    return null;
  },
  setItem: async (name, value) => {
    await set(name, value);
  },
  removeItem: async (name) => {
    await del(name);
  },
};

// ما يستعمله المتجر فعلاً: نفس التخزين وقد أُجّلت كتابتُه فتُجمع رشقةُ
// التعديلات في كتابةٍ واحدة (السبب والقياس في `persistScheduler.ts`).
//
// **ويُؤجَّل التسلسلُ معها لا الكتابةُ وحدها (٠٫١٫٤٢٧).** كان الغلافُ يجلس تحت
// `createJSONStorage`، فيصله **نصٌّ مُسلسَلٌ سلفاً**: أي أنّ
// `JSON.stringify(المتجر)` يقع عند **كلّ** `set()` ولا يؤجَّل. وبقياس
// `persistScheduler.ts` نفسِه ذلك ٥١ من ١٥٣ م.ث — فالتأجيلُ أزال ١٠٢ وترك ٥١.
// وهي تقع كلَّ ٧٠٠ م.ث أثناء الكتابة في محرّر المذكرات (حفظُه التلقائي)، على
// كتلةٍ تحمل صورَ المذكرات `data:` base64.
//
// فصار الطابور يحمل **الكائن** ويُسلسَل مرّةً واحدة داخل الإفراغ. والشكلُ
// المكتوب هو هو (`{state, version}`) فما على القرص اليوم يُقرأ بلا هجرة.
export const persistedIdbStorage = createDeferredStorage(idbStorage);

// كاتبٌ **واحد** يحمل الكائن ويُسلسله داخل الإفراغ. يُقرأ بنوعٍ مخصّص لكلّ
// متصل عبر `persistJSONStorage<S>()` — و`idbStorage.ts` لا يستطيع استيراد
// `AppStore` (دَوْرٌ في الاستيراد: المتجر يستورد هذا الملف).
const jsonWriter = createDeferredWriter<StorageValue<unknown>>(idbStorage, {
  serialize: (v) => JSON.stringify(v),
  deserialize: (raw) => JSON.parse(raw) as StorageValue<unknown>,
});

const jsonStorage: PersistStorage<unknown> = {
  getItem: async (name) => {
    try {
      return await jsonWriter.getItem(name);
    } catch {
      // كتلةٌ لا تُحلَّل: `persist` يعامل `null` معاملةَ أوّلِ إقلاع، وهو أسلمُ
      // من رميةٍ تُسقط الترطيب كلَّه.
      return null;
    }
  },
  setItem: (name, value) => jsonWriter.setItem(name, value),
  removeItem: (name) => jsonWriter.removeItem(name),
};

/** `PersistStorage` لـzustand يؤجّل **التسلسل** مع الكتابة. بديلُ
 *  `createJSONStorage(() => persistedIdbStorage)`، ويكتب البايتات نفسَها
 *  (`{state, version}`) فما على القرص اليوم يُقرأ بلا هجرة.
 *
 *  التحويلُ هنا وحدَه: الكاتبُ مشتركٌ ومحايدُ النوع، وكلُّ متصلٍ يراه بنوع
 *  حالته. لا مسارَ يكتب نوعاً ويقرأ آخر — المتجر متصلٌ واحد. */
export function persistJSONStorage<S>(): PersistStorage<S> {
  return jsonStorage as PersistStorage<S>;
}

/** أفرِغ **كلّ** ما هو معلّق: الغلافُ النصّيّ القديم والكائنيّ الجديد معاً. */
export async function flushPersisted(): Promise<void> {
  await Promise.all([
    persistedIdbStorage.flush().catch(() => {}),
    jsonWriter.flush().catch(() => {}),
  ]);
}

// **الشرط الذي يجعل التأجيل آمناً**: أفرِغ ما هو معلّق قبل أن تختفي الصفحة.
// بدونه يضيع آخر تعديلٍ سُجّل قبل الإغلاق بلحظة.
//
// `visibilitychange` (إلى hidden) هي الإشارة المعوّل عليها: على iOS لا يُطلق
// `beforeunload` أصلاً عند إغلاق التبويب أو تبديل التطبيق. و`pagehide` معها
// لأنّ الأولى قد لا تقع في استعادةٍ من bfcache. الاثنتان تقعان معاً في
// الانتقال الواحد — و`flush` خاملةٌ إن لم يكن ثمّ شيء، فهما إفراغٌ واحد لا اثنان.
//
// يُوصَل هنا لا في `persistScheduler.ts`: تلك نقيّةٌ بلا DOM لتعبر إلى الغلاف
// الأصليّ ولتُختبر بمؤقّتاتٍ وهمية. وهذا الملفّ هو واجهةُ التخزين القابلة
// للاستبدال أصلاً (راجع `docs/APP-STORE-PLAN.md`) — فمكانُ الوصل هنا.
if (typeof window !== "undefined") {
  // `flush` keeps a failed batch queued and retries it internally; suppress
  // the rejected promise here because lifecycle events have no caller waiting.
  const flush = () => { void flushPersisted(); };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}
