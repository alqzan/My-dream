import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { initializeFirestore, type Firestore } from "firebase/firestore";

// Firebase web config for the "my-dream-a" project. These NEXT_PUBLIC_
// values are safe to ship in client code by design — access is gated by
// the Firestore security rules (only the one shared space document is
// reachable), not by hiding the key.
// Env vars override these so a fork can point at its own project.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyD9Vg0WsM_5EJtESaRVKZY1H5YcfGs3WkA",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "my-dream-a.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "my-dream-a",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "236145636929",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:236145636929:web:3081885cd728006b5038c0",
};

// The sync space id is the shared secret that gates access to the owner's
// single Firestore document — it must never be baked into the repo (this is a
// public codebase). It comes from NEXT_PUBLIC_SYNC_SPACE (a private build-time
// override) or, normally, from localStorage — set once per device via the
// settings UI (BackupCard/SyncKeyCard) and never sent anywhere but Firestore.
export const SYNC_SPACE_STORAGE_KEY = "madar-sync-space";

export function getSyncSpace(): string | null {
  if (process.env.NEXT_PUBLIC_SYNC_SPACE) return process.env.NEXT_PUBLIC_SYNC_SPACE;
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SYNC_SPACE_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

// Firebase is "enabled" only when the essential config is present.
// Without it, the app keeps working fully on localStorage.
export const isFirebaseEnabled = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;

if (isFirebaseEnabled) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  // Force long-polling instead of the default WebChannel stream. Mobile
  // Safari and some cellular networks silently block WebChannel, which makes
  // Firestore look permanently "offline" even though plain HTTPS works — this
  // routes everything (reads, writes, live listeners) over HTTP long-polling.
  dbInstance = initializeFirestore(app, { experimentalForceLongPolling: true });
}

export const db = dbInstance;
export { app };
