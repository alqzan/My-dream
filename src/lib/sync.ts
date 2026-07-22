import {
  doc, getDoc, setDoc, getDocs, collection, onSnapshot, deleteDoc,
} from "firebase/firestore";
import { db, getSyncSpace } from "./firebase";
import type { AppData, JournalEntry } from "./types";
import { entryPhotos, entryAudios } from "./utils";
import { journalShardId } from "./merge";
import { showToast } from "@/components/ui/UndoToast";

const COLLECTION = "userData";

// Public Worker endpoint only. The sync key remains device-local and is sent
// as a Bearer credential on each request; no R2 credential reaches the app.
const R2_WORKER_URL = (process.env.NEXT_PUBLIC_R2_WORKER_URL ?? "").replace(/\/+$/, "");

type MediaKind = "photos" | "audios";

class MediaGatewayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// A media request can fail for reasons that need very different responses from
// the owner. Collapsing them all into "network blocked" (the old behavior) hid
// a mismatched sync key behind a misleading message. We classify instead:
//   auth    → 401: this device's sync key doesn't match the Worker (the media
//             is likely safe in R2; this device just isn't authorized).
//   origin  → 403: the page origin isn't in the Worker's CORS allow-list.
//   server  → 5xx (or any other non-2xx): the Worker/R2 itself is failing.
//   config  → the Worker URL isn't baked into this build (stale cached PWA).
//   network → fetch never reached the Worker (offline / blocked network).
export type MediaAccessError = "auth" | "origin" | "server" | "config" | "network";

function classifyMediaError(err: unknown): MediaAccessError {
  if (err instanceof MediaGatewayError) {
    if (!R2_WORKER_URL) return "config";
    if (err.status === 401) return "auth";
    if (err.status === 403) return "origin";
    return "server";
  }
  return "network"; // fetch threw → couldn't reach the Worker at all
}

// Thrown when the direct browser→R2 PUT (the presigned S3 URL) is rejected. This
// path is separate from the Worker call: it exercises the R2 S3 credentials and
// the bucket's CORS, so its status pinpoints a different class of misconfig than
// a Worker error does. We surface it verbatim instead of swallowing it.
class R2PutError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Turn any upload failure into an actionable Arabic message. Uploads fail for
// reasons the owner can act on — a bad R2 S3 key (403), an oversize file (413),
// a missing bucket CORS rule (opaque network error) — and the old code hid all
// of them behind "تحقق من الاتصال". Naming the real cause is the whole point.
export function describeUploadError(err: unknown): string {
  if (err instanceof R2PutError) {
    if (err.status === 403)
      return "رفض R2 الرفع (403) — غالبًا مفاتيح R2 (S3) في الـWorker غير صحيحة، أو CORS للـbucket";
    if (err.status === 413) return "الملف كبير جدًا — رفضه R2 (413)";
    return `رفض R2 الرفع (${err.status})`;
  }
  if (err instanceof MediaGatewayError) {
    if (err.status === 401) return "مفتاح المزامنة لا يطابق الخادم (401)";
    if (err.status === 403) return "الأصل غير مسموح في الـWorker (403)";
    if (err.status === 413) return "الملف كبير جدًا (413)";
    if (err.status === 415) return "نوع الملف غير مسموح";
    return `الخادم رفض طلب الرفع (${err.status})`;
  }
  // A thrown error that isn't one of our typed cases. On the direct R2 PUT this
  // is usually a fetch TypeError (bucket CORS missing/wrong, or offline). Include
  // the underlying name/message so an unexpected cause (e.g. a Firestore write)
  // is visible instead of hidden behind a generic guess.
  const detail =
    err instanceof Error && err.message
      ? `${err.name}: ${err.message}`.slice(0, 140)
      : String(err).slice(0, 140);
  return `تعذّر الرفع إلى R2 — تحقق من CORS للـbucket أو الاتصال (${detail})`;
}

async function mediaGateway<T>(
  syncKey: string,
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  if (!R2_WORKER_URL) throw new MediaGatewayError(503, "R2 Worker is not configured");
  const response = await fetch(`${R2_WORKER_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${syncKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `R2 Worker returned ${response.status}`;
    try {
      const payload = await response.json() as { error?: string };
      if (payload.error) message = payload.error;
    } catch { /* non-JSON gateway error */ }
    throw new MediaGatewayError(response.status, message);
  }
  return response.json() as Promise<T>;
}

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

// ===================== Media cloud sync (Cloudflare R2) =====================
// Photos and voice notes live privately in R2 at media/{kind}/{hash}. The
// Cloudflare Worker authenticates the device's sync key and issues short-lived
// presigned PUT/GET URLs; R2 credentials never reach this static PWA. Firestore
// keeps only content-hash refs and the provider-specific manifest.

// Hashes we believe already exist in R2 — seeded from an R2-tagged manifest.
// Saves only add confirmed objects; automatic deletion is intentionally absent.
let knownCloudHashes = new Set<string>();
let knownCloudAudioHashes = new Set<string>();

// Presigned URLs expire, so cache them only while they still have a safe amount
// of life left. Legacy Firebase download URLs use Infinity during migration.
interface CachedMediaUrl { url: string; expiresAt: number }
const urlCache = new Map<string, CachedMediaUrl>();
const URL_EXPIRY_SAFETY_MS = 15_000;

// A media string is either a local `data:` URL (needs uploading) or a cloud
// download URL. Parse both R2 presigned URLs and legacy Firebase Storage URLs
// so an already-hydrated entry keeps its hash rather than hashing the URL text.
function isStorageUrl(s: string): boolean {
  return /^https?:\/\//.test(s) && hashFromStorageUrl(s) !== null;
}
function isR2StorageUrl(s: string): boolean {
  try {
    return new URL(s).hostname.endsWith(".r2.cloudflarestorage.com");
  } catch {
    return false;
  }
}
// True for a Worker download link: GET /v1/media/blob?hash=…&exp=…&sig=…. These
// are our own short-lived, already-in-cloud pointers — NOT local bytes to upload.
function isWorkerDownloadUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname.endsWith("/v1/media/blob") && /^[a-f0-9]{32}$/.test(u.searchParams.get("hash") ?? "");
  } catch {
    return false;
  }
}

function hashFromStorageUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // New Worker download links carry the content hash as a query param.
    const q = (u.searchParams.get("hash") ?? "").toLowerCase();
    if (/^[a-f0-9]{32}$/.test(q)) return q;
    const legacy = url.match(/\/o\/([^?]+)/);
    const path = legacy ? decodeURIComponent(legacy[1]) : u.pathname;
    const last = path.split("/").filter(Boolean).pop()?.toLowerCase() ?? "";
    return /^[a-f0-9]{32}$/.test(last) ? last : null;
  } catch {
    return null;
  }
}

function presignedExpiry(url: string): number {
  try {
    const parsed = new URL(url);
    // Worker download links carry their own absolute-ms expiry in `exp`.
    const workerExp = Number(parsed.searchParams.get("exp"));
    if (isWorkerDownloadUrl(url) && Number.isSafeInteger(workerExp) && workerExp > 0) {
      return workerExp;
    }
    const rawDate = parsed.searchParams.get("X-Amz-Date");
    const rawTtl = parsed.searchParams.get("X-Amz-Expires");
    if (!rawDate || !rawTtl || !/^\d{8}T\d{6}Z$/.test(rawDate)) return Infinity;
    const created = Date.UTC(
      Number(rawDate.slice(0, 4)), Number(rawDate.slice(4, 6)) - 1, Number(rawDate.slice(6, 8)),
      Number(rawDate.slice(9, 11)), Number(rawDate.slice(11, 13)), Number(rawDate.slice(13, 15))
    );
    return created + Number(rawTtl) * 1000;
  } catch {
    return 0;
  }
}

function cacheMediaUrl(hash: string, url: string, expiresAt = presignedExpiry(url)): void {
  urlCache.set(hash, { url, expiresAt });
}

function cachedMediaUrl(hash: string): string | null {
  const cached = urlCache.get(hash);
  if (!cached) return null;
  if (cached.expiresAt - Date.now() <= URL_EXPIRY_SAFETY_MS) {
    urlCache.delete(hash);
    return null;
  }
  return cached.url;
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

const MEDIA_PROVIDER = "r2-v1";
interface CloudMediaMeta {
  photoManifest?: string[];
  audioManifest?: string[];
  mediaProvider?: string;
}

function seedKnownMedia(main: CloudMediaMeta): void {
  // A pre-R2 manifest only claimed Firebase Storage objects. Never treat those
  // hashes as present in R2 or the migration could report a false success.
  const isR2 = main.mediaProvider === MEDIA_PROVIDER;
  knownCloudHashes = new Set(isR2 ? (main.photoManifest ?? []) : []);
  knownCloudAudioHashes = new Set(isR2 ? (main.audioManifest ?? []) : []);
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
// manifest and to know what is confirmed in R2).
async function prepareForCloud(
  data: AppData
): Promise<{
  // The main doc holds everything EXCEPT the journal (which is sharded).
  main: Omit<AppData, "journalEntries"> & CloudMediaMeta;
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
        if (h && (isR2StorageUrl(it) || isWorkerDownloadUrl(it))) {
          cacheMediaUrl(h, it); // already in the cloud (R2 presigned or Worker link)
        } else if (h) {
          // A legacy Firebase URL still contains retrievable bytes. Queue it
          // for the R2 migration; if it has expired, verification reports the
          // hash as broken rather than falsely adding it to the R2 manifest.
          newMap.set(h, it);
        }
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
      mediaProvider: MEDIA_PROVIDER,
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
  const main = snap.data() as AppData & CloudMediaMeta;
  seedKnownMedia(main);
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
  cb: (main: (AppData & CloudMediaMeta) | null) => void
): () => void {
  if (!db) return () => {};
  // Subscribe to the main doc. Every save writes the main doc (its lastUpdated
  // bumps on any edit, journal included), so this fires on any remote change;
  // we then re-read the journal shards to hand back a complete snapshot.
  return onSnapshot(
    doc(db, COLLECTION, uid),
    async (snap) => {
      if (!snap.exists()) return cb(null);
      const main = snap.data() as AppData & CloudMediaMeta;
      seedKnownMedia(main);
      const journalEntries = await loadJournalShards(uid, main);
      cb({ ...main, journalEntries: journalEntries as unknown as JournalEntry[] });
    },
    () => cb(null)
  );
}

// Resolve each entry's refs to a short-lived R2 download URL (cached until just
// before expiry), falling back to the pre-migration Firestore media doc (base64)
// so old photos still appear until the migration tool uploads them to R2.
export async function hydrateCloudPhotos(uid: string, main: AppData): Promise<AppData> {
  if (!db) return main;
  const resolve = async (h: string, sub: MediaKind): Promise<string | null> => {
    const cached = cachedMediaUrl(h);
    if (cached) return cached;
    try {
      const signed = await mediaGateway<{ url: string; expiresAt: number }>(
        uid,
        "/v1/media/download-url",
        { kind: sub, hash: h }
      );
      cacheMediaUrl(h, signed.url, signed.expiresAt);
      return signed.url;
    } catch { /* not in R2 yet — try the legacy Firestore doc */ }
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
  // Locally-held bytes are `data:` URLs — permanent and always render. Cloud
  // pointers are short-lived download links that can expire or fail to load.
  const hasBytes = (arr: (string | undefined)[]) =>
    arr.some((u) => typeof u === "string" && u.startsWith("data:"));
  return {
    ...cloud,
    journalEntries: cloud.journalEntries.map((e) => {
      const kept = localMedia.get(e.id);
      if (!kept) return e;
      const patch: Partial<JournalEntry> = {};
      // Re-attach local media when the cloud entry has none OR when the cloud
      // only carries fragile remote links but we still hold the actual bytes.
      const cloudHasPhotos = !!(e.photo || e.photos?.length);
      const keptHasPhotos = !!(kept.photo || kept.photos?.length);
      if (keptHasPhotos && (!cloudHasPhotos ||
          (hasBytes([kept.photo, ...(kept.photos ?? [])]) && !hasBytes([e.photo, ...(e.photos ?? [])])))) {
        patch.photo = kept.photo;
        patch.photos = kept.photos;
      }
      const cloudHasAudio = !!(e.audio || e.audios?.length);
      const keptHasAudio = !!(kept.audio || kept.audios?.length);
      if (keptHasAudio && (!cloudHasAudio ||
          (hasBytes([kept.audio, ...(kept.audios ?? [])]) && !hasBytes([e.audio, ...(e.audios ?? [])])))) {
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

// Upload local media directly to R2 using a short-lived URL from the Worker.
// The Worker signs the exact Content-Type, rejects declared oversize files,
// then HEAD-verifies the stored size/type before we mark the hash successful.
// A failed file is omitted from the manifest and retried on the next save.
//
// We deliberately NEVER delete from R2 here. The old pass deleted any
// cloud hash not present in `allRefs` — but `allRefs` is only THIS device's
// current snapshot, so a device syncing with a stale/incomplete view would
// destroy a photo another device still references (data loss). Until a proper
// soft-delete + server-side GC exists, unreferenced media simply accumulates;
// that's cheap and safe. The manifest therefore only ever grows (union of what
// we knew was in the cloud and what we just referenced), so no real file is
// ever dropped from it.
async function mediaSourceBlob(source: string): Promise<Blob> {
  const response = await fetch(source);
  if (!response.ok) throw new Error("تعذّر قراءة الوسيط المحلي");
  const blob = await response.blob();
  // The signing gateway normalizes this common alias; send the same canonical
  // value on PUT or the Content-Type-bound signature would intentionally fail.
  if (blob.type.toLowerCase() === "image/jpg") {
    return new Blob([blob], { type: "image/jpeg" });
  }
  return blob;
}

async function uploadMediaToR2(
  syncKey: string,
  kind: MediaKind,
  hash: string,
  source: string
): Promise<void> {
  const blob = await mediaSourceBlob(source);
  const contentType = blob.type.split(";", 1)[0].toLowerCase() || "application/octet-stream";
  // Upload THROUGH the Worker (it writes to R2 via its internal binding) instead
  // of a direct browser→R2 presigned PUT. The direct PUT needed the R2 *bucket's*
  // CORS + S3 signing and failed on iOS with an opaque "Load failed"; this POST
  // rides the Worker's own CORS, which already works (inventory uses it). The
  // bytes are the body; kind/hash/content-type travel as query params.
  const url =
    `${R2_WORKER_URL}/v1/media/put?kind=${kind}&hash=${hash}` +
    `&ct=${encodeURIComponent(contentType)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${syncKey}`, "Content-Type": contentType },
    body: blob,
  });
  if (!res.ok) {
    let message = `R2 Worker returned ${res.status}`;
    try {
      const payload = await res.json() as { error?: string };
      if (payload.error) message = payload.error;
    } catch { /* non-JSON gateway error */ }
    throw new MediaGatewayError(res.status, message);
  }
}

async function syncMediaToR2(
  uid: string,
  sub: MediaKind,
  toUpload: Map<string, string>,
  known: Set<string>
): Promise<{ uploaded: Set<string>; error?: string }> {
  const uploaded = new Set(known);
  const queue = [...toUpload];
  let next = 0;
  let firstError: unknown;
  // A small pool makes a 2000-photo Day One migration practical without
  // flooding the browser, Worker, or R2 with thousands of simultaneous calls.
  const worker = async () => {
    while (next < queue.length) {
      const index = next++;
      const [hash, dataUrl] = queue[index];
      try {
        await uploadMediaToR2(uid, sub, hash, dataUrl);
        uploaded.add(hash);
        urlCache.delete(hash);
      } catch (err) {
        // Continue other files. The honest manifest below excludes this hash,
        // and mediaComplete keeps the UI in "pending" state for a later retry.
        // But remember WHY the first one failed so the UI can name the cause
        // instead of showing a generic "check your connection".
        if (firstError === undefined) firstError = err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  return { uploaded, error: firstError === undefined ? undefined : describeUploadError(firstError) };
}

// Result of a save. `mediaComplete` is false when some referenced photo/voice
// note didn't reach R2 this round (a failed/partial upload) — the
// text doc still saved, but the UI must NOT claim "تمت المزامنة" while media is
// still pending. It's retried on the next save.
export interface SaveResult {
  mediaComplete: boolean;
  // When some media failed to upload, an actionable reason for the first
  // failure (bad R2 key, oversize, CORS/network) — undefined on success.
  uploadError?: string;
}

export async function saveUserData(uid: string, data: AppData): Promise<SaveResult> {
  if (!db) return { mediaComplete: true };
  const { main, cloudJournal, newPhotos, newAudios, photoRefs, audioRefs } = await prepareForCloud(data);

  // 1) Upload new media to R2 first. Text-only edits have none, so this is
  //    a no-op and stays fast.
  const photoUpload = await syncMediaToR2(uid, "photos", newPhotos, knownCloudHashes);
  const audioUpload = await syncMediaToR2(uid, "audios", newAudios, knownCloudAudioHashes);
  knownCloudHashes = photoUpload.uploaded;
  knownCloudAudioHashes = audioUpload.uploaded;
  const uploadError = photoUpload.error ?? audioUpload.error;

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
  return { mediaComplete, uploadError };
}

// The whole main doc (transactions/settings/etc. — media is stored separately
// in R2 and the journal is sharded) lives under Firestore's hard 1MB-per-document
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

// Seed the hash→URL cache from already-hydrated cloud URLs. Expired presigned
// R2 URLs are rejected by cachedMediaUrl and transparently refreshed.
export function primeUrlCache(entries: JournalEntry[]): void {
  for (const e of entries) {
    for (const u of [...(e.photos ?? []), e.photo, ...(e.audios ?? []), e.audio]) {
      if (u && isStorageUrl(u)) {
        const h = hashFromStorageUrl(u);
        if (h) cacheMediaUrl(h, u);
      }
    }
  }
}

// Force a full media migration/re-upload from this device, then verify the R2
// inventory. Existing R2 objects are detected by the Worker and not transferred
// again. Only actual local data URLs can repair a missing object.
export async function reuploadAllMedia(uid: string, data: AppData): Promise<MediaInventory> {
  knownCloudHashes = new Set();
  knownCloudAudioHashes = new Set();
  const result = await saveUserData(uid, data);
  const inventory = await inventoryMedia(uid, data);
  // Carry the concrete upload failure reason (if any) to the UI, so a failed
  // re-upload names its cause instead of a generic "check your connection".
  return { ...inventory, uploadError: result.uploadError };
}

// ===================== Media inventory / verification =====================
// Read-only audit that reconciles what the entries REFERENCE against what
// actually lives in R2 — the check the migration prep requires
// before any restructure (§10). Touches nothing; it only lists and compares.
export interface MediaTypeReport {
  referenced: number;   // distinct hashes referenced by entries
  inCloud: number;      // referenced AND present in R2 (healthy)
  pendingUpload: number;// referenced, not in cloud, but still held locally → will upload
  broken: number;       // referenced, not in cloud, and NO local copy → the file is gone
  orphans: number;      // in R2 but referenced by nothing → safe to ignore/GC later
}
export interface MediaInventory {
  photos: MediaTypeReport;
  audios: MediaTypeReport;
  brokenSamples: string[]; // a few hashes with a missing file, for reference
  // False when R2 couldn't be listed at all (network blocked, offline,
  // a Worker/R2 outage) — so the UI never reports a misleading "0 in cloud" when the
  // truth is "couldn't reach R2". The referenced photos may be perfectly safe
  // in the cloud; we just couldn't see them from here right now.
  storageReachable: boolean;
  // When storageReachable is false, why — so the UI can tell "wrong sync key"
  // (401) apart from "no network". Undefined when reachable.
  storageError?: MediaAccessError;
  // Set by reuploadAllMedia when an upload attempt failed: an actionable reason
  // for the first failing file. Undefined when nothing was uploaded or all did.
  uploadError?: string;
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

async function listCloudHashes(
  uid: string,
  sub: MediaKind
): Promise<{ hashes: Set<string>; ok: boolean; error?: MediaAccessError }> {
  try {
    const res = await mediaGateway<{ hashes: string[] }>(
      uid,
      "/v1/media/inventory",
      { kind: sub }
    );
    return { hashes: new Set(res.hashes), ok: true };
  } catch (err) {
    // couldn't read R2 — NOT "empty". Keep WHY so the UI can distinguish a
    // mismatched sync key (401) from a genuine network problem.
    return { hashes: new Set(), ok: false, error: classifyMediaError(err) };
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
    storageError: cloudPhotos.error ?? cloudAudios.error,
  };
}
