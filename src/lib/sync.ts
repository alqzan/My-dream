import {
  doc, getDoc, setDoc, getDocs, collection, onSnapshot, deleteDoc,
} from "firebase/firestore";
import { ref as storageRef, uploadString, getDownloadURL, listAll } from "firebase/storage";
import { db, storage, getSyncSpace } from "./firebase";
import type { AppData, JournalEntry } from "./types";
import { entryPhotos, entryAudios } from "./utils";
import { journalShardId } from "./merge";
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

// ===================== Journal sharding =====================
// Journal entries are stored sharded across userData/{uid}/journal/{shardId}
// documents — one per YYYY-MM of the entry's own date — instead of inline in
// the single main doc. This lifts Firestore's hard 1MB-per-document cap off the
// journal entirely (2000+ Day One entries would blow past it inline). Sharding
// by the entry's date is stable across devices and naturally bounded (a month
// of entries is small), and only shards whose contents changed are rewritten.
const JOURNAL_SUB = "journal";
const SHARD_WARN_BYTES = 850 * 1024; // warn before a single shard nears 1MB

function splitJournalShards(entries: CloudEntry[]): Map<string, CloudEntry[]> {
  const m = new Map<string, CloudEntry[]>();
  for (const e of entries) {
    const sid = journalShardId(e.date);
    let arr = m.get(sid);
    if (!arr) { arr = []; m.set(sid, arr); }
    arr.push(e);
  }
  return m;
}

// Signature of what each shard last held (read or written), so a save rewrites
// only the shards that actually changed — not all of them on every edit.
let shardSignatures = new Map<string, string>();
const shardSig = (entries: unknown[]): string => JSON.stringify(entries);

// Read all journal shards and fold them (plus any legacy entries still inline in
// the main doc, pre-migration) into one CloudEntry[]. Shard copies win a clash.
// Seeds shardSignatures so the next save diffs correctly.
async function loadJournalShards(
  uid: string,
  mainData: { journalEntries?: unknown[] }
): Promise<CloudEntry[]> {
  const byId = new Map<string, CloudEntry>();
  const put = (e: CloudEntry | undefined) => {
    const id = (e as { id?: string } | undefined)?.id;
    if (id) byId.set(id, e as CloudEntry);
  };
  // Legacy inline entries first (overwritten by a shard copy if one exists).
  for (const e of (mainData.journalEntries as CloudEntry[] | undefined) ?? []) put(e);
  const sigs = new Map<string, string>();
  if (db) {
    try {
      const snap = await getDocs(collection(db, COLLECTION, uid, JOURNAL_SUB));
      snap.forEach((d) => {
        const entries = (d.data() as { entries?: CloudEntry[] }).entries ?? [];
        sigs.set(d.id, shardSig(entries));
        for (const e of entries) put(e);
      });
    } catch { /* offline — fall back to legacy inline / local */ }
  }
  shardSignatures = sigs;
  return [...byId.values()];
}

// Write the journal shards for this snapshot: only shards whose contents changed
// are written, and shards that became empty (all their entries deleted/moved to
// another month) are removed. Updates shardSignatures to match.
async function writeJournalShards(uid: string, entries: CloudEntry[]): Promise<void> {
  if (!db) return;
  const shards = splitJournalShards(entries);
  const nextSigs = new Map<string, string>();
  for (const [sid, es] of shards) {
    const sig = shardSig(es);
    nextSigs.set(sid, sig);
    if (shardSignatures.get(sid) === sig) continue; // unchanged → skip write
    const bytes = new Blob([sig]).size;
    if (bytes >= SHARD_WARN_BYTES) warnShardNearLimit(sid, bytes);
    await setDoc(doc(db, COLLECTION, uid, JOURNAL_SUB, sid), { entries: es }, { merge: false });
  }
  // Delete shards we knew about that hold nothing now — BUT never when the whole
  // journal is empty. An empty journal at save time almost always means the
  // store isn't hydrated yet (a fresh tab, a failed load), not that the user
  // deleted everything; deleting every shard here would be catastrophic data
  // loss. Real per-entry deletes are handled by tombstones regardless, and a
  // genuinely-emptied month is cleaned once other months are saved (entries>0).
  if (entries.length > 0) {
    for (const sid of shardSignatures.keys()) {
      if (!shards.has(sid)) {
        try { await deleteDoc(doc(db, COLLECTION, uid, JOURNAL_SUB, sid)); } catch { /* already gone */ }
      }
    }
    shardSignatures = nextSigs;
  } else {
    // Keep prior knowledge of existing shards so a later real save can reconcile.
    shardSignatures = new Map([...shardSignatures, ...nextSigs]);
  }
}

let shardWarned = false;
function warnShardNearLimit(sid: string, bytes: number): void {
  if (shardWarned) return;
  shardWarned = true;
  showToast(`شهر ${sid} كبير (${Math.round(bytes / 1024)}KB) — قد يحتاج تقسيمًا أدق`, "warning");
}

// Replace each entry's photo/audio bytes with content-hash refs. Collects the
// new (`data:`) media to upload and the full set of referenced hashes (for the
// manifest and to know what to keep vs. delete in Storage).
async function prepareForCloud(
  data: AppData
): Promise<{
  // The main doc holds everything EXCEPT the journal (which is sharded).
  main: Omit<AppData, "journalEntries"> & { photoManifest: string[]; audioManifest: string[] };
  cloudJournal: CloudEntry[];
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
  // Strip journalEntries out of the main doc — they go to shards instead.
  const { journalEntries: _omitJournal, ...dataNoJournal } = data;
  return {
    main: {
      ...dataNoJournal,
      photoManifest: [...photoRefs],
      audioManifest: [...audioRefs],
    },
    cloudJournal: journalEntries,
    newPhotos,
    newAudios,
    photoRefs,
    audioRefs,
  };
}

// Main doc + journal shards (no photo bytes — entries still carry photoRefs,
// resolved later by hydrateCloudPhotos). Seeds the known-hash cache from the
// manifest and the shard-signature cache so a subsequent save diffs correctly.
export async function loadUserMain(uid: string): Promise<AppData | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, COLLECTION, uid));
  if (!snap.exists()) {
    knownCloudHashes = new Set();
    knownCloudAudioHashes = new Set();
    shardSignatures = new Map();
    return null;
  }
  const main = snap.data() as AppData & { photoManifest?: string[]; audioManifest?: string[] };
  knownCloudHashes = new Set(main.photoManifest ?? []);
  knownCloudAudioHashes = new Set(main.audioManifest ?? []);
  // Journal lives in shards now; fold them (and any legacy inline entries) back
  // into journalEntries so the rest of the app sees one flat list as before.
  const journalEntries = await loadJournalShards(uid, main);
  return { ...main, journalEntries: journalEntries as unknown as JournalEntry[] };
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
  // Subscribe to the main doc. Every save writes the main doc (its lastUpdated
  // bumps on any edit, journal included), so this fires on any remote change;
  // we then re-read the journal shards to hand back a complete snapshot.
  return onSnapshot(
    doc(db, COLLECTION, uid),
    async (snap) => {
      if (!snap.exists()) return cb(null);
      const main = snap.data() as AppData & { photoManifest?: string[]; audioManifest?: string[] };
      knownCloudHashes = new Set(main.photoManifest ?? []);
      knownCloudAudioHashes = new Set(main.audioManifest ?? []);
      const journalEntries = await loadJournalShards(uid, main);
      cb({ ...main, journalEntries: journalEntries as unknown as JournalEntry[] });
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

// Multi-device merge lives in ./merge (Firebase-free, so it is unit-testable).
// Re-exported here so existing importers (SyncProvider, BackupCard) are unchanged.
export { mergeAppData } from "./merge";

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
  const { main, cloudJournal, newPhotos, newAudios, photoRefs, audioRefs } = await prepareForCloud(data);

  // 1) Upload new media to Storage first. Text-only edits have none, so this is
  //    a no-op and stays fast.
  knownCloudHashes = await syncMediaToStorage(uid, "photos", newPhotos, photoRefs, knownCloudHashes);
  knownCloudAudioHashes = await syncMediaToStorage(uid, "audios", newAudios, audioRefs, knownCloudAudioHashes);

  // 2) Write the journal shards (only the ones that changed) — this is what
  //    keeps the journal off the 1MB single-doc cap. Then write the main doc
  //    (no journal inline) with a manifest of only what actually reached the
  //    cloud, so any media that didn't upload is retried on the next save.
  await writeJournalShards(uid, cloudJournal);
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

// ===================== Media inventory / verification =====================
// Read-only audit that reconciles what the entries REFERENCE against what
// actually lives in Cloud Storage — the check the migration prep requires
// before any restructure (§10). Touches nothing; it only lists and compares.
export interface MediaTypeReport {
  referenced: number;   // distinct hashes referenced by entries
  inCloud: number;      // referenced AND present in Storage (healthy)
  pendingUpload: number;// referenced, not in cloud, but still held locally → will upload
  broken: number;       // referenced, not in cloud, and NO local copy → the file is gone
  orphans: number;      // in Storage but referenced by nothing → safe to ignore/GC later
}
export interface MediaInventory {
  photos: MediaTypeReport;
  audios: MediaTypeReport;
  brokenSamples: string[]; // a few hashes with a missing file, for reference
  // False when Cloud Storage couldn't be listed at all (network blocked, offline,
  // a Storage outage) — so the UI never reports a misleading "0 in cloud" when the
  // truth is "couldn't reach Storage". The referenced photos may be perfectly safe
  // in the cloud; we just couldn't see them from here right now.
  storageReachable: boolean;
}

async function referencedHashes(
  items: string[]
): Promise<Map<string, "local" | "cloud">> {
  const map = new Map<string, "local" | "cloud">();
  for (const it of items) {
    if (!it) continue;
    if (isStorageUrl(it)) {
      const h = hashFromStorageUrl(it);
      if (h && !map.has(h)) map.set(h, "cloud"); // only a cloud pointer, no local bytes
    } else {
      const h = await photoHash(it);
      map.set(h, "local"); // held locally as data: → recoverable by re-upload
    }
  }
  return map;
}

async function listCloudHashes(uid: string, sub: string): Promise<{ hashes: Set<string>; ok: boolean }> {
  if (!storage) return { hashes: new Set(), ok: false };
  try {
    const res = await listAll(storageRef(storage, `${COLLECTION}/${uid}/${sub}`));
    return { hashes: new Set(res.items.map((i) => i.name)), ok: true };
  } catch {
    return { hashes: new Set(), ok: false }; // couldn't reach Storage — NOT "empty"
  }
}

function reconcile(
  refs: Map<string, "local" | "cloud">,
  cloud: Set<string>
): { report: MediaTypeReport; broken: string[] } {
  let inCloud = 0, pendingUpload = 0, broken = 0;
  const brokenList: string[] = [];
  for (const [h, source] of refs) {
    if (cloud.has(h)) inCloud++;
    else if (source === "local") pendingUpload++;
    else { broken++; brokenList.push(h); }
  }
  let orphans = 0;
  for (const h of cloud) if (!refs.has(h)) orphans++;
  return { report: { referenced: refs.size, inCloud, pendingUpload, broken, orphans }, broken: brokenList };
}

export async function inventoryMedia(uid: string, data: AppData): Promise<MediaInventory> {
  const photoItems: string[] = [];
  const audioItems: string[] = [];
  for (const e of data.journalEntries) {
    photoItems.push(...entryPhotos(e));
    audioItems.push(...entryAudios(e));
  }
  const [photoRefs, audioRefs, cloudPhotos, cloudAudios] = await Promise.all([
    referencedHashes(photoItems),
    referencedHashes(audioItems),
    listCloudHashes(uid, "photos"),
    listCloudHashes(uid, "audios"),
  ]);
  const p = reconcile(photoRefs, cloudPhotos.hashes);
  const a = reconcile(audioRefs, cloudAudios.hashes);
  return {
    photos: p.report,
    audios: a.report,
    brokenSamples: [...p.broken, ...a.broken].slice(0, 5),
    storageReachable: cloudPhotos.ok && cloudAudios.ok,
  };
}
