import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { initializeFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// Firebase web config for the "my-dream-a" project. These NEXT_PUBLIC_
// values are safe to ship in client code by design — access is gated by
// the Firestore security rules (only the one shared space document is
// reachable), not by hiding the key.
// Env vars override these so a fork can point at its own project.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyD9Vg0WsM_5EJtESaRVKZY1H5YcfGs3WkA",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "my-dream-a.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "my-dream-a",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "my-dream-a.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "236145636929",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:236145636929:web:3081885cd728006b5038c0",
};

// A fixed, hard-to-guess space id. All of the owner's devices read/write this
// single shared document, so opening the link on any device just works — no
// email, no login. The id acts as the shared secret; keep the link private.
// Override with NEXT_PUBLIC_SYNC_SPACE if you ever want a fresh space.
export const SYNC_SPACE_ID =
  process.env.NEXT_PUBLIC_SYNC_SPACE || "46c68c32b4b569bc4d608302bea012e6271070ce";

// Firebase is "enabled" only when the essential config is present.
// Without it, the app keeps working fully on localStorage.
export const isFirebaseEnabled = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

if (isFirebaseEnabled) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  // Force long-polling instead of the default WebChannel stream. Mobile
  // Safari and some cellular networks silently block WebChannel, which makes
  // Firestore look permanently "offline" even though plain HTTPS works — this
  // routes everything (reads, writes, live listeners) over HTTP long-polling.
  dbInstance = initializeFirestore(app, { experimentalForceLongPolling: true });
  // Media (photos, voice notes) live in Cloud Storage — far more room than
  // Firestore and no per-file size limit — while the main doc keeps only refs.
  storageInstance = getStorage(app);
}

export const db = dbInstance;
export const storage = storageInstance;
export { app };
