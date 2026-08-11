// قراءة بايتات الوسائط **عند العرض** من مخزن الهاش المحليّ، بسقف ذاكرةٍ صارم.
//
// لماذا: لقطة المتجر لا يجوز أن تحمل بايتات مكتبةٍ كاملة — أرشيف Day One واقعيّ
// (2113 وسيطاً ≈ 692 ميغابايت) قتل تبويب المتصفح على كل إقلاع حين حُشرت كلها
// فيها. البايتات تعيش في IndexedDB مفتاحاً لكل هاش (`madar-media:<hash>`،
// يكتبها `sync.ts#localMediaPut`)، وهذه الوحدة تقرأ منها **ما يُرسَم الآن فقط**.
//
// **السقف هو جوهر الأمر**: مخبّأٌ في الذاكرة بلا حدٍّ يعيد إنتاج العطل نفسه
// بالضبط بعد بضع لفّات تمرير. فالمخبّأ هنا محدودٌ بالبايتات مع إخراج الأقدم
// استعمالاً (LRU) — `Map` في JS يحفظ ترتيب الإدراج، وإعادةُ الإدراج عند كل
// قراءة تنقل العنصر إلى المؤخّرة، فأوّل مفتاحٍ فيه هو الأقدم استعمالاً.
//
// الواجهة متزامنة عمداً (`peek` + `request`) لا `Promise`: العرض يقع داخل
// حلقاتٍ و`.map` حيث لا تجوز الخطّافات (hooks). فالمكوّن يشترك مرّةً واحدة في
// أعلاه (`useMediaCacheVersion`)، ثم يسأل المخبّأ متزامناً أينما شاء.
//
// طبقة منصّة (IndexedDB) خلف واجهةٍ قابلة للاستبدال — راجع docs/APP-STORE-PLAN.md.

import { get as idbGet } from "idb-keyval";
import type { MediaKindTag } from "./mediaSources";

/** المصدر الوحيد لبادئة مفاتيح الوسائط — يستوردها `sync.ts` أيضاً فلا تتفرّق. */
export const MEDIA_CACHE_PREFIX = "madar-media:";

// 32 ميغابايت: يكفي شاشاتٍ عدّة من الصور ويبقى جزءاً صغيراً من ميزانية تبويب
// الجوال. الرقم سقفُ أمانٍ لا هدفَ أداء — تجاوزه يعني إخراجاً لا تعطّلاً.
const MEM_BUDGET_BYTES = 32 * 1024 * 1024;

const mem = new Map<string, string>();
let memBytes = 0;
const inflight = new Set<string>();
const missing = new Set<string>(); // هاشاتٌ ليست في المخزن — لا نعيد سؤالها كل رسم
const listeners = new Set<() => void>();
let version = 0;

// جالبٌ احتياطيّ من R2 حين لا تكون بايتات المرجع على الجهاز بعد (جهازٌ جديد،
// أو وسيطٌ تجاوز ميزانية الترطيب فلم يُنزَّل). يُحقن من `SyncProvider` — هو
// وحده يملك معرّف المساحة ومفتاح الوسائط، وهذه الوحدة تبقى بلا Firebase (ولا
// دورةَ استيرادٍ مع `sync.ts`). غيابه يعني «محلياً فقط»، وهو سلوكٌ صالح.
type RemoteMediaFetcher = (hash: string, kind: MediaKindTag) => Promise<string | null>;
let remoteFetcher: RemoteMediaFetcher | null = null;

export function setRemoteMediaFetcher(fn: RemoteMediaFetcher | null): void {
  remoteFetcher = fn;
  // مرجعٌ سبق أن فشل محلياً قد ينجح الآن عبر الشبكة — نمسح «الغائب» فيُعاد
  // سؤاله مرّةً واحدة عند الرسم التالي.
  if (fn) {
    missing.clear();
    notify();
  }
}

function notify(): void {
  version++;
  for (const cb of listeners) cb();
}

function evictTo(budget: number): void {
  for (const [hash, value] of mem) {
    if (memBytes <= budget) return;
    mem.delete(hash);
    memBytes -= value.length;
  }
}

/** البايتات إن كانت في الذاكرة الآن — متزامنة، بلا أثرٍ جانبي غير تحديث LRU. */
export function peekMedia(hash: string): string | null {
  const hit = mem.get(hash);
  if (hit === undefined) return null;
  // إعادة الإدراج = «استُعمل للتوّ»، فينجو من الإخراج التالي.
  mem.delete(hash);
  mem.set(hash, hit);
  return hit;
}

/** يبدأ قراءة الهاش من المخزن إن لم يكن حاضراً. خاملٌ إن كان حاضراً أو جارياً
 *  أو ثبت غيابه — فمناداتُه في كل رسم آمنة. */
export function requestMedia(hash: string, kind: MediaKindTag): void {
  if (mem.has(hash) || inflight.has(hash) || missing.has(hash)) return;
  inflight.add(hash);
  void (async () => {
    try {
      let value = await idbGet(MEDIA_CACHE_PREFIX + hash);
      // ليست على الجهاز → جرّب R2 مرّةً. الجالب يكتبها في المخزن بنفسه، فلا
      // تتكرّر الرحلة أبداً بعد أول نجاح.
      if (typeof value !== "string" || !value) {
        value = remoteFetcher ? await remoteFetcher(hash, kind) : null;
      }
      if (typeof value === "string" && value) {
        // وسيطٌ أكبر من الميزانية وحده: يُعاد كما هو دون أن يُخزَّن، وإلّا أخرج
        // المخبّأَ كلَّه ليخزّن نفسه ثم يخرج هو أيضاً في الطلب التالي.
        if (value.length <= MEM_BUDGET_BYTES) {
          mem.set(hash, value);
          memBytes += value.length;
          evictTo(MEM_BUDGET_BYTES);
        }
        notify();
      } else {
        missing.add(hash);
      }
    } catch {
      missing.add(hash); // المخزن غير متاح — لا نعيد المحاولة كل رسم
    } finally {
      inflight.delete(hash);
    }
  })();
}

export function subscribeMedia(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const mediaCacheVersion = (): number => version;

/** للاختبارات وحدها. */
export function __resetMediaCache(): void {
  remoteFetcher = null;
  mem.clear();
  memBytes = 0;
  inflight.clear();
  missing.clear();
  version = 0;
}

export const __memBytes = (): number => memBytes;
