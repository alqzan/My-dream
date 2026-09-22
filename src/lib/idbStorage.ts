import { get, set, del } from "idb-keyval";
import type { StateStorage, PersistStorage, StorageValue } from "zustand/middleware";
import { createDeferredStorage, createDeferredWriter } from "./persistScheduler";
import { beginBoot, markBootPhase, recordStoreBytes, storeKeyFor } from "./platform/bootGuard";

// Safari/iOS can temporarily reject an IndexedDB transaction (private mode,
// storage pressure, or a connection being evicted) even though the origin's
// small localStorage area is still writable. Keep a compact recovery copy only
// for that failure path; normal reads and writes remain IndexedDB-backed.
const LOCAL_FALLBACK_PREFIX = "my-dream-idb-fallback:";
function fallbackKey(name: string): string { return `${LOCAL_FALLBACK_PREFIX}${name}`; }
function localFallbackGet(name: string): string | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(fallbackKey(name)); } catch { return null; }
}
function localFallbackSet(name: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try { window.localStorage.setItem(fallbackKey(name), value); return true; } catch { return false; }
}
function localFallbackRemove(name: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(fallbackKey(name)); } catch { /* ignore */ }
}

// IndexedDB-backed storage for the persisted store. localStorage caps at
// ~5MB and overflows once there are many journal entries + daily photos
// ("The quota has been exceeded"); IndexedDB allows hundreds of MB.
// مفتاحُ المتجر الرئيس وحده يُحوَّل في الإنقاذ (`platform/bootGuard.ts`).
const MAIN_STORE = "my-dream-store";
const keyOf = (name: string): string => (name === MAIN_STORE ? storeKeyFor(name) : name);

export const idbStorage: StateStorage = {
  getItem: async (rawName) => {
    const name = keyOf(rawName);
    const fallback = localFallbackGet(name);
    if (fallback != null) return fallback;
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
  setItem: async (rawName, value) => {
    const name = keyOf(rawName);
    try {
      await set(name, value);
      localFallbackRemove(name);
    } catch (error) {
      // Keep the full serialized snapshot when the browser can still provide
      // its small synchronous store. The deferred writer will report the
      // original error only if both stores reject, so source inbox documents
      // remain protected in the genuinely unavailable case.
      if (!localFallbackSet(name, value)) throw error;
    }
  },
  removeItem: async (rawName) => {
    const name = keyOf(rawName);
    await del(name);
    localFallbackRemove(name);
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
  deserialize: (raw) => {
    // الحجمُ قبل التحليل: إن قتل النظامُ الصفحةَ هنا فهو الدليل الباقي.
    recordStoreBytes(raw.length);
    markBootPhase("store:parse");
    const value = JSON.parse(raw) as StorageValue<unknown>;
    markBootPhase("store:migrate");
    return value;
  },
});

const jsonStorage: PersistStorage<unknown> = {
  getItem: async (name) => {
    // أوّلُ ما يقع في الإقلاع — قبل أيّ بايتٍ من المتجر (`platform/bootGuard.ts`).
    beginBoot();
    markBootPhase("store:read");
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

/** Persistence barrier for flows that are about to delete their source.  The
 * lifecycle helper above intentionally swallows failures because it has no UI
 * caller; import/review must keep the remote inbox item when this barrier
 * fails so a retry cannot lose the receipt. */
export async function flushPersistedStrict(): Promise<void> {
  const flushAll = () => Promise.allSettled([persistedIdbStorage.flush(), jsonWriter.flush()]);
  const first = await flushAll();
  if (first.every((result) => result.status === "fulfilled")) return;

  // A transaction can reject while the browser is closing/reopening its IDB
  // connection. Both deferred writers retain their snapshots, so one immediate
  // retry is safe and avoids forcing the owner to press approve a second time.
  const second = await flushAll();
  const failed = second.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) throw failed.reason;
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
