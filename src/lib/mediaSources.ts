// مصادر وسائط المذكرة **بترتيبها الأصلي**، سواءٌ حضرت بايتاتها أم بقيت مرجعَ هاش.
//
// بعد أن صار الترطيب محكوماً بميزانية (`HYDRATE_MAX_BYTES` في `sync.ts`)، صارت
// المذكرة الواحدة قد تحمل الشكلين معاً: `photos` بايتاتٍ لِما دخل الميزانية،
// و`photoRefs` هاشاتٍ لِما تجاوزها. والعرض كان يقرأ `entryPhotos()` وحدها فلا
// يرى المراجع — فتختفي صورةٌ بايتاتها سليمة في مخزن الهاش المحليّ.
//
// **الترتيب هو المسألة الدقيقة هنا**: `sync.ts#hydrateCloudPhotos` يضع في
// `photos` ما تحلّل **بترتيب المراجع**، وفي `photoRefs` ما بقي بنفس الترتيب،
// ويحفظ الترتيب الكامل الأصليّ في `photoOrder`. فالمشي على `photoOrder` يكفي
// لإعادة التركيب بلا حسابِ هاشٍ ولا تخمين: كل هاشٍ فيه إمّا موجودٌ في
// `photoRefs` (فهو مرجعٌ لم يُرطَّب) وإلّا فهو التالي في `photos` — لأنّ
// `photos` هي بالضبط «ما ليس في `photoRefs`»، بنفس التسلسل.
//
// نقيّة: بلا `window` ولا DOM ولا IndexedDB — القراءة الفعلية في
// `mediaCache.ts`. (راجع docs/APP-STORE-PLAN.md.)

import type { JournalEntry } from "./types";
import { entryPhotos, entryAudios } from "./utils";

/** نوع الوسيط في مخزن R2 — يلزم لجلب مرجعٍ بايتاته ليست على الجهاز بعد. */
export type MediaKindTag = "photos" | "audios";

/** بايتاتٌ حاضرة للعرض فوراً (`data:`/`blob:`/رابط)، أو هاشٌ يُقرأ من المخزن. */
export type MediaSource =
  | { inline: string; hash?: undefined; kind?: undefined }
  | { hash: string; kind: MediaKindTag; inline?: undefined };

/** الحقول المحلية فقط التي يضيفها الترطيب الجزئي (لا تُكتب للسحابة أبداً). */
type PartialHydrateFields = {
  photoRefs?: string[];
  audioRefs?: string[];
  photoOrder?: string[];
  audioOrder?: string[];
};

function combine(
  inline: string[],
  refs: string[],
  order: string[] | undefined,
  kind: MediaKindTag
): MediaSource[] {
  if (!refs.length) return inline.map((src) => ({ inline: src }));
  // بلا ترتيبٍ محفوظ (مذكرةٌ من السحابة لم تُرطَّب بعد): المراجع أولاً ثم أيّ
  // بايتاتٍ محلية لا يغطّيها مرجع.
  if (!order?.length) {
    return [...refs.map((hash) => ({ hash, kind })), ...inline.map((src) => ({ inline: src }))];
  }
  const pending = new Set(refs);
  const rest = [...inline];
  const out: MediaSource[] = [];
  for (const hash of order) {
    if (pending.has(hash)) {
      out.push({ hash, kind });
      continue;
    }
    const src = rest.shift();
    if (src !== undefined) out.push({ inline: src });
  }
  // بايتاتٌ محلية زائدة عن الترتيب (صورةٌ أُضيفت على هذا الجهاز ولم تُرفع بعد،
  // وهي ما يُبقيه `keepUncovered` في الترطيب) — تلحق في آخر القائمة كما كانت.
  for (const src of rest) out.push({ inline: src });
  return out;
}

export function entryPhotoSources(e: JournalEntry): MediaSource[] {
  const x = e as JournalEntry & PartialHydrateFields;
  return combine(entryPhotos(e), x.photoRefs ?? [], x.photoOrder, "photos");
}

export function entryAudioSources(e: JournalEntry): MediaSource[] {
  const x = e as JournalEntry & PartialHydrateFields;
  return combine(entryAudios(e), x.audioRefs ?? [], x.audioOrder, "audios");
}

/** هل للمذكرة صورة؟ — بلا قراءة بايتاتٍ إطلاقاً. تستعمله القوائم الطويلة
 *  (سماء الذكريات) حيث السؤال عن الوجود لا عن الصورة نفسها. */
export const hasPhoto = (e: JournalEntry): boolean => entryPhotoSources(e).length > 0;
export const hasAudio = (e: JournalEntry): boolean => entryAudioSources(e).length > 0;
