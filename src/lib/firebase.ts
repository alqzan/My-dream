import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// Firebase web config for the "my-dream-a" project. These NEXT_PUBLIC_
// values are safe to ship in client code by design — access is gated by
// the Firestore security rules (each user reads/writes only their own
// document) and the Auth authorized-domains list, not by hiding the key.
// Env vars override these so a fork can point at its own project.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyD9Vg0WsM_5EJtESaRVKZY1H5YcfGs3WkA",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "my-dream-a.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "my-dream-a",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "my-dream-a.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "236145636929",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:236145636929:web:3081885cd728006b5038c0",
};

// Firebase is "enabled" only when the essential config is present.
// Without it, the app keeps working fully on localStorage.
export const isFirebaseEnabled = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

if (isFirebaseEnabled) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  authInstance = getAuth(app);
  dbInstance = getFirestore(app);
}

export const auth = authInstance;
export const db = dbInstance;
export { app };
