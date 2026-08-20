import {
  doc, getDoc, setDoc, getDocs, collection, onSnapshot, deleteDoc, runTransaction,
} from "firebase/firestore";
import { get as idbGet, set as idbSet } from "idb-keyval";
import { db, getSyncSpace } from "./firebase";
import type { AppData, JournalAttachment, JournalEntry } from "./types";
import { entryPhotos, entryAudios, mergeEntryMedia, stripTombstonedMediaRefs } from "./utils";
import { isStorageUrl, hashFromStorageUrl, photoHash, mediaHashOf, mediaTombKey } from "./mediaHash";
import { MEDIA_CACHE_PREFIX } from "./mediaCache";
import { journalShardId } from "./merge";
import { showToast } from "@/components/ui/UndoToast";

// ===================== Permanent local media store =====================
// The root cure for "broken images": every device keeps the actual bytes of a
// photo/voice note LOCALLY, keyed by its content hash, and displays from there
// forever. The cloud (R2) is only ever used to fetch a hash the ONCE, the first
// time this device sees it. After that, rendering never touches the network — no
// live URL, no expiry, no CORS, nothing left to break. Content hashes are
// immutable, so a cached entry is valid permanently.
// البادئة مصدرُها `mediaCache.ts` — هي مفتاحُ **القراءة عند العرض** أيضاً،
// فلا تُكتب في موضعين (كتابةٌ هنا وقراءةٌ هناك ببادئتين مختلفتين = صورٌ لا
// تُعرض أبداً بلا خطأٍ ظاهر).
async function localMediaGet(hash: string): Promise<string | null> {
  try {
    const v = await idbGet(MEDIA_CACHE_PREFIX + hash);
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

// النسخة الاحتياطية تحتاج قراءة البايتات المحلية مباشرةً قبل محاولة الشبكة:
// قد يكون ملف PDF محفوظاً سليماً في IndexedDB على جهازٍ بلا مفتاح مزامنة، وفي
// هذه الحالة لا يجوز أن يتحول التصدير إلى «مرجع هاش» فقط. لا نُصدّر دالة
// الكتابة عمداً؛ كل الكتابات تبقى عبر مسار المزامنة الموحّد أدناه.
export async function getLocalInlineMedia(hash: string): Promise<string | null> {
  return localMediaGet(hash);
}

async function localMediaPut(hash: string, dataUrl: string): Promise<void> {
  // Best-effort: only inline data: bytes belong in the permanent store (never a
  // transient remote URL), so a later render can rely on it offline.
  if (!dataUrl.startsWith("data:")) return;
  try {
    await idbSet(MEDIA_CACHE_PREFIX + hash, dataUrl);
  } catch { /* quota/availability — rendering still works from the live fetch */ }
}
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Run `fn` over `items` with a bounded number of concurrent tasks. A big Day One
// library holds thousands of photos; firing every download at once (Promise.all
// over all of them) floods the browser/Worker/R2 and can hang the app. A small
// pool keeps memory and sockets bounded while staying fully parallel up to the
// limit. Resolves once every item is done.
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      await fn(items[index]);
    }
  };
  const size = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: size }, worker));
}

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
  // `collection()` تبني المسار **تزامنياً** وترمي على مقطعٍ مخالف. المنادي هنا
  // هو `PendingInboxWatcher` داخل useEffect، فالرمي كان يسقط التطبيق كلَّه.
  // `getSyncSpace()` صارت تمنع ذلك عند المصدر؛ وهذه شبكة الأمان الأخيرة —
  // المزامنة تتعطّل ولا تُسقط التطبيق أبداً.
  let inbox;
  try {
    inbox = collection(db, COLLECTION, space, INBOX);
  } catch {
    return () => {};
  }
  return onSnapshot(
    inbox,
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

interface CloudEntry extends Omit<JournalEntry, "photo" | "photos" | "audio" | "audios"> {
  photoRefs?: string[];
  audioRefs?: string[];
}

const MEDIA_PROVIDER = "r2-v1";
interface CloudMediaMeta {
  photoManifest?: string[];
  audioManifest?: string[];
  mediaProvider?: string;
  // Monotonic write counter on the main doc, bumped in saveUserData's
  // transaction. Absent on legacy docs (treated as 0). The provider reads it to
  // pass expectedRevision on the next save so a concurrent write is caught.
  revision?: number;
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
// Security-rules handshake. Production rules accept journal writes only when
// this marker is present, so a months-old cached client (which writes only
// `{ entries }`) cannot replace or delete a shard before it refreshes itself.
// Bump only when the journal-write contract changes incompatibly.
const JOURNAL_WRITER_VERSION = 2;
const SHARD_WARN_BYTES = 850 * 1024; // warn before a single shard nears 1MB
const SHARD_WRITE_CONCURRENCY = 4;

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

// **التوقيع قانونيّ عمداً** (مفاتيح مرتّبة، ومذكرات مرتّبة بالمعرّف، وبلا
// `undefined`). التوقيع الساذج `JSON.stringify(entries)` كان يقارن نصّين لا
// يتطابقان أبداً ولو كان المحتوى نفسه: Firestore يعيد مفاتيح المستند مرتّبةً
// أبجدياً بينما نكتبها بترتيب الإنشاء، والدمج يعيد ترتيب مصفوفة المذكرات، و
// `ignoreUndefinedProperties` يُسقط الحقول غير المعرَّفة عند الكتابة فتغيب عند
// القراءة. فكانت **كلّ** شهورِ المذكرات تُعاد كتابتها في كلّ حفظ — وهذا وحده
// عشراتُ الكتابات الشبكية على تعديلٍ لا يمسّ المذكرات أصلاً. الترتيب داخل
// المصفوفات (الصور والمراجع) يبقى كما هو لأنّه ذو معنى.
function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v && typeof v === "object") {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) {
      if (src[k] === undefined) continue; // Firestore يُسقطها عند الكتابة
      out[k] = canonicalize(src[k]);
    }
    return out;
  }
  return v;
}
const shardSig = (entries: unknown[]): string => {
  const idOf = (e: unknown) => (e as { id?: string })?.id ?? "";
  return JSON.stringify(
    [...entries]
      .sort((a, b) => (idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0))
      .map(canonicalize)
  );
};

// True when the last shard read completed without an error. When false, the
// snapshot we handed back may be missing a month we couldn't fetch — so the UI
// must show "جزئي" instead of claiming a clean "متزامن". Read via lastShardLoadOk().
let shardLoadOk = true;
export function lastShardLoadOk(): boolean {
  return shardLoadOk;
}

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
  shardLoadOk = true;
  if (db) {
    try {
      const snap = await getDocs(collection(db, COLLECTION, uid, JOURNAL_SUB));
      snap.forEach((d) => {
        const entries = (d.data() as { entries?: CloudEntry[] }).entries ?? [];
        sigs.set(d.id, shardSig(entries));
        for (const e of entries) put(e);
      });
    } catch {
      // Couldn't read the shards (offline / transient). We fall back to legacy
      // inline + local, but flag the load as incomplete so the UI is honest
      // (the returned snapshot may be missing a month we couldn't fetch).
      shardLoadOk = false;
    }
  }
  shardSignatures = sigs;
  return [...byId.values()];
}

// Merge one local shard into the copy currently in Firestore. A device can hold
// an old/partial journal (for example after waking a months-old mobile tab), so
// replacing the whole month from that snapshot is never safe. Cloud-only entries
// survive unless an explicit tombstone is newer than the entry; same-id edits use
// the per-entry stamp and always union their media refs.
function mergeJournalShardEntries(
  local: CloudEntry[],
  remote: CloudEntry[],
  deleted: Record<string, number>,
  deletedMedia: Record<string, number>
): CloudEntry[] {
  const mediaTomb = new Set(Object.keys(deletedMedia));
  const byId = new Map(remote.map((e) => [e.id, e]));
  for (const e of local) {
    const other = byId.get(e.id);
    if (!other) {
      byId.set(e.id, e);
      continue;
    }
    const localNewer = (e.updatedAt ?? 0) > (other.updatedAt ?? 0);
    const base = localNewer ? e : other;
    byId.set(e.id, mergeEntryMedia(base, base === e ? other : e) as CloudEntry);
  }
  return [...byId.values()]
    .filter((e) => {
      const deletedAt = deleted[e.id];
      return deletedAt === undefined || (e.updatedAt ?? 0) > deletedAt;
    })
    .map((e) => stripTombstonedMediaRefs(e, mediaTomb) as CloudEntry);
}

// Write only changed journal shards. Each shard is merged transactionally with
// the current cloud copy, so a stale device is additive: it cannot truncate a
// month, and missing months are never deleted merely because this device did not
// load them. Explicit item tombstones remain the sole deletion authority.
async function writeJournalShards(
  uid: string,
  entries: CloudEntry[],
  deleted: Record<string, number> = {},
  deletedMedia: Record<string, number> = {}
): Promise<void> {
  if (!db) return;
  const database = db; // التضييق يضيع داخل ردّ نداء المجمّع المتوازي أدناه
  const shards = splitJournalShards(entries);
  const nextSigs = new Map<string, string>();
  const changed: Array<[string, CloudEntry[]]> = [];
  for (const [sid, es] of shards) {
    const sig = shardSig(es);
    nextSigs.set(sid, sig);
    if (shardSignatures.get(sid) === sig) continue; // unchanged → skip write
    const bytes = new Blob([sig]).size;
    if (bytes >= SHARD_WARN_BYTES) warnShardNearLimit(sid, bytes);
    changed.push([sid, es]);
  }
  // الشهور المتغيّرة تُكتب على التوازي بحدٍّ صغير بدل انتظار كلٍّ منها على حدة:
  // استيرادٌ يمسّ عشرين شهراً كان عشرين رحلةَ شبكةٍ **متسلسلة**.
  const mergedSigs = new Map<string, string>();
  await mapWithConcurrency(changed, SHARD_WRITE_CONCURRENCY, async ([sid, es]) => {
    const sig = await runTransaction(database, async (txn) => {
      const ref = doc(database, COLLECTION, uid, JOURNAL_SUB, sid);
      const snap = await txn.get(ref);
      const remote = snap.exists()
        ? ((snap.data() as { entries?: CloudEntry[] }).entries ?? [])
        : [];
      const merged = mergeJournalShardEntries(es, remote, deleted, deletedMedia);
      const mergedSig = shardSig(merged);
      if (mergedSig !== shardSig(remote)) {
        txn.set(ref, { entries: merged, writerVersion: JOURNAL_WRITER_VERSION }, { merge: false });
      }
      return mergedSig;
    });
    mergedSigs.set(sid, sig);
  });
  // Preserve signatures for cloud-only months. Forgetting them made a partial
  // device believe those months had vanished and delete them on its next save.
  shardSignatures = new Map([...shardSignatures, ...nextSigs, ...mergedSigs]);
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
  data: AppData,
  knownPhotos: Set<string>,
  knownAudios: Set<string>
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
  // Media the user deleted — keyed by entry+kind+hash so a shared photo removed
  // from one entry is dropped ONLY there. Never re-reference or re-upload it,
  // even if a merge left its bytes on a filled entry. This is the authoritative
  // save-side guard that keeps a single-photo deletion from reaching R2.
  const mediaTomb = new Set(Object.keys(data.deletedMedia ?? {}));

  const attach = async (
    items: string[],
    newMap: Map<string, string>,
    allRefs: Set<string>,
    known: Set<string>,
    isDeleted: (hash: string) => boolean
  ): Promise<string[]> => {
    const refs: string[] = [];
    for (const it of items) {
      let h: string | null;
      if (isStorageUrl(it)) {
        h = hashFromStorageUrl(it);
      } else {
        h = await photoHash(it);
      }
      if (!h || isDeleted(h)) continue; // unknown, or a deleted photo → drop
      if (isStorageUrl(it)) {
        if (isR2StorageUrl(it) || isWorkerDownloadUrl(it)) {
          cacheMediaUrl(h, it); // already in the cloud (R2 presigned or Worker link)
        } else if (!known.has(h)) {
          // A legacy Firebase URL still contains retrievable bytes. Queue it
          // for the R2 migration; if it has expired, verification reports the
          // hash as broken rather than falsely adding it to the R2 manifest.
          newMap.set(h, it);
        }
      } else if (!known.has(h)) {
        // بايتاتٌ محلّية (data:) **لم نتأكّد بعد أنّها في R2** → ترفع.
        // الشرط `!known.has(h)` هو بيت القصيد: بعد الترطيب تصير كلّ صورةٍ في
        // المتجر `data:`، فبلا هذا الحارس كان كلُّ حفظ يعيد رفع **كامل** وسائط
        // الجهاز إلى R2 — ميغابايتاتٌ على كل تعديل نصّي، وهي السبب الأول لبطء
        // المزامنة. المانيفست (`photoManifest`) هو ما يثبت وجودها، ويُقرأ من
        // المستند الرئيس في كلّ جلسة؛ ولإجبار رفعٍ كامل ثمّة `reuploadAllMedia`
        // (تُفرّغ المجموعتين أولاً) للإصلاح عند شكٍّ في ضياع ملف.
        newMap.set(h, it);
        void localMediaPut(h, it); // keep our own bytes locally → never re-fetch
      }
      refs.push(h); allRefs.add(h);
    }
    return refs;
  };

  // Fold any refs a partial hydrate kept on the entry (bytes that R2 couldn't
  // hand us this session) into the emitted refs, so an object that's already in
  // the cloud but not yet re-downloaded here is never dropped from the entry —
  // which would leave it orphaned in R2 (referenced by nothing).
  const mergeSurviving = (refs: string[], surviving: string[], allRefs: Set<string>): void => {
    for (const h of surviving) {
      if (!refs.includes(h)) { refs.push(h); allRefs.add(h); }
    }
  };
  const journalEntries = await Promise.all(
    data.journalEntries.map(async (e): Promise<CloudEntry> => {
      const src = e as JournalEntry & MediaOrderFields;
      const imgs = entryPhotos(e);
      const auds = entryAudios(e);
      // This entry's own delete-guards (a photo deleted elsewhere doesn't count).
      const photoDeleted = (h: string) => mediaTomb.has(mediaTombKey(src.id, "photos", h));
      const audioDeleted = (h: string) => mediaTomb.has(mediaTombKey(src.id, "audios", h));
      const attachmentDeleted = (h: string) => mediaTomb.has(mediaTombKey(src.id, "attachments", h));
      // Drop any surviving ref the user has since deleted from THIS entry.
      const survivingPhotoRefs = (src.photoRefs ?? []).filter((h) => !photoDeleted(h));
      const survivingAudioRefs = (src.audioRefs ?? []).filter((h) => !audioDeleted(h));
      const { photo: _p, photos: _ps, audio: _a, audios: _as,
              photoRefs: _pr, audioRefs: _aur, photoOrder: _po, audioOrder: _ao,
              attachmentRefs: _attachments, ...rest } = src;
      // PDF bytes use the existing private `photos` R2 bucket for backwards
      // compatibility with the Day One preview references. Only the hash and
      // metadata go to Firestore; `localData` stays on this device and is queued
      // for the same content-addressed upload path as a photo.
      const cloudAttachments: JournalAttachment[] = [];
      for (const attachment of src.attachmentRefs ?? []) {
        let hash = attachment.hash;
        if (attachment.localData) {
          const localHash = await photoHash(attachment.localData);
          // Never trust a stale local hash over the bytes currently held.
          hash = localHash;
          if (!attachmentDeleted(hash) && !knownPhotos.has(hash)) {
            newPhotos.set(hash, attachment.localData);
          }
          void localMediaPut(hash, attachment.localData);
        }
        if (hash && attachmentDeleted(hash)) continue;
        if (hash) photoRefs.add(hash); // included in the existing photos manifest
        const { localData: _localData, ...metadata } = attachment;
        cloudAttachments.push({ ...metadata, ...(hash ? { hash } : {}) });
      }
      const out: CloudEntry = {
        ...rest,
        ...(cloudAttachments.length ? { attachmentRefs: cloudAttachments } : {}),
      };
      if (imgs.length || survivingPhotoRefs.length) {
        const refs = await attach(imgs, newPhotos, photoRefs, knownPhotos, photoDeleted);
        mergeSurviving(refs, survivingPhotoRefs, photoRefs);
        // Restore the original order so a survivor lands back in its slot.
        if (refs.length) out.photoRefs = orderRefs(refs, src.photoOrder);
      }
      if (auds.length || survivingAudioRefs.length) {
        const refs = await attach(auds, newAudios, audioRefs, knownAudios, audioDeleted);
        mergeSurviving(refs, survivingAudioRefs, audioRefs);
        if (refs.length) out.audioRefs = orderRefs(refs, src.audioOrder);
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

// ===================== القراءة على مرحلتين (المستند الرئيس ثمّ الshards) ====
// كلّ ما تحتاجه أسئلةُ «هل تحرّكت السحابة؟» (`lastUpdated` و`revision`
// و`photoManifest`) يعيش في **المستند الرئيس وحده**. أمّا الshards فهي كلّ
// المذكرات — ميغابايتات عند مكتبة Day One كبيرة.
//
// كان كلُّ حفظ وكلُّ إشعارٍ من المستمع الحيّ ينزّل **المجموعة كاملة** قبل أن
// يسأل السؤال أصلاً: تعديلٌ واحد على مصروف = تنزيلُ كامل المذكرات مرّتين أو
// ثلاثاً (قراءةُ ما قبل الحفظ، ثمّ صدى كتابتنا نحن في المستمع). وهذا — مع
// إعادة رفع الوسائط وإعادة كتابة كلّ الshards — هو ثالوث بطء المزامنة.
//
// الآن: `readCloudMain` تقرأ مستنداً واحداً، و`full()` تنزّل الshards **عند
// الحاجة فقط** (أي حين يثبت أنّ السحابة تحرّكت فعلاً فسندمج). `full()` مُذكَّرة
// فلا تنزّل مرّتين للإشعار الواحد.
export interface CloudRead {
  /** المستند الرئيس كما هو — **بلا** مذكرات الshards (قد يحمل مذكراتٍ قديمة مضمّنة). */
  main: AppData & CloudMediaMeta;
  /** اللقطة الكاملة: المستند الرئيس + كلّ shards المذكرات (رحلةُ شبكةٍ إضافية). */
  full: () => Promise<AppData & CloudMediaMeta>;
}

function cloudRead(uid: string, main: AppData & CloudMediaMeta): CloudRead {
  seedKnownMedia(main);
  let pending: Promise<AppData & CloudMediaMeta> | null = null;
  return {
    main,
    full: () => {
      // Journal lives in shards now; fold them (and any legacy inline entries)
      // back into journalEntries so the rest of the app sees one flat list.
      pending ??= loadJournalShards(uid, main).then((journalEntries) => ({
        ...main,
        journalEntries: journalEntries as unknown as JournalEntry[],
      }));
      return pending;
    },
  };
}

// The main doc alone — one document read, no journal shards. Seeds the
// known-hash cache from the manifest so a save that follows doesn't re-upload
// media that's already in R2.
export async function readCloudMain(uid: string): Promise<CloudRead | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, COLLECTION, uid));
  if (!snap.exists()) {
    knownCloudHashes = new Set();
    knownCloudAudioHashes = new Set();
    shardSignatures = new Map();
    return null;
  }
  return cloudRead(uid, snap.data() as AppData & CloudMediaMeta);
}

// Main doc + journal shards (no photo bytes — entries still carry photoRefs,
// resolved later by hydrateCloudPhotos). Seeds the known-hash cache from the
// manifest and the shard-signature cache so a subsequent save diffs correctly.
export async function loadUserMain(uid: string): Promise<(AppData & CloudMediaMeta) | null> {
  const read = await readCloudMain(uid);
  return read ? read.full() : null;
}

// Live-subscribe to the shared main doc so edits made on another device show
// up here automatically. Fires with the main doc only (a two-stage read: see
// CloudRead) — the caller decides from `lastUpdated`/`revision` whether this is
// a change worth adopting and, only then, awaits `full()` to pull the journal
// shards and hydrate. Returns an unsubscribe function.
export function subscribeUserMain(
  uid: string,
  cb: (read: CloudRead | null) => void
): () => void {
  if (!db) return () => {};
  // Every save writes the main doc (its lastUpdated bumps on any edit, journal
  // included), so this fires on any remote change — **and on the echo of our
  // own write**, which is precisely the case that must stay cheap.
  // نفس شبكة الأمان التي في `subscribeInbox`: بناء المسار تزامنيّ، والمنادي
  // `SyncProvider` داخل useEffect — فلا يُسمح لخطأ مسارٍ بإسقاط التطبيق.
  let main;
  try {
    main = doc(db, COLLECTION, uid);
  } catch {
    return () => {};
  }
  return onSnapshot(
    main,
    (snap) => {
      if (!snap.exists()) return cb(null);
      cb(cloudRead(uid, snap.data() as AppData & CloudMediaMeta));
    },
    () => cb(null)
  );
}

// Resolve each entry's refs to a short-lived R2 download URL (cached until just
// before expiry), falling back to the pre-migration Firestore media doc (base64)
// so old photos still appear until the migration tool uploads them to R2.
// Resolve one hash to permanent inline bytes: local copy first, else fetch the
// bytes ONCE from R2 (or the legacy Firestore doc) and keep them forever. Returns
// a `data:` URL so rendering never again depends on a live URL, expiry, or CORS.
// `mediaKey` authenticates to the R2 gateway; `uid` is still the Firestore
// path segment for the legacy fallback below. They default to the same value
// (today's behavior on every device — see src/lib/keyDerivation.ts) but a
// caller that has opted into separated data/media keys passes its own
// derived media subkey here instead.
// مُصدَّرة ليحقنها `SyncProvider` في `mediaCache.ts` جالباً احتياطياً: مرجعٌ
// بايتاته ليست على الجهاز بعد (جهازٌ جديد، أو وسيطٌ تجاوز ميزانية الترطيب)
// يُنزَّل عند أول عرضٍ له ويُحفظ محلياً — فلا يظهر فراغٌ صامت ولا تتكرّر الرحلة.
export async function fetchInlineMedia(
  uid: string,
  sub: MediaKind,
  h: string,
  mediaKey: string = uid
): Promise<string | null> {
  const local = await localMediaGet(h);
  if (local) return local;
  try {
    const signed = await mediaGateway<{ url: string; expiresAt: number }>(
      mediaKey,
      "/v1/media/download-url",
      { kind: sub, hash: h }
    );
    const res = await fetch(signed.url);
    if (res.ok) {
      const dataUrl = await blobToDataUrl(await res.blob());
      await localMediaPut(h, dataUrl);
      return dataUrl;
    }
  } catch { /* not in R2 yet — try the legacy Firestore doc */ }
  try {
    const snap = await getDoc(doc(db!, COLLECTION, uid, sub, h));
    if (snap.exists()) {
      const data = (snap.data() as { data: string }).data;
      await localMediaPut(h, data);
      return data;
    }
  } catch { /* ignore */ }
  return null;
}

// Final display guarantee, applied AFTER merging: replace every remaining remote
// media URL on an entry with permanent local bytes (from cache, or downloaded
// once). This fixes the case where a merge kept a device's entry whose photo was
// a stale/broken cloud URL — the bytes exist (same content hash), so we swap the
// link for the real image and it renders offline forever after.
export async function inlineCachedMedia<T extends Partial<AppData>>(
  uid: string,
  data: T,
  mediaKey: string = uid
): Promise<T> {
  if (!data.journalEntries) return data;
  // A photo the user deleted can be filled back onto an entry by a merge (from a
  // copy that still has it). Drop such media here — the final pass before the
  // store hydrates — so a deletion doesn't visibly resurrect.
  const tomb = new Set(Object.keys(data.deletedMedia ?? {}));
  const inlineOne = async (u: string | undefined, sub: MediaKind, entryId: string): Promise<string | undefined> => {
    if (!u) return u;
    if (tomb.size) {
      const h = await mediaHashOf(u);
      if (h && tomb.has(mediaTombKey(entryId, sub, h))) return undefined; // deleted here → drop
    }
    if (u.startsWith("data:") || !isStorageUrl(u)) return u;
    const h = hashFromStorageUrl(u);
    if (!h) return u;
    return (await fetchInlineMedia(uid, sub, h, mediaKey)) ?? u;
  };
  const inlineList = async (list: string[], sub: MediaKind, entryId: string) =>
    (await Promise.all(list.map((u) => inlineOne(u, sub, entryId)))).filter(Boolean) as string[];
  const journalEntries = await Promise.all(
    data.journalEntries.map(async (e) => {
      const patch: Partial<JournalEntry> = {};
      if (e.photos?.length) {
        const photos = await inlineList(e.photos, "photos", e.id);
        patch.photos = photos;
        patch.photo = photos[0]; // keep the legacy single field consistent
      } else if (e.photo) {
        patch.photo = await inlineOne(e.photo, "photos", e.id);
      }
      if (e.audios?.length) {
        const audios = await inlineList(e.audios, "audios", e.id);
        patch.audios = audios;
        patch.audio = audios[0];
      } else if (e.audio) {
        patch.audio = await inlineOne(e.audio, "audios", e.id);
      }
      return Object.keys(patch).length ? { ...e, ...patch } : e;
    })
  );
  return { ...data, journalEntries };
}

// How many media downloads hydrate runs at once. Bounded so a large import
// can't fire thousands of simultaneous R2 fetches (see mapWithConcurrency).
const HYDRATE_CONCURRENCY = 6;

// ===================== ميزانية الترطيب (سقفٌ للذاكرة) =====================
// كان الترطيب بلا سقفِ **حجم** إطلاقاً — سقف التزامن أعلاه يحدّ عدد الطلبات
// المتوازية لا حجم ما يبقى في الذاكرة. فكان يجمع بايتات **كل** وسائط المكتبة
// في `Map` واحد ثمّ يحشرها كلها داخل لقطة المتجر، فتُسلسَل نصّ JSON واحداً في
// IndexedDB. أرشيف Day One حقيقيّ (2113 وسيطاً ≈ 692 ميغابايت base64) يعني في
// الذروة: الـMap + نصّ اللقطة + الكائنات المفكوكة — أضعاف ذلك. ميزانية تبويب
// الجوال مئات الميغابايت، فيقتله المتصفح ويعيد الكرّة كل إقلاع.
//
// السقف هنا **لا يُسقط شيئاً**: ما تجاوز الميزانية يبقى مرجعَ هاشٍ على المذكرة
// (`keep` + `photoOrder` أدناه — نفس مسار «تعذّر الجلب» الموجود والمختبَر
// أصلاً)، وبايتاته محفوظةٌ كما هي في مخزن الهاش المحليّ (`madar-media:<hash>`)
// وفي R2. فلا فقدَ بيانات ولا يُتْمَ كائناتٍ في R2، والحفظ التالي يعيد كتابة
// المرجع في موضعه الصحيح.
//
// الأولوية للأحدث: المذكرات تُرتّب تنازلياً بالتاريخ قبل جمع المراجع، فما يدخل
// الميزانية هو ما يفتحه المالك فعلاً أولاً.
// أول صفحة في السجل تعرض 40 مذكرة فقط، وما وراءها يملكه مسار الجلب الكسول
// الآمن في `mediaCache.ts`. لذلك لا معنى لتنزيل 400 وسيط عند كل جهاز جديد:
// كان ذلك يضيف مئات الميغابايت إلى IndexedDB قبل أن يطلب المالك صورةً واحدة.
// نُمهّد أحدث صفحة تقريباً، بسقف 8MB، ثم تُجلب بقية الصور عند ظهورها وتُخزّن
// مرةً واحدة بالهاش. هذا يخفّف الإقلاع من دون إسقاط مرجع أو بايتة من السحابة.
const HYDRATE_MAX_ITEMS = 48;
const HYDRATE_MAX_BYTES = 8 * 1024 * 1024;

// Local-only, never written to the cloud: the original ref order an entry had
// when hydrate couldn't resolve one of its photos. prepareForCloud reads it to
// re-sort the emitted refs, then strips it. (The cloud's own photoRefs array is
// the ordered source of truth; this just bridges a partial hydrate → save.)
interface MediaOrderFields {
  photoRefs?: string[];
  audioRefs?: string[];
  photoOrder?: string[];
  audioOrder?: string[];
}

const photoRefsOf = (e: CloudEntry & { audioRef?: string }): string[] => e.photoRefs ?? [];
// Back-compat: older docs stored a single audioRef; newer store audioRefs.
const audioRefsOf = (e: CloudEntry & { audioRef?: string }): string[] =>
  e.audioRefs ?? (e.audioRef ? [e.audioRef] : []);

// Reorder `refs` to follow `order` (the entry's original ref sequence). Hashes
// present in `order` take their original position; any not in it (a photo the
// user added after the partial hydrate) keep their relative order at the end.
// Delete-safe: a ref dropped from `refs` simply doesn't appear — order of the
// rest is preserved. A no-op when there's no stashed order.
function orderRefs(refs: string[], order?: string[]): string[] {
  if (!order?.length) return refs;
  const pos = new Map(order.map((h, i) => [h, i]));
  return refs
    .map((h, i) => ({ h, key: pos.has(h) ? pos.get(h)! : order.length + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.h);
}

export async function hydrateCloudPhotos(
  uid: string,
  main: AppData,
  mediaKey: string = uid
): Promise<AppData> {
  if (!db) return main;

  // 1) Collect every (kind, hash) referenced across ALL entries and resolve the
  //    distinct ones through a single bounded pool. Deduping means a photo shared
  //    by several entries is fetched once, and the pool caps concurrency so a
  //    thousands-strong Day One library can't hang the app.
  const jobs = new Map<string, MediaKind>(); // `${kind}:${hash}` → kind
  // الأحدث أولاً — الترتيب هو الأولوية حين تنفد الميزانية أدناه. نسخةٌ سطحية:
  // `main.journalEntries` ترتيبها ليس مضموناً ولا يجوز أن نقلبه للمنادي.
  const byNewest = [...main.journalEntries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const e of byNewest) {
    const ce = e as CloudEntry & { audioRef?: string };
    for (const h of photoRefsOf(ce)) jobs.set(`photos:${h}`, "photos");
    for (const h of audioRefsOf(ce)) jobs.set(`audios:${h}`, "audios");
  }
  const resolved = new Map<string, string>(); // `${kind}:${hash}` → data: URL
  // الميزانية تُحسب على البايتات المُرطَّبة فعلاً لا على تقديرٍ مسبق (لا نعرف
  // حجم الوسيط قبل قراءته). سقف العدد يحدّ عدد الطلبات أصلاً، وسقف البايتات
  // يوقف الإضافة فور تجاوزها — تجاوزٌ طفيف بمقدار الطلبات الجارية مقبول.
  let hydratedBytes = 0;
  const budgeted = [...jobs.entries()].slice(0, HYDRATE_MAX_ITEMS);
  await mapWithConcurrency(budgeted, HYDRATE_CONCURRENCY, async ([key, kind]) => {
    if (hydratedBytes >= HYDRATE_MAX_BYTES) return; // الباقي يبقى مرجعاً
    const hash = key.slice(kind.length + 1);
    const url = await fetchInlineMedia(uid, kind, hash, mediaKey);
    if (!url) return;
    if (hydratedBytes >= HYDRATE_MAX_BYTES) return; // نفدت أثناء الجلب
    hydratedBytes += url.length;
    resolved.set(key, url);
  });

  // 2) Rebuild each entry from the resolved map. CRITICAL: a ref whose bytes we
  //    couldn't fetch this time (R2 hiccup, offline) is KEPT on the entry as a
  //    ref — never silently dropped. Dropping it would return the memo with no
  //    photo AND no pointer, so the next save (prepareForCloud) writes it with
  //    no ref and the object is orphaned in R2. Keeping the ref means the photo
  //    re-hydrates on the next successful load and the object stays owned.
  // Bytes this device holds that the refs don't cover yet — a photo added here
  // and not uploaded (or not yet re-read) when this entry ALSO carries cloud
  // refs, which is exactly the shape a merge produces. Replacing `photos` with
  // the resolved refs alone would drop it from view until the next full load.
  // Hashing is memoized and only runs for the few entries that have both.
  const keepUncovered = async (items: string[], refs: string[]): Promise<string[]> => {
    const inline = items.filter((u) => u.startsWith("data:"));
    if (!inline.length) return [];
    const covered = new Set(refs);
    const out: string[] = [];
    for (const u of inline) {
      const h = await photoHash(u);
      if (!covered.has(h)) out.push(u);
    }
    return out;
  };
  const journalEntries = await Promise.all(main.journalEntries.map(async (e) => {
    const ce = e as CloudEntry & { audioRef?: string; photoOrder?: string[]; audioOrder?: string[] };
    const refs = photoRefsOf(ce);
    const arefs = audioRefsOf(ce);
    const { photoRefs: _r, audioRefs: _ars, audioRef: _ar,
            photoOrder: _po, audioOrder: _ao, ...rest } = ce;
    let out = rest as JournalEntry & MediaOrderFields;
    if (refs.length) {
      const imgs = refs.map((h) => resolved.get(`photos:${h}`)).filter(Boolean) as string[];
      const extra = await keepUncovered(entryPhotos(e), refs);
      const all = [...imgs, ...extra];
      if (all.length) out = { ...out, photos: all, photo: all[0] };
      const keep = refs.filter((h) => !resolved.has(`photos:${h}`));
      // Some refs survived unresolved → stash the FULL original order so the
      // next save can splice the survivor back into its slot instead of tacking
      // it onto the end (which would silently reorder the entry's photos).
      if (keep.length) out = { ...out, photoRefs: keep, photoOrder: refs };
    }
    if (arefs.length) {
      const auds = arefs.map((h) => resolved.get(`audios:${h}`)).filter(Boolean) as string[];
      const extra = await keepUncovered(entryAudios(e), arefs);
      const all = [...auds, ...extra];
      if (all.length) out = { ...out, audios: all, audio: all[0] };
      const keep = arefs.filter((h) => !resolved.has(`audios:${h}`));
      if (keep.length) out = { ...out, audioRefs: keep, audioOrder: arefs };
    }
    return out as JournalEntry;
  }));
  return { ...main, journalEntries };
}

// Back-compat: load everything in one call (used where photos are wanted).
export async function loadUserData(uid: string, mediaKey: string = uid): Promise<AppData | null> {
  const main = await loadUserMain(uid);
  if (!main) return null;
  return hydrateCloudPhotos(uid, main, mediaKey);
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
export { mergeAppData, applyTombstones } from "./merge";

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
  known: Set<string>,
  mediaKey: string = uid
): Promise<{ uploaded: Set<string>; error?: string }> {
  const uploaded = new Set(known);
  // حارسٌ ثانٍ بجانب حارس `prepareForCloud`: لا نرفع أبداً هاشاً يثبت المانيفست
  // وجودَه في R2. (المحتوى معنونٌ بالهاش، فالوجود يعني التطابق.)
  const queue = [...toUpload].filter(([hash]) => !known.has(hash));
  let next = 0;
  let firstError: unknown;
  // A small pool makes a 2000-photo Day One migration practical without
  // flooding the browser, Worker, or R2 with thousands of simultaneous calls.
  const worker = async () => {
    while (next < queue.length) {
      const index = next++;
      const [hash, dataUrl] = queue[index];
      try {
        await uploadMediaToR2(mediaKey, sub, hash, dataUrl);
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
  // The main doc's revision AFTER this save. The caller stores it and passes it
  // back as `expectedRevision` on the next save so a concurrent write is caught.
  revision: number;
}

// Thrown by saveUserData when the main doc's revision moved past what the caller
// based its write on — another device wrote in between. The caller must re-read
// the cloud, re-merge its local snapshot, and retry the save. Nothing was
// written to the main doc (the transaction aborted); shards/media are additive.
export class RevisionConflictError extends Error {
  constructor(public cloudRevision: number) {
    super("revision conflict");
    this.name = "RevisionConflictError";
  }
}

export async function saveUserData(
  uid: string,
  data: AppData,
  expectedRevision?: number,
  mediaKey: string = uid
): Promise<SaveResult> {
  if (!db) return { mediaComplete: true, revision: 0 };
  const database = db;
  const { main, cloudJournal, newPhotos, newAudios, photoRefs, audioRefs } =
    await prepareForCloud(data, knownCloudHashes, knownCloudAudioHashes);

  // 1) Upload new media to R2 first. Text-only edits have none, so this is
  //    a no-op and stays fast.
  const photoUpload = await syncMediaToR2(uid, "photos", newPhotos, knownCloudHashes, mediaKey);
  const audioUpload = await syncMediaToR2(uid, "audios", newAudios, knownCloudAudioHashes, mediaKey);
  knownCloudHashes = photoUpload.uploaded;
  knownCloudAudioHashes = audioUpload.uploaded;
  const uploadError = photoUpload.error ?? audioUpload.error;

  // 2) Write the journal shards (only the ones that changed) — this is what
  //    keeps the journal off the 1MB single-doc cap. Then write the main doc
  //    (no journal inline) with a manifest of only what actually reached the
  //    cloud, so any media that didn't upload is retried on the next save.
  await writeJournalShards(uid, cloudJournal, data.deleted ?? {}, data.deletedMedia ?? {});
  const honestMain = {
    ...main,
    photoManifest: [...knownCloudHashes],
    audioManifest: [...knownCloudAudioHashes],
  };
  warnIfDocSizeNearLimit(honestMain);

  // 3) Write the main doc through a transaction that bumps a monotonic
  //    `revision`. When `expectedRevision` is given (a debounced push that read
  //    the cloud a while ago), the transaction aborts with RevisionConflictError
  //    if another device advanced the revision since — closing the read-merge-
  //    write race on the MAIN DOC (its scope; shards/media stay additive and
  //    reconcile on the next merge). Legacy docs without a revision read as 0.
  const revision = await runTransaction(database, async (txn) => {
    const ref = doc(database, COLLECTION, uid);
    const snap = await txn.get(ref);
    const current = snap.exists() ? Number((snap.data() as { revision?: number }).revision ?? 0) : 0;
    if (expectedRevision !== undefined && current !== expectedRevision) {
      throw new RevisionConflictError(current);
    }
    const nextRevision = current + 1;
    txn.set(ref, { ...honestMain, revision: nextRevision }, { merge: false });
    return nextRevision;
  });

  // Honest signal: did every referenced photo/audio actually land in the cloud?
  const allIn = (refs: Set<string>, known: Set<string>) => [...refs].every((h) => known.has(h));
  const mediaComplete =
    allIn(photoRefs, knownCloudHashes) && allIn(audioRefs, knownCloudAudioHashes);
  return { mediaComplete, uploadError, revision };
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
export async function reuploadAllMedia(
  uid: string,
  data: AppData,
  mediaKey: string = uid
): Promise<MediaInventory> {
  knownCloudHashes = new Set();
  knownCloudAudioHashes = new Set();
  const result = await saveUserData(uid, data, undefined, mediaKey);
  const inventory = await inventoryMedia(uid, data, mediaKey);
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
  sub: MediaKind,
  mediaKey: string = uid
): Promise<{ hashes: Set<string>; ok: boolean; error?: MediaAccessError }> {
  try {
    const res = await mediaGateway<{ hashes: string[] }>(
      mediaKey,
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

// Fold pending content-hash refs (media this device holds only as a ref — the
// bytes weren't re-downloaded from R2 this session) into the referenced map as
// cloud-sourced. Without this the audit ignores them: a photo that's perfectly
// safe in R2 gets miscounted as an orphan, and the "referenced" total is short.
function addPendingRefs(refs: Map<string, "local" | "cloud">, pending: Set<string>): void {
  for (const h of pending) if (!refs.has(h)) refs.set(h, "cloud");
}

export async function inventoryMedia(
  uid: string,
  data: AppData,
  mediaKey: string = uid
): Promise<MediaInventory> {
  const photoItems: string[] = [];
  const audioItems: string[] = [];
  const pendingPhotoRefs = new Set<string>();
  const pendingAudioRefs = new Set<string>();
  for (const e of data.journalEntries) {
    photoItems.push(...entryPhotos(e));
    audioItems.push(...entryAudios(e));
    const ce = e as { photoRefs?: string[]; audioRefs?: string[] };
    for (const h of ce.photoRefs ?? []) pendingPhotoRefs.add(h);
    for (const h of ce.audioRefs ?? []) pendingAudioRefs.add(h);
    for (const attachment of e.attachmentRefs ?? []) {
      if (attachment.localData) photoItems.push(attachment.localData);
      if (attachment.hash) pendingPhotoRefs.add(attachment.hash);
    }
  }
  const [photoRefs, audioRefs, cloudPhotos, cloudAudios] = await Promise.all([
    referencedHashes(photoItems),
    referencedHashes(audioItems),
    listCloudHashes(uid, "photos", mediaKey),
    listCloudHashes(uid, "audios", mediaKey),
  ]);
  addPendingRefs(photoRefs, pendingPhotoRefs);
  addPendingRefs(audioRefs, pendingAudioRefs);
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

// ===================== تكامل «مستورد الذكريات» (.madarimport) =====================
// جسر src/lib/madarBridge.ts يحلّل الملف ويستخرج كل هاشات الوسائط التي
// تدّعي مذكراته أنها رفعتها لـR2 مسبقاً — لكنه لا يلمس R2 نفسه (بلا Firebase
// عمداً هناك). هذه الدالة هي البوابة الوحيدة التي تتحقق فعلياً: تسأل الـWorker
// عمّا هو موجودٌ حقاً تحت kind=photos/audios، ولا تسمح بإنشاء **أي** مذكرة ما
// لم يثبت أن كل هاشٍ مرجعيّ موجودٌ فعلاً — نقصُ هاشٍ واحد يوقف العملية كاملة
// (DayOneImport.tsx يستدعيها قبل أي importDayOneEntries، لا بعده).
export interface MediaHashVerification {
  ok: boolean;
  // R2 قابلٌ للوصول والهاشات كلها موجودة.
  missingPhotos: string[];
  missingAudios: string[];
  // false إن تعذّر سؤال R2 أصلاً (شبكة/مفتاح خطأ) — عندها القوائم أعلاه فارغة
  // بالضرورة، لكن ذلك لا يعني «كل شيء موجود»؛ يعني أننا لا نعرف، فنرفض المتابعة.
  reachable: boolean;
  error?: MediaAccessError;
}

export async function verifyMediaHashesPresent(
  mediaKey: string,
  photoHashes: string[],
  audioHashes: string[]
): Promise<MediaHashVerification> {
  const [cloudPhotos, cloudAudios] = await Promise.all([
    listCloudHashes(mediaKey, "photos", mediaKey),
    listCloudHashes(mediaKey, "audios", mediaKey),
  ]);
  const reachable = cloudPhotos.ok && cloudAudios.ok;
  const missingPhotos = reachable ? photoHashes.filter((h) => !cloudPhotos.hashes.has(h)) : [...photoHashes];
  const missingAudios = reachable ? audioHashes.filter((h) => !cloudAudios.hashes.has(h)) : [...audioHashes];
  return {
    ok: reachable && missingPhotos.length === 0 && missingAudios.length === 0,
    missingPhotos,
    missingAudios,
    reachable,
    error: cloudPhotos.error ?? cloudAudios.error,
  };
}

// عنوان الـWorker العام — يُقرأ من نفس متغيّر البيئة الذي تبني منه هذه الوحدة
// R2_WORKER_URL، ليضمّه زر «نسخ إعدادات الاتصال» في DayOneImport.tsx إلى
// الحمولة التي يرسلها مستورد الذكريات مباشرةً بلا حاجةٍ لتخمينه يدوياً. ليس
// سرّاً (Public Worker endpoint فقط، كما في تعليق R2_WORKER_URL أعلاه).
export function getR2WorkerUrl(): string {
  return R2_WORKER_URL;
}
