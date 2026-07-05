import {
  doc, getDoc, setDoc, getDocs, collection, writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import type { AppData, JournalEntry } from "./types";
import { entryPhotos } from "./utils";

const COLLECTION = "userData";

// ===================== Photo cloud sync =====================
// Firestore caps a single document at 1MB, so we can't cram every journal
// photo into the one userData doc. Instead each photo lives in its own doc
// under userData/{uid}/photos/{hash} (keyed by content hash → automatic
// dedup), the main doc carries only lightweight `photoRefs` (hashes) on
// each entry plus a `photoManifest` listing every hash currently in the
// cloud. This scales to thousands of photos and syncs them across devices.

// Hashes we believe already exist in the cloud — seeded from the main doc's
// manifest on load, so a save only uploads new photos and deletes removed
// ones instead of re-writing everything each time.
let knownCloudHashes = new Set<string>();

async function photoHash(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface CloudEntry extends Omit<JournalEntry, "photo" | "photos"> {
  photoRefs?: string[];
}

// Replace each entry's photo bytes with content-hash refs, and collect the
// hash→data map to persist as individual photo docs.
async function prepareForCloud(
  data: AppData
): Promise<{ main: AppData & { photoManifest: string[] }; photos: Map<string, string> }> {
  const photos = new Map<string, string>();
  const journalEntries = await Promise.all(
    data.journalEntries.map(async (e): Promise<CloudEntry> => {
      const imgs = entryPhotos(e);
      const { photo: _p, photos: _ps, ...rest } = e;
      if (!imgs.length) return rest;
      const refs: string[] = [];
      for (const img of imgs) {
        const h = await photoHash(img);
        photos.set(h, img);
        refs.push(h);
      }
      return { ...rest, photoRefs: refs };
    })
  );
  return {
    main: {
      ...data,
      journalEntries: journalEntries as unknown as JournalEntry[],
      photoManifest: [...photos.keys()],
    },
    photos,
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
    return null;
  }
  const main = snap.data() as AppData & { photoManifest?: string[] };
  knownCloudHashes = new Set(main.photoManifest ?? []);
  return main;
}

// Fetch every photo doc and re-attach the bytes onto the entries' refs.
export async function hydrateCloudPhotos(uid: string, main: AppData): Promise<AppData> {
  if (!db) return main;
  const snap = await getDocs(collection(db, COLLECTION, uid, "photos"));
  const map = new Map<string, string>();
  snap.forEach((d) => map.set(d.id, (d.data() as { data: string }).data));
  knownCloudHashes = new Set(map.keys());
  const journalEntries = main.journalEntries.map((e) => {
    const refs = (e as CloudEntry).photoRefs;
    const { photoRefs: _r, ...rest } = e as CloudEntry;
    if (!refs?.length) return rest as JournalEntry;
    const imgs = refs.map((h) => map.get(h)).filter(Boolean) as string[];
    return { ...rest, photos: imgs, photo: imgs[0] } as JournalEntry;
  });
  return { ...main, journalEntries };
}

// Back-compat: load everything in one call (used where photos are wanted).
export async function loadUserData(uid: string): Promise<AppData | null> {
  const main = await loadUserMain(uid);
  if (!main) return null;
  return hydrateCloudPhotos(uid, main);
}

// Re-attach photos kept on this device onto cloud entries that arrived
// without them (matched by id) — a safety net so a hydrate can never wipe a
// local photo even if its cloud doc failed to download.
export function mergeLocalPhotos(cloud: Partial<AppData>, local: AppData): Partial<AppData> {
  if (!cloud.journalEntries) return cloud;
  const localPhotos = new Map(
    local.journalEntries
      .filter((e) => e.photo || e.photos?.length)
      .map((e) => [e.id, { photo: e.photo, photos: e.photos }])
  );
  if (!localPhotos.size) return cloud;
  return {
    ...cloud,
    journalEntries: cloud.journalEntries.map((e) => {
      if (e.photo || e.photos?.length) return e;
      const kept = localPhotos.get(e.id);
      return kept ? { ...e, ...kept } : e;
    }),
  };
}

export async function saveUserData(uid: string, data: AppData): Promise<void> {
  if (!db) return;
  const { main, photos } = await prepareForCloud(data);

  // 1) main doc (text/numbers + refs + manifest) — always under 1MB.
  await setDoc(doc(db, COLLECTION, uid), main, { merge: false });

  // 2) photo docs — upload only new hashes, delete only removed ones.
  const desired = new Set(photos.keys());
  const toUpload = [...desired].filter((h) => !knownCloudHashes.has(h));
  const toDelete = [...knownCloudHashes].filter((h) => !desired.has(h));

  for (const part of chunk(toUpload, 400)) {
    const batch = writeBatch(db);
    for (const h of part) batch.set(doc(db, COLLECTION, uid, "photos", h), { data: photos.get(h) });
    await batch.commit();
  }
  for (const part of chunk(toDelete, 400)) {
    const batch = writeBatch(db);
    for (const h of part) batch.delete(doc(db, COLLECTION, uid, "photos", h));
    await batch.commit();
  }

  knownCloudHashes = desired;
}
