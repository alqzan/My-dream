import { get, set, del } from "idb-keyval";
import type { StateStorage } from "zustand/middleware";
import { createDeferredStorage } from "./persistScheduler";

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
export const persistedIdbStorage = createDeferredStorage(idbStorage);

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
  const flush = () => { void persistedIdbStorage.flush().catch(() => {}); };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}
