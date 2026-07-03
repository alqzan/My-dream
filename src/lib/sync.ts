import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { AppData } from "./types";

const COLLECTION = "userData";

export async function loadUserData(uid: string): Promise<AppData | null> {
  if (!db) return null;
  const ref = doc(db, COLLECTION, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as AppData;
}

// Journal photos are ~200KB of base64 each; a handful of them would blow
// past Firestore's 1MB single-document limit and kill sync entirely.
// Photos therefore stay device-local: they're stripped before upload and
// re-attached from local state after a cloud hydrate (see mergeLocalPhotos).
function stripPhotos(data: AppData): AppData {
  return {
    ...data,
    journalEntries: data.journalEntries.map((e) => {
      if (!e.photo) return e;
      const { photo: _photo, ...rest } = e;
      return rest;
    }),
  };
}

// Re-attach photos kept on this device onto entries arriving from the
// cloud (matched by entry id) so a hydrate never wipes local photos.
export function mergeLocalPhotos(cloud: Partial<AppData>, local: AppData): Partial<AppData> {
  if (!cloud.journalEntries) return cloud;
  const localPhotos = new Map(
    local.journalEntries.filter((e) => e.photo).map((e) => [e.id, e.photo!])
  );
  if (!localPhotos.size) return cloud;
  return {
    ...cloud,
    journalEntries: cloud.journalEntries.map((e) =>
      !e.photo && localPhotos.has(e.id) ? { ...e, photo: localPhotos.get(e.id) } : e
    ),
  };
}

export async function saveUserData(uid: string, data: AppData): Promise<void> {
  if (!db) return;
  const ref = doc(db, COLLECTION, uid);
  await setDoc(ref, stripPhotos(data), { merge: false });
}
