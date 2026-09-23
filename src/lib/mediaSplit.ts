// ===== الوسائطُ خارج كتلة المتجر =====
// صورُ المذكرات وتسجيلاتُها تعيش في الحالة نصوصَ `data:` base64، وكانت تُكتب
// **داخل** كتلة المتجر الواحدة. فكلُّ تعديلٍ صغير — اعتمادُ رسالة بنك، تسجيلُ
// صلاة — كان يُسلسل ويكتب عشرات الميغابايتات دفعةً: WebKit يرفضها بـ`UnknownError`،
// ونسخةُ localStorage الاحتياطية لا تتّسع لها (سقفها ٢ م.ب)، وذروةُ الذاكرة
// أثناء التسلسل تكفي ليقتل iOS الصفحة («حدثت مشكلة بشكل متكرر»).
//
// الحلّ في طبقة التخزين وحدها: عند التسلسل يُستبدل كلُّ نصٍّ `data:` كبير بمرجعٍ
// قصير، ويُكتب النصُّ مرّةً واحدة في مفتاحٍ خاصّ به **قبل** الكتلة. وعند القراءة
// تُعاد المراجعُ نصوصاً. فالحالةُ في الذاكرة لم تتغيّر، ولا المزامنةُ ولا
// النسخُ الاحتياطية — ما تغيّر هو شكلُ ما على القرص وحده. وكتلةٌ قديمة بنصوصٍ
// مضمّنة تُقرأ كما هي، وتنقسم عند أوّل كتابة.
//
// نقيٌّ بلا DOM: التخزينُ يُمرَّر (`MediaKV`).

export const MEDIA_KEY_PREFIX = "madar-media:";
export const MEDIA_PLACEHOLDER = "madar-idb-media:";
/** دون هذا الطول لا يستحقّ النصُّ مفتاحاً مستقلاً. */
export const MEDIA_MIN_CHARS = 4096;

export interface MediaKV {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

/** مفتاحٌ من المحتوى: طولٌ وبصمتان مستقلّتان بـ٣٢ بتاً — تصادمٌ يحتاج الثلاثة معاً. */
export function mediaContentKey(value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9747b28c;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
    h2 ^= h2 >>> 15;
  }
  return `${value.length.toString(36)}-${(h1 >>> 0).toString(36)}-${(h2 >>> 0).toString(36)}`;
}

const isSplittable = (value: unknown): value is string =>
  typeof value === "string" && value.length >= MEDIA_MIN_CHARS && value.startsWith("data:");

export function createMediaSplitter(kv: MediaKV) {
  // النصُّ → مفتاحُه، من آخر تسلسل فقط (فلا يُبقي حيّاً ما حُذف من الحالة).
  let keys = new Map<string, string>();
  const persisted = new Set<string>();
  let pending = new Map<string, string>();

  return {
    /** `JSON.stringify` بمراجع بدل الوسائط، ويُجهّز ما لم يُكتب بعد. */
    serialize(value: unknown): string {
      const seen = new Map<string, string>();
      const next = new Map<string, string>();
      const json = JSON.stringify(value, (_k, v: unknown) => {
        if (!isSplittable(v)) return v;
        const key = keys.get(v) ?? seen.get(v) ?? mediaContentKey(v);
        seen.set(v, key);
        if (!persisted.has(key)) next.set(key, v);
        return MEDIA_PLACEHOLDER + key;
      });
      keys = seen;
      pending = next;
      return json;
    },

    /** اكتب الوسائط الجديدة. يُنادى **قبل** كتابة الكتلة التي تشير إليها. */
    async writePending(): Promise<void> {
      for (const [key, v] of [...pending]) {
        await kv.set(MEDIA_KEY_PREFIX + key, v);
        persisted.add(key);
        pending.delete(key);
      }
    },

    /** أعِد المراجعَ نصوصاً. لا يرمي: مرجعٌ لم يُقرأ يبقى كما هو فيُكتب كما هو —
     *  لا يُمحى وسيطٌ من الحالة لأنّ قراءةً واحدة فشلت. */
    async restore<T>(value: T): Promise<T> {
      const found = new Set<string>();
      const collect = (node: unknown) => {
        if (typeof node === "string") {
          if (node.startsWith(MEDIA_PLACEHOLDER)) found.add(node.slice(MEDIA_PLACEHOLDER.length));
        } else if (Array.isArray(node)) node.forEach(collect);
        else if (node && typeof node === "object") Object.values(node).forEach(collect);
      };
      collect(value);
      if (!found.size) return value;

      const loaded = new Map<string, string>();
      await Promise.all([...found].map(async (key) => {
        try {
          const v = await kv.get(MEDIA_KEY_PREFIX + key);
          if (typeof v === "string") loaded.set(key, v);
        } catch { /* keep the reference */ }
      }));

      const restored = new Map<string, string>();
      const swap = (node: unknown): unknown => {
        if (typeof node === "string") {
          if (!node.startsWith(MEDIA_PLACEHOLDER)) return node;
          const key = node.slice(MEDIA_PLACEHOLDER.length);
          const v = loaded.get(key);
          if (v === undefined) return node;
          restored.set(v, key);
          return v;
        }
        if (Array.isArray(node)) {
          for (let i = 0; i < node.length; i += 1) node[i] = swap(node[i]);
          return node;
        }
        if (node && typeof node === "object") {
          const obj = node as Record<string, unknown>;
          for (const k of Object.keys(obj)) obj[k] = swap(obj[k]);
        }
        return node;
      };
      const out = swap(value) as T;
      for (const [v, key] of restored) { keys.set(v, key); persisted.add(key); }
      return out;
    },
  };
}
