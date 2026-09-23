import type { UseStore } from "idb-keyval";

// ===== اتّصالُ IndexedDB يشفي نفسه =====
// `idb-keyval` يحفظ وعدَ الاتّصال مرّةً ويُعيده إلى الأبد، ولا يُسقطه إلّا إن
// أطلق المتصفّحُ `onclose`. وSafari/iOS يغلق الاتّصال في الخلفية (ضغطُ ذاكرة،
// تبديلُ تطبيق) **دون** أن يُطلقه أحياناً — فيبقى في الذاكرة اتّصالٌ ميت، وكلُّ
// `db.transaction` بعده يرمي `InvalidStateError` («The database connection is
// closing») حتى تُعاد الصفحة. وإعادةُ المحاولة على الاتّصال نفسه لا تُصلح شيئاً.
// هذا ما أظهر للمالك «حُفظت المراجعة محلياً مؤقتاً (InvalidStateError)» عند
// اعتماد رسالة بنك.
//
// والعلاج: عند هذا الخطأ تحديداً أسقِط الاتّصال المحفوظ، وافتح غيرَه، وأعِد
// العمليةَ **مرّةً واحدة**. الاسمان هما افتراضيُّ `idb-keyval` نفسُه، فالبياناتُ
// هي هي بلا هجرة.

const DB_NAME = "keyval-store";
const STORE_NAME = "keyval";

function promisifyRequest<T>(request: IDBRequest<T> | IDBTransaction): Promise<T> {
  return new Promise((resolve, reject) => {
    // @ts-expect-error — IDBTransaction has oncomplete, IDBRequest has onsuccess.
    request.oncomplete = request.onsuccess = () => resolve((request as IDBRequest<T>).result);
    // @ts-expect-error — same union as above.
    request.onabort = request.onerror = () => reject((request as IDBRequest<T>).error);
  });
}

/** اتّصالٌ ميت لا يُصلحه إلّا فتحُ غيره. */
export function isStaleConnectionError(error: unknown): boolean {
  return typeof error === "object" && error !== null
    && (error as { name?: unknown }).name === "InvalidStateError";
}

export function createResilientStore(dbName = DB_NAME, storeName = STORE_NAME): UseStore {
  let dbp: Promise<IDBDatabase> | undefined;

  const getDB = (): Promise<IDBDatabase> => {
    if (dbp) return dbp;
    const request = indexedDB.open(dbName);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    const opening = promisifyRequest<IDBDatabase>(request);
    dbp = opening;
    opening.then((db) => {
      const drop = () => { if (dbp === opening) dbp = undefined; };
      db.onclose = drop;
      // تبويبٌ آخر يرفع الإصدار: أغلِق هذا كي لا نحجبه، وافتح غيرَه عند الحاجة.
      db.onversionchange = () => { drop(); db.close(); };
    }, () => { if (dbp === opening) dbp = undefined; });
    return opening;
  };

  const reset = async (stale: Promise<IDBDatabase>) => {
    if (dbp === stale) dbp = undefined;
    try { (await stale).close(); } catch { /* already closed */ }
  };

  const run = async <T>(txMode: IDBTransactionMode, callback: (store: IDBObjectStore) => T | PromiseLike<T>) => {
    const current = getDB();
    try {
      const db = await current;
      return await callback(db.transaction(storeName, txMode).objectStore(storeName));
    } catch (error) {
      if (!isStaleConnectionError(error)) throw error;
      await reset(current);
      throw error;
    }
  };

  return (txMode, callback) => run(txMode, callback).catch((error) => {
    if (!isStaleConnectionError(error)) throw error;
    return run(txMode, callback);
  });
}

/** المخزنُ الوحيد لكلّ استعمالات `idb-keyval` في التطبيق — مرِّره وسيطاً ثانياً
 *  لـ`get`/`set`/`del` بدل المخزن الافتراضيّ الذي لا يشفى. */
let shared: UseStore | undefined;
export const keyvalStore: UseStore = (txMode, callback) => {
  shared ??= createResilientStore();
  return shared(txMode, callback);
};
