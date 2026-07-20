import {
  doc, getDoc, setDoc, getDocs, collection, onSnapshot, deleteDoc,
} from "firebase/firestore";
import { ref as storageRef, uploadString, getDownloadURL } from "firebase/storage";
import { db, storage, getSyncSpace } from "./firebase";
import type { AppData, JournalEntry, HifzMistake } from "./types";
import { entryPhotos, entryAudios, dedupeJournalEntries, mergeEntryMedia } from "./utils";
import { showToast } from "@/components/ui/UndoToast";

const COLLECTION = "userData";

// ===================== Bank-SMS inbox =====================
// An iOS Automation POSTs each incoming bank message (unauthenticated, via the
// Firestore REST API) to userData/{space}/inbox. The app drains this queue on
// open, parses each message, and asks the user to categorize — the closest
// thing to "the app knows about my SMS automatically" that iOS allows.
const INBOX = "inbox";

export interface InboxItem {
  id: string;
  text: string;
  ts?: string;
}

// The Automation may send the text raw, base64-encoded (enc:"b64"), or
// url-encoded (enc:"url") — base64/url avoid breaking the JSON body on Arabic,
// quotes or newlines. Decode defensively; fall back to the raw string.
function decodeInboxText(data: Record<string, unknown>): string {
  const raw = typeof data.text === "string" ? data.text : "";
  try {
    if (data.enc === "b64") {
      const bin = atob(raw.replace(/\s+/g, ""));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    if (data.enc === "url") return decodeURIComponent(raw);
  } catch {
    return raw;
  }
  return raw;
}

export async function loadInbox(): Promise<InboxItem[]> {
  const space = getSyncSpace();
  if (!db || !space) return [];
  const snap = await getDocs(collection(db, COLLECTION, space, INBOX));
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return { id: d.id, text: decodeInboxText(data), ts: typeof data.ts === "string" ? data.ts : undefined };
  });
}

export async function deleteInboxItem(id: string): Promise<void> {
  const space = getSyncSpace();
  if (!db || !space) return;
  await deleteDoc(doc(db, COLLECTION, space, INBOX, id));
}

// Live inbox listener: fires with the current queue on attach and again on
// every change, so a bank message the iOS Automation delivers while the app is
// already open surfaces immediately — no relaunch. Errors (e.g. offline) are
// swallowed; the next connection re-delivers. Returns an unsubscribe fn.
export function subscribeInbox(cb: (items: InboxItem[]) => void): () => void {
  const space = getSyncSpace();
  if (!db || !space) return () => {};
  return onSnapshot(
    collection(db, COLLECTION, space, INBOX),
    (snap) => {
      cb(
        snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return { id: d.id, text: decodeInboxText(data), ts: typeof data.ts === "string" ? data.ts : undefined };
        })
      );
    },
    () => { /* offline / permission — retry on next connection */ }
  );
}

// ===================== Media cloud sync (Cloud Storage) =====================
// Photos and voice notes live in Cloud Storage at userData/{uid}/photos/{hash}
// and .../audios/{hash} (keyed by content hash → automatic dedup). The main
// Firestore doc keeps only lightweight refs (hashes) per entry plus a manifest
// of every hash in the cloud. Storage has far more room than Firestore and no
// per-file size limit, and other devices display media straight from its
// download URL so they don't have to keep every photo on-device.

// Hashes we believe already exist in the cloud — seeded from the main doc's
// manifest on load, so a save only uploads new media and deletes removed ones.
let knownCloudHashes = new Set<string>();
let knownCloudAudioHashes = new Set<string>();

// hash → Storage download URL, so each object's URL is resolved at most once.
const urlCache = new Map<string, string>();

function mediaPath(uid: string, sub: string, hash: string): string {
  return `${COLLECTION}/${uid}/${sub}/${hash}`;
}

// A media string is either a local `data:` URL (needs uploading) or a Storage
// download URL already in the cloud (reuse its hash, don't re-upload).
function isStorageUrl(s: string): boolean {
  return /^https?:\/\//.test(s) && s.includes("/o/");
}
function hashFromStorageUrl(url: string): string | null {
  const m = url.match(/\/o\/([^?]+)/);
  if (!m) return null;
  const last = decodeURIComponent(m[1]).split("/").pop();
  return last || null;
}

// A photo's bytes are immutable, so its content hash never changes. Memoize
// data→hash so a save re-hashes only genuinely new images. Bounded so a very
// long session can't grow it without limit.
const hashCache = new Map<string, string>();
const HASH_CACHE_LIMIT = 4000;

async function photoHash(data: string): Promise<string> {
  const cached = hashCache.get(data);
  if (cached) return cached;
  const bytes = new TextEncoder().encode(data);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  if (hashCache.size >= HASH_CACHE_LIMIT) hashCache.clear();
  hashCache.set(data, hex);
  return hex;
}

interface CloudEntry extends Omit<JournalEntry, "photo" | "photos" | "audio" | "audios"> {
  photoRefs?: string[];
  audioRefs?: string[];
}

// Replace each entry's photo/audio bytes with content-hash refs. Collects the
// new (`data:`) media to upload and the full set of referenced hashes (for the
// manifest and to know what to keep vs. delete in Storage).
async function prepareForCloud(
  data: AppData
): Promise<{
  main: AppData & { photoManifest: string[]; audioManifest: string[] };
  newPhotos: Map<string, string>;
  newAudios: Map<string, string>;
  photoRefs: Set<string>;
  audioRefs: Set<string>;
}> {
  const newPhotos = new Map<string, string>();
  const newAudios = new Map<string, string>();
  const photoRefs = new Set<string>();
  const audioRefs = new Set<string>();

  const attach = async (
    items: string[],
    newMap: Map<string, string>,
    allRefs: Set<string>
  ): Promise<string[]> => {
    const refs: string[] = [];
    for (const it of items) {
      let h: string | null;
      if (isStorageUrl(it)) {
        h = hashFromStorageUrl(it);
        if (h) urlCache.set(h, it); // already in the cloud
      } else {
        h = await photoHash(it);
        newMap.set(h, it); // a local data: URL to upload
      }
      if (h) { refs.push(h); allRefs.add(h); }
    }
    return refs;
  };

  const journalEntries = await Promise.all(
    data.journalEntries.map(async (e): Promise<CloudEntry> => {
      const imgs = entryPhotos(e);
      const auds = entryAudios(e);
      const { photo: _p, photos: _ps, audio: _a, audios: _as, ...rest } = e;
      const out: CloudEntry = rest;
      if (imgs.length) {
        const refs = await attach(imgs, newPhotos, photoRefs);
        if (refs.length) out.photoRefs = refs;
      }
      if (auds.length) {
        const refs = await attach(auds, newAudios, audioRefs);
        if (refs.length) out.audioRefs = refs;
      }
      return out;
    })
  );
  return {
    main: {
      ...data,
      journalEntries: journalEntries as unknown as JournalEntry[],
      photoManifest: [...photoRefs],
      audioManifest: [...audioRefs],
    },
    newPhotos,
    newAudios,
    photoRefs,
    audioRefs,
  };
}

// Main doc only (fast, no photo bytes). Seeds the known-hash cache from the
// manifest so a subsequent save diffs correctly. Entries still carry
// photoRefs at this point — call hydrateCloudPhotos to resolve them.
export async function loadUserMain(uid: string): Promise<AppData | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, COLLECTION, uid));
  if (!snap.exists()) {
    knownCloudHashes = new Set();
    knownCloudAudioHashes = new Set();
    return null;
  }
  const main = snap.data() as AppData & { photoManifest?: string[]; audioManifest?: string[] };
  knownCloudHashes = new Set(main.photoManifest ?? []);
  knownCloudAudioHashes = new Set(main.audioManifest ?? []);
  return main;
}

// Live-subscribe to the shared main doc so edits made on another device show
// up here automatically. Fires with the lightweight main data (entries still
// carry photoRefs) — the caller decides whether it's newer and, if so, calls
// hydrateCloudPhotos to resolve the images. Returns an unsubscribe function.
export function subscribeUserMain(
  uid: string,
  cb: (main: (AppData & { photoManifest?: string[]; audioManifest?: string[] }) | null) => void
): () => void {
  if (!db) return () => {};
  return onSnapshot(
    doc(db, COLLECTION, uid),
    (snap) => {
      if (!snap.exists()) return cb(null);
      const main = snap.data() as AppData & { photoManifest?: string[]; audioManifest?: string[] };
      knownCloudHashes = new Set(main.photoManifest ?? []);
      knownCloudAudioHashes = new Set(main.audioManifest ?? []);
      cb(main);
    },
    () => cb(null)
  );
}

// Resolve each entry's refs to a displayable source: a Storage download URL
// (cached), falling back to the pre-migration Firestore media doc (base64) so
// photos saved before the Storage move still appear until they're re-uploaded.
export async function hydrateCloudPhotos(uid: string, main: AppData): Promise<AppData> {
  if (!db) return main;
  const resolve = async (h: string, sub: string): Promise<string | null> => {
    const cached = urlCache.get(h);
    if (cached) return cached;
    if (storage) {
      try {
        const url = await getDownloadURL(storageRef(storage, mediaPath(uid, sub, h)));
        urlCache.set(h, url);
        return url;
      } catch { /* not in Storage yet — try the legacy Firestore doc */ }
    }
    try {
      const snap = await getDoc(doc(db!, COLLECTION, uid, sub, h));
      if (snap.exists()) return (snap.data() as { data: string }).data;
    } catch { /* ignore */ }
    return null;
  };
  const journalEntries = await Promise.all(
    main.journalEntries.map(async (e) => {
      const ce = e as CloudEntry & { audioRef?: string };
      const refs = ce.photoRefs;
      // Back-compat: older docs stored a single audioRef; newer store audioRefs.
      const arefs = ce.audioRefs ?? (ce.audioRef ? [ce.audioRef] : []);
      const { photoRefs: _r, audioRefs: _ars, audioRef: _ar, ...rest } = ce;
      let out = rest as JournalEntry;
      if (refs?.length) {
        const imgs = (await Promise.all(refs.map((h) => resolve(h, "photos")))).filter(Boolean) as string[];
        if (imgs.length) out = { ...out, photos: imgs, photo: imgs[0] };
      }
      if (arefs.length) {
        const auds = (await Promise.all(arefs.map((h) => resolve(h, "audios")))).filter(Boolean) as string[];
        if (auds.length) out = { ...out, audios: auds, audio: auds[0] };
      }
      return out;
    })
  );
  return { ...main, journalEntries };
}

// Back-compat: load everything in one call (used where photos are wanted).
export async function loadUserData(uid: string): Promise<AppData | null> {
  const main = await loadUserMain(uid);
  if (!main) return null;
  return hydrateCloudPhotos(uid, main);
}

// Re-attach media kept on this device onto cloud entries that arrived without
// it (matched by id) — a safety net so a hydrate can never wipe a local photo
// or voice note even if its cloud doc failed to download.
export function mergeLocalPhotos(cloud: Partial<AppData>, local: AppData): Partial<AppData> {
  if (!cloud.journalEntries) return cloud;
  const localMedia = new Map(
    local.journalEntries
      .filter((e) => e.photo || e.photos?.length || e.audio || e.audios?.length)
      .map((e) => [e.id, { photo: e.photo, photos: e.photos, audio: e.audio, audios: e.audios }])
  );
  if (!localMedia.size) return cloud;
  return {
    ...cloud,
    journalEntries: cloud.journalEntries.map((e) => {
      const kept = localMedia.get(e.id);
      if (!kept) return e;
      const patch: Partial<JournalEntry> = {};
      if (!(e.photo || e.photos?.length) && (kept.photo || kept.photos?.length)) {
        patch.photo = kept.photo;
        patch.photos = kept.photos;
      }
      if (!(e.audio || e.audios?.length) && (kept.audio || kept.audios?.length)) {
        patch.audio = kept.audio;
        patch.audios = kept.audios;
      }
      return Object.keys(patch).length ? { ...e, ...patch } : e;
    }),
  };
}

// ===================== Multi-device merge =====================
// Combine a local and a cloud snapshot so neither device's edits are lost to a
// last-writer-wins overwrite. Every collection is unioned by its id/key; on a
// conflicting id the snapshot with the newer top-level `lastUpdated` wins that
// item. Habit logs, reserve deposits, and per-day prayers are unioned so a
// completion/deposit/prayer recorded on either device survives. Singletons
// (daily budget, income, salary day) come from the newer snapshot. Deletions
// are tracked as tombstones (`deleted`: id → ts) and filtered out of the union
// below, so a delete on one device is no longer undone by the other's
// still-present copy.
function unionOrdered<T>(primary: T[], secondary: T[], keyOf: (t: T) => string): T[] {
  const seen = new Set(primary.map(keyOf));
  return [...primary, ...secondary.filter((it) => !seen.has(keyOf(it)))];
}

// Keep tombstones for a wide window so every device has time to converge, then
// drop them so the map can't grow without bound.
const TOMBSTONE_TTL_MS = 120 * 24 * 60 * 60 * 1000; // 120 days

export function mergeAppData(local: AppData, cloud: AppData): AppData {
  const localNewer = (local.lastUpdated ?? "") >= (cloud.lastUpdated ?? "");
  const primary = localNewer ? local : cloud;
  const secondary = localNewer ? cloud : local;

  // Union both tombstone maps (newest deletedAt per id), then prune old ones.
  const deleted: Record<string, number> = { ...(cloud.deleted ?? {}) };
  for (const [id, ts] of Object.entries(local.deleted ?? {})) {
    deleted[id] = Math.max(deleted[id] ?? 0, ts);
  }
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  for (const id of Object.keys(deleted)) {
    if (deleted[id] < cutoff) delete deleted[id];
  }
  // Drop any id-keyed item that carries a live tombstone — this is what stops a
  // resurrected copy from a second device.
  const alive = <T extends { id: string }>(arr: T[]) => arr.filter((x) => !(x.id in deleted));
  const byId = <T extends { id: string }>(p: T[], s: T[]) =>
    alive(unionOrdered(p, s, (x) => x.id));

  // Like byId, but on a conflicting id keep the copy whose own `updatedAt` is
  // newer — so a per-item edit survives even when the OTHER device holds the
  // newer document-level `lastUpdated`. Missing/equal stamps fall back to the
  // primary copy (prior behavior), so legacy items are untouched.
  const byIdNewer = <T extends { id: string; updatedAt?: number }>(p: T[], s: T[]) => {
    const sById = new Map(s.map((it) => [it.id, it]));
    const merged = p.map((it) => {
      const other = sById.get(it.id);
      return other && (other.updatedAt ?? 0) > (it.updatedAt ?? 0) ? other : it;
    });
    const seen = new Set(p.map((it) => it.id));
    return alive([...merged, ...s.filter((it) => !seen.has(it.id))]);
  };

  // Habits: union by id, then union each habit's logged dates from both sides.
  const habits = byId(primary.habits, secondary.habits).map((h) => {
    const pLogs = primary.habits.find((x) => x.id === h.id)?.logs ?? [];
    const sLogs = secondary.habits.find((x) => x.id === h.id)?.logs ?? [];
    return { ...h, logs: [...new Set([...pLogs, ...sLogs])].sort() };
  });

  // Reserve funds: union by id, and union each fund's deposits by deposit id.
  const reserves = byId(primary.reserves, secondary.reserves).map((f) => {
    const pDep = primary.reserves.find((x) => x.id === f.id)?.deposits ?? [];
    const sDep = secondary.reserves.find((x) => x.id === f.id)?.deposits ?? [];
    return { ...f, deposits: unionOrdered(pDep, sDep, (d) => d.id) };
  });

  // Prayer logs: union by date; on a shared date merge the per-prayer maps
  // (primary wins per prayer) so a prayer logged only on the other device stays.
  const prayerLogs = unionOrdered(primary.prayerLogs, secondary.prayerLogs, (p) => p.date).map((pl) => {
    const sMatch = secondary.prayerLogs.find((x) => x.date === pl.date);
    return sMatch ? { ...pl, prayers: { ...sMatch.prayers, ...pl.prayers } } : pl;
  });

  // Quran khatma: singleton from the newer snapshot, but never lose a completed
  // khatma — take the higher `completed` count across both devices.
  const pk = primary.quranKhatma ?? { juz: 0, completed: 0 };
  const sk = secondary.quranKhatma ?? { juz: 0, completed: 0 };
  const quranKhatma = { ...pk, completed: Math.max(pk.completed ?? 0, sk.completed ?? 0) };

  // Quran حفظ: خطة من الأحدث، والجبهة أبعد موضعٍ بلغه أيُّ جهاز، وسجلّا الجلسات
  // والمراجعات يُوحَّدان بالـid فلا يضيع أثرٌ سُجّل على جهاز. مواضع الأخطاء
  // (mistakes) تُوحَّد بالـid مع دمج تواريخ الوقوع (hits) وأحدث حالة إتقان، و
  // lastTestDate يأخذ الأحدث — كان الاثنان يُمحيان لأن الدمج بنى كائنًا ناقصهما.
  const emptyHifz = { plan: null, frontierId: 0, sessions: [], reviews: [], reviewCursorId: 0, mistakes: [] as HifzMistake[], lastTestDate: undefined as string | undefined };
  const ph = primary.quranHifz ?? emptyHifz;
  const sh = secondary.quranHifz ?? emptyHifz;
  const pMist = ph.mistakes ?? [];
  const sMist = sh.mistakes ?? [];
  const pMistById = new Map(pMist.map((m) => [m.id, m]));
  const sMistById = new Map(sMist.map((m) => [m.id, m]));
  const mistakes = unionOrdered(pMist, sMist, (m) => m.id).map((m) => {
    const a = pMistById.get(m.id);
    const b = sMistById.get(m.id);
    if (!a || !b) return m; // only one device has it
    // Both hold it: union the hit dates, and take the record edited more
    // recently for resolved/word so an "أُتقن" on either device sticks.
    const newer = (a.updatedAt ?? "") >= (b.updatedAt ?? "") ? a : b;
    return { ...newer, hits: [...new Set([...(a.hits ?? []), ...(b.hits ?? [])])].sort() };
  });
  const lastTestDate = (ph.lastTestDate ?? "") >= (sh.lastTestDate ?? "")
    ? ph.lastTestDate : sh.lastTestDate;
  const quranHifz = {
    plan: ph.plan ?? sh.plan,
    frontierId: Math.max(ph.frontierId ?? 0, sh.frontierId ?? 0),
    sessions: unionOrdered(ph.sessions ?? [], sh.sessions ?? [], (x) => x.id),
    reviews: unionOrdered(ph.reviews ?? [], sh.reviews ?? [], (x) => x.id),
    reviewCursorId: ph.reviewCursorId || sh.reviewCursorId || 0,
    mistakes,
    lastTestDate,
  };

  // Journal entries need more than a plain id-union. First canonicalize +
  // dedupe both sides so the same Day One entry imported on two devices (which
  // historically got a different random id each time) collapses into one item.
  // Then, for an entry both devices hold, keep the chosen side's text but never
  // lose media the other side has — this is what stops a device with the newer
  // top-level stamp from wiping a photo/voice note the other device added (and
  // from pushing that stripped copy back, deleting the file from Cloud Storage).
  const pJournal = dedupeJournalEntries(primary.journalEntries);
  const sJournal = dedupeJournalEntries(secondary.journalEntries);
  const sJournalById = new Map(sJournal.map((e) => [e.id, e]));
  const journalEntries = alive(
    unionOrdered(
      pJournal.map((e) => {
        const other = sJournalById.get(e.id);
        if (!other) return e;
        // Keep the text of whichever copy was edited more recently (per-item
        // updatedAt), then fill any media the winner lacks from the other side
        // so a newer text edit never wipes a photo/voice note the older copy
        // still holds. Falls back to primary (e) when stamps are equal/missing.
        const base = (other.updatedAt ?? 0) > (e.updatedAt ?? 0) ? other : e;
        const from = base === e ? other : e;
        return mergeEntryMedia(base, from);
      }),
      sJournal,
      (e) => e.id
    )
  );

  return {
    transactions: byIdNewer(primary.transactions, secondary.transactions),
    books: byId(primary.books, secondary.books),
    readingLogs: byId(primary.readingLogs, secondary.readingLogs),
    journalEntries,
    habits,
    recurring: byId(primary.recurring, secondary.recurring),
    budgets: unionOrdered(primary.budgets, secondary.budgets, (b) => b.category),
    categories: alive(unionOrdered(primary.categories, secondary.categories, (c) => c.id)),
    reserves,
    prayerLogs,
    // القرآن: تأمّلات ومحفوظات تُوحَّد بالـid (مع الأختام)، والوِرد يُوحَّد
    // كتواريخ (كسجلّات العادات) فلا يضيع وِردٌ سُجّل على جهاز.
    quranReflections: byId(primary.quranReflections ?? [], secondary.quranReflections ?? []),
    quranHifz,
    quranWird: [...new Set([...(primary.quranWird ?? []), ...(secondary.quranWird ?? [])])].sort(),
    quranKhatma,
    // الإعدادات المفردة (الميزانية اليومية والدخل الشهري): الأحدث يفوز، لكن إن
    // لم يضبطها الجهاز الأحدث نأخذها من الآخر — فلا يمحو جهازٌ لم تُضبَط فيه
    // إعداداً موجوداً على الجهاز الثاني (كان سبب «الإعدادات ما تظهر بالآيباد»).
    dailyBudget: primary.dailyBudget ?? secondary.dailyBudget,
    monthlyIncome: primary.monthlyIncome ?? secondary.monthlyIncome,
    futureLetters: byId(primary.futureLetters, secondary.futureLetters),
    salaryDay: primary.salaryDay,
    lastSalaryConfirm: primary.lastSalaryConfirm,
    readingGoal: primary.readingGoal ?? secondary.readingGoal ?? null,
    // العادات المجمّدة إعدادٌ مفرد (تبديل مقصود): يفوز الأحدث كي يسري
    // الاستئناف/التجميد عبر الأجهزة بدل أن يُعيده اتحادٌ لا يعرف الإزالة.
    frozenHabits: primary.frozenHabits ?? secondary.frozenHabits ?? [],
    merchantRules: { ...secondary.merchantRules, ...primary.merchantRules },
    deleted,
    lastUpdated: (local.lastUpdated ?? "") > (cloud.lastUpdated ?? "") ? local.lastUpdated : cloud.lastUpdated,
  };
}

// Upload new media to Storage. Non-fatal: a file that fails to upload just
// isn't added to the returned set, so the manifest stays honest and it's
// retried on the next save. No per-file size limit (Storage), so long voice
// notes sync too.
//
// We deliberately NEVER delete from Storage here. The old pass deleted any
// cloud hash not present in `allRefs` — but `allRefs` is only THIS device's
// current snapshot, so a device syncing with a stale/incomplete view would
// destroy a photo another device still references (data loss). Until a proper
// soft-delete + server-side GC exists, unreferenced media simply accumulates;
// that's cheap and safe. The manifest therefore only ever grows (union of what
// we knew was in the cloud and what we just referenced), so no real file is
// ever dropped from it.
async function syncMediaToStorage(
  uid: string,
  sub: string,
  toUpload: Map<string, string>,
  allRefs: Set<string>,
  known: Set<string>
): Promise<Set<string>> {
  if (!storage) return known;
  const uploaded = new Set(known);
  try {
    for (const [h, dataUrl] of toUpload) {
      await uploadString(storageRef(storage, mediaPath(uid, sub, h)), dataUrl, "data_url");
      uploaded.add(h);
      urlCache.delete(h); // a fresh download URL will be fetched on next resolve
    }
    // Everything we already knew is in the cloud (never deleted) plus everything
    // this device references and just uploaded — union, never shrink.
    for (const h of allRefs) uploaded.add(h);
    return uploaded;
  } catch {
    return uploaded; // honest partial progress → failed ones retried next save
  }
}

// Result of a save. `mediaComplete` is false when some referenced photo/voice
// note didn't reach Cloud Storage this round (a failed/partial upload) — the
// text doc still saved, but the UI must NOT claim "تمت المزامنة" while media is
// still pending. It's retried on the next save.
export interface SaveResult {
  mediaComplete: boolean;
}

export async function saveUserData(uid: string, data: AppData): Promise<SaveResult> {
  if (!db) return { mediaComplete: true };
  const { main, newPhotos, newAudios, photoRefs, audioRefs } = await prepareForCloud(data);

  // 1) Upload new media to Storage first. Text-only edits have none, so this is
  //    a no-op and stays fast.
  knownCloudHashes = await syncMediaToStorage(uid, "photos", newPhotos, photoRefs, knownCloudHashes);
  knownCloudAudioHashes = await syncMediaToStorage(uid, "audios", newAudios, audioRefs, knownCloudAudioHashes);

  // 2) Write the main doc with a manifest of only what actually reached the
  //    cloud, so any media that didn't upload is retried on the next save
  //    instead of being marked present and stranded.
  const honestMain = {
    ...main,
    photoManifest: [...knownCloudHashes],
    audioManifest: [...knownCloudAudioHashes],
  };
  warnIfDocSizeNearLimit(honestMain);
  await setDoc(doc(db, COLLECTION, uid), honestMain, { merge: false });

  // Honest signal: did every referenced photo/audio actually land in the cloud?
  const allIn = (refs: Set<string>, known: Set<string>) => [...refs].every((h) => known.has(h));
  const mediaComplete =
    allIn(photoRefs, knownCloudHashes) && allIn(audioRefs, knownCloudAudioHashes);
  return { mediaComplete };
}

// The whole main doc (all journal text, transactions, etc. — media is stored
// separately in Cloud Storage) lives under Firestore's hard 1MB-per-document
// cap. A large text-only import (e.g. Day One) can approach it well before
// media ever would, and crossing it breaks sync outright. Warn early, once per
// session, instead of failing silently on the next save.
const DOC_SIZE_WARN_BYTES = 650 * 1024;
const DOC_SIZE_LIMIT_BYTES = 1024 * 1024;
let docSizeWarned = false;

function warnIfDocSizeNearLimit(main: unknown): void {
  if (docSizeWarned) return;
  const size = new Blob([JSON.stringify(main)]).size;
  if (size < DOC_SIZE_WARN_BYTES) return;
  docSizeWarned = true;
  const kb = Math.round(size / 1024);
  const pct = Math.round((size / DOC_SIZE_LIMIT_BYTES) * 100);
  showToast(`مساحة المزامنة ${kb}KB من حد 1MB (${pct}%) — قارب الامتلاء`, "warning");
}

// Seed the hash→URL cache from media already stored locally as Storage URLs, so
// a hydrate reuses them instead of re-fetching every download URL from scratch.
export function primeUrlCache(entries: JournalEntry[]): void {
  for (const e of entries) {
    for (const u of [...(e.photos ?? []), e.photo, ...(e.audios ?? []), e.audio]) {
      if (u && isStorageUrl(u)) {
        const h = hashFromStorageUrl(u);
        if (h) urlCache.set(h, u);
      }
    }
  }
}

// Force a full media re-upload: forget what we think is already in the cloud so
// the next save re-uploads every photo/voice note (idempotent — existing files
// are just overwritten). Recovers media stranded by an older optimistic
// manifest, and migrates local photos up to Cloud Storage.
export async function reuploadAllMedia(uid: string, data: AppData): Promise<void> {
  knownCloudHashes = new Set();
  knownCloudAudioHashes = new Set();
  await saveUserData(uid, data);
}
