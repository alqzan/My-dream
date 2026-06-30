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

export async function saveUserData(uid: string, data: AppData): Promise<void> {
  if (!db) return;
  const ref = doc(db, COLLECTION, uid);
  await setDoc(ref, data, { merge: false });
}
