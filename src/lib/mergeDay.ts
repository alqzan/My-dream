// ===================== دمج مذكرات اليوم الواحد =====================
// الأرشيف القديم فيه أيامٌ كُتب فيها أكثر من مذكرة، فيتشظّى اليوم في القائمة.
// هذا الملفّ يدمجها في مذكرةٍ واحدة **بلا فقدٍ وبلا غموض**:
//
//   • **بلا فقد**: نصُّ كلّ مذكرةٍ يبقى كما هو تحت عنوانٍ يحمل وقتها، وتُوحَّد
//     الصور والأصوات والوسوم والروابط. لا اقتطاع ولا تلخيص ولا ترتيبٌ عشوائي —
//     الترتيب زمنيّ من أوّل اليوم إلى آخره.
//   • **بلا غموض**: `mergedFrom` يسجّل لكلّ مصدرٍ معرّفَه ووقتَه وعنوانَه وطولَ
//     نصّه وعددَ وسائطه ولحظةَ الدمج. فالمذكرة المدموجة تقول عن نفسها إنّها
//     مدموجة، **وتُثبت** أنّ ما فيها هو ما كان (الأطوال والأعداد تُطابَق).
//
// الناجية هي **أبكر** مذكرات اليوم: معرّفُها هو الباقي، فما يشير إليه (معاملةٌ
// بـ`linkedJournalId` مثلاً) لا ينكسر. وتُسقَط `photoOrder`/`audioOrder` عمداً:
// هما ترتيبُ ترطيبٍ محليّ لمذكرةٍ واحدة، ولا معنى لهما بعد ضمّ مصدرين (والرفع
// في `sync.ts` يُسقطهما أصلاً ويعيد بناء المراجع).
//
// نقيّ: بلا React ولا DOM ولا IndexedDB (راجع docs/APP-STORE-PLAN.md).

import type { JournalEntry, MergedSource } from "./types";
import { entryPhotos, entryAudios } from "./utils";

/** «09:30» → 570 دقيقة؛ وما لا وقت له يقع في ذيل اليوم لا في صدره. */
function minutesOf(e: JournalEntry): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(e.time ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60 + 1;
}

/** ترتيبٌ زمنيّ تصاعديّ ثابت (المتساويان يبقيان بترتيب المصدر). */
export function chronological(entries: JournalEntry[]): JournalEntry[] {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => minutesOf(a.e) - minutesOf(b.e) || a.i - b.i)
    .map((x) => x.e);
}

/** عنوان القسم الواحد داخل النصّ المدموج: «### 07:10 · صباحٌ بارد». */
export function sectionHeading(e: JournalEntry): string {
  const parts = [e.time?.trim(), e.title?.trim()].filter(Boolean);
  return `### ${parts.length ? parts.join(" · ") : "بلا وقت"}`;
}

/** سجلّ مصدرٍ واحد — ما يُثبت لاحقاً أنّ نصّه ووسائطه وصلت كاملة. */
function sourceRecord(e: JournalEntry, mergedAt: number): MergedSource {
  return {
    id: e.id,
    time: e.time,
    title: e.title,
    chars: (e.content ?? "").length,
    photos: entryPhotos(e).length + (e.photoRefs?.length ?? 0),
    audios: entryAudios(e).length + (e.audioRefs?.length ?? 0),
    dayOneUUID: e.dayOneUUID,
    mergedAt,
  };
}

/** ضمُّ قوائمَ نصّية مع إسقاط المكرّر والحفاظ على أوّل ظهور. */
function unite(lists: (string[] | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists ?? []) {
    for (const item of list ?? []) {
      if (seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function concat<T>(lists: (T[] | undefined)[]): T[] | undefined {
  const out = lists.flatMap((l) => l ?? []);
  return out.length ? out : undefined;
}

/** الحقول المحلية التي يضيفها الترطيب الجزئي — تُسقَط بعد الدمج (انظر أعلاه). */
type OrderFields = { photoOrder?: string[]; audioOrder?: string[] };

/**
 * يدمج مذكراتِ **يومٍ واحد** في مذكرةٍ واحدة تحمل معرّف أبكرها.
 * يُرجع `null` إن كانت أقلّ من اثنتين أو لم تتّفق تواريخها — الدمج عبر يومين
 * ليس دمجاً بل ضياعُ تاريخ.
 */
export function mergeDayEntries(entries: JournalEntry[], now = Date.now()): JournalEntry | null {
  if (entries.length < 2) return null;
  const date = entries[0].date;
  if (entries.some((e) => e.date !== date)) return null;

  const ordered = chronological(entries);
  const survivor = ordered[0];

  const content = ordered
    .map((e) => `${sectionHeading(e)}\n${(e.content ?? "").trim()}`)
    .join("\n\n")
    .trim();

  // مصدرٌ سبق دمجُه يُفرَد إلى سجلّاته لا يُعشَّش: «مدموجة من مدموجة» تُخفي
  // الأصول بدل أن تُظهرها — وهي بالضبط الغموض الذي نتجنّبه.
  const mergedFrom: MergedSource[] = ordered.flatMap((e) =>
    e.mergedFrom?.length ? e.mergedFrom : [sourceRecord(e, now)]
  );

  const first = <K extends keyof JournalEntry>(key: K): JournalEntry[K] | undefined =>
    ordered.find((e) => e[key] !== undefined && e[key] !== "")?.[key];

  const merged: JournalEntry & OrderFields = {
    ...survivor,
    content,
    mergedFrom,
    title: first("title") as string | undefined,
    question: first("question") as string | undefined,
    // آخرُ شعورٍ سُجّل في اليوم: اليوم يُختم بما انتهى إليه لا بما بدأ به.
    mood: [...ordered].reverse().find((e) => e.mood)?.mood,
    starred: ordered.some((e) => e.starred) || undefined,
    tags: unite(ordered.map((e) => e.tags)),
    photos: unite(ordered.map((e) => entryPhotos(e))),
    audios: unite(ordered.map((e) => entryAudios(e))),
    photoRefs: unite(ordered.map((e) => e.photoRefs)),
    audioRefs: unite(ordered.map((e) => e.audioRefs)),
    videoRefs: concat(ordered.map((e) => e.videoRefs)),
    attachmentRefs: concat(ordered.map((e) => e.attachmentRefs)),
    audioMetadataRefs: concat(ordered.map((e) => e.audioMetadataRefs)),
    linkedTransactionIds: unite(ordered.map((e) => e.linkedTransactionIds)),
    linkedBookId: first("linkedBookId") as string | undefined,
    location: first("location") as JournalEntry["location"],
  };

  // `photo`/`audio` المفردان القديمان صارا أوّلَ عنصرٍ في المصفوفة، وإبقاؤهما
  // يضاعف الصورة الأولى في كل قارئٍ يجمع المفرد مع الجمع.
  delete merged.photo;
  delete merged.audio;
  delete merged.photoOrder;
  delete merged.audioOrder;
  if (!merged.tags?.length) delete merged.tags;
  if (!merged.photos?.length) delete merged.photos;
  if (!merged.audios?.length) delete merged.audios;
  if (!merged.photoRefs?.length) delete merged.photoRefs;
  if (!merged.audioRefs?.length) delete merged.audioRefs;
  if (!merged.linkedTransactionIds?.length) delete merged.linkedTransactionIds;

  return merged;
}

export interface DuplicateDay {
  /** YYYY-MM-DD */
  date: string;
  entries: JournalEntry[];
}

/**
 * أيامُ الأرشيف التي فيها أكثر من مذكرة، الأحدث أولاً — مصدرُ «كم يوماً يحتمل
 * الدمج» ومصدرُ الدمج الشامل. لا يمسّ شيئاً؛ قراءةٌ فقط.
 */
export function duplicateDays(entries: JournalEntry[]): DuplicateDay[] {
  const byDate = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }
  return [...byDate.entries()]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({ date, entries: chronological(list) }));
}
