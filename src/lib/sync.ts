import {
  doc, getDoc, setDoc, getDocs, collection, writeBatch, onSnapshot, deleteDoc,
} from "firebase/firestore";
import { db, SYNC_SPACE_ID } from "./firebase";
import type { AppData, JournalEntry } from "./types";
import { entryPhotos } from "./utils";

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
  if (!db) return [];
  const snap = await getDocs(collection(db, COLLECTION, SYNC_SPACE_ID, INBOX));
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return { id: d.id, text: decodeInboxText(data), ts: typeof data.ts === "string" ? data.ts : undefined };
  });
}

export async function deleteInboxItem(id: string): Promise<void> {
  if (!db) return;
  await deleteDoc(doc(db, COLLECTION, SYNC_SPACE_ID, INBOX, id));
}

// ===================== Photo cloud sync =====================
// Firestore caps a single document at 1MB, so we can't cram every journal
// photo into the one userData doc. Instead each photo lives in its own doc
// under userData/{uid}/photos/{hash} (keyed by content hash → automatic
// dedup), the main doc carries only lightweight `photoRefs` (hashes) on
// each entry plus a `photoManifest` listing every hash currently in the
// cloud. This scales to thousands of photos and syncs them across devices.

// Hashes we believe already exist in the cloud — seeded from the main doc's
// manifest on load, so a save only uploads new media and deletes removed
// ones instead of re-writing everything each time. Photos and voice notes
// each get their own subcollection + manifest.
let knownCloudHashes = new Set<string>();
let knownCloudAudioHashes = new Set<string>();

// A photo's bytes are immutable, so its content hash never changes. Memoize
// data→hash so a save re-hashes only genuinely new images instead of every
// photo of every entry on every (debounced, ~1.5s) save — the SHA-256 pass
// over hundreds of base64 images was pure wasted CPU on each keystroke-driven
// save. Bounded so a very long session can't grow it without limit.
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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface CloudEntry extends Omit<JournalEntry, "photo" | "photos" | "audio"> {
  photoRefs?: string[];
  audioRef?: string;
}

// Replace each entry's photo/audio bytes with content-hash refs, and collect
// the hash→data maps to persist as individual media docs.
async function prepareForCloud(
  data: AppData
): Promise<{
  main: AppData & { photoManifest: string[]; audioManifest: string[] };
  photos: Map<string, string>;
  audios: Map<string, string>;
}> {
  const photos = new Map<string, string>();
  const audios = new Map<string, string>();
  const journalEntries = await Promise.all(
    data.journalEntries.map(async (e): Promise<CloudEntry> => {
      const imgs = entryPhotos(e);
      const { photo: _p, photos: _ps, audio: _a, ...rest } = e;
      const out: CloudEntry = rest;
      if (imgs.length) {
        const refs: string[] = [];
        for (const img of imgs) {
          const h = await photoHash(img);
          photos.set(h, img);
          refs.push(h);
        }
        out.photoRefs = refs;
      }
      if (e.audio) {
        const h = await photoHash(e.audio);
        audios.set(h, e.audio);
        out.audioRef = h;
      }
      return out;
    })
  );
  return {
    main: {
      ...data,
      journalEntries: journalEntries as unknown as JournalEntry[],
      photoManifest: [...photos.keys()],
      audioManifest: [...audios.keys()],
    },
    photos,
    audios,
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

// Fetch every media doc (photos + voice notes) and re-attach the bytes onto
// the entries' refs.
export async function hydrateCloudPhotos(uid: string, main: AppData): Promise<AppData> {
  if (!db) return main;
  const [photoSnap, audioSnap] = await Promise.all([
    getDocs(collection(db, COLLECTION, uid, "photos")),
    getDocs(collection(db, COLLECTION, uid, "audios")),
  ]);
  const pmap = new Map<string, string>();
  photoSnap.forEach((d) => pmap.set(d.id, (d.data() as { data: string }).data));
  const amap = new Map<string, string>();
  audioSnap.forEach((d) => amap.set(d.id, (d.data() as { data: string }).data));
  knownCloudHashes = new Set(pmap.keys());
  knownCloudAudioHashes = new Set(amap.keys());
  const journalEntries = main.journalEntries.map((e) => {
    const refs = (e as CloudEntry).photoRefs;
    const aref = (e as CloudEntry).audioRef;
    const { photoRefs: _r, audioRef: _ar, ...rest } = e as CloudEntry;
    let out = rest as JournalEntry;
    if (refs?.length) {
      const imgs = refs.map((h) => pmap.get(h)).filter(Boolean) as string[];
      out = { ...out, photos: imgs, photo: imgs[0] };
    }
    if (aref) {
      const a = amap.get(aref);
      if (a) out = { ...out, audio: a };
    }
    return out;
  });
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
      .filter((e) => e.photo || e.photos?.length || e.audio)
      .map((e) => [e.id, { photo: e.photo, photos: e.photos, audio: e.audio }])
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
      if (!e.audio && kept.audio) patch.audio = kept.audio;
      return Object.keys(patch).length ? { ...e, ...patch } : e;
    }),
  };
}

// Upload only new hashes and delete only removed ones for one media
// subcollection. Non-fatal: a blob that fails or is too big for a single
// Firestore doc is skipped, so it can never break syncing of the core data.
// Returns the new set of known hashes (unchanged on failure, so it retries).
async function syncMediaDocs(
  uid: string,
  sub: string,
  media: Map<string, string>,
  known: Set<string>
): Promise<Set<string>> {
  if (!db) return known;
  const desired = new Set(media.keys());
  const toUpload = [...desired].filter((h) => !known.has(h));
  const toDelete = [...known].filter((h) => !desired.has(h));
  try {
    for (const part of chunk(toUpload, 400)) {
      const batch = writeBatch(db);
      let n = 0;
      for (const h of part) {
        const val = media.get(h);
        if (!val || val.length > 1_000_000) continue; // Firestore 1MB doc cap
        batch.set(doc(db, COLLECTION, uid, sub, h), { data: val });
        n++;
      }
      if (n) await batch.commit();
    }
    for (const part of chunk(toDelete, 400)) {
      const batch = writeBatch(db);
      for (const h of part) batch.delete(doc(db, COLLECTION, uid, sub, h));
      await batch.commit();
    }
    return desired;
  } catch {
    return known;
  }
}

export async function saveUserData(uid: string, data: AppData): Promise<void> {
  if (!db) return;
  const { main, photos, audios } = await prepareForCloud(data);

  // 1) main doc (text/numbers + refs + manifests) — always under 1MB.
  await setDoc(doc(db, COLLECTION, uid), main, { merge: false });

  // 2) media docs — photos and voice notes, each diffed against what's already
  //    in the cloud. The core data is already saved above, so a media failure
  //    never flips sync to "offline".
  knownCloudHashes = await syncMediaDocs(uid, "photos", photos, knownCloudHashes);
  knownCloudAudioHashes = await syncMediaDocs(uid, "audios", audios, knownCloudAudioHashes);
}
