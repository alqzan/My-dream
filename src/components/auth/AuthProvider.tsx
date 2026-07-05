"use client";
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { auth, isFirebaseEnabled } from "@/lib/firebase";
import { loadUserMain, hydrateCloudPhotos, saveUserData, mergeLocalPhotos } from "@/lib/sync";
import { useAppStore } from "@/lib/store";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  enabled: boolean;
  syncing: boolean;
  syncError: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  retrySync: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  enabled: false,
  syncing: false,
  syncError: false,
  signIn: async () => {},
  signOut: async () => {},
  retrySync: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseEnabled);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const hydratedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hydrate = useAppStore((s) => s.hydrate);
  const snapshot = useAppStore((s) => s.snapshot);

  // Initial two-way sync for a signed-in user. Adopts the cloud copy when it
  // is newer, otherwise pushes local up. CRUCIAL: `hydratedRef` (which arms
  // the debounced auto-save) is set true only AFTER a successful sync — if
  // the initial load fails we must NOT arm saving, or the next local edit
  // would overwrite the cloud with a snapshot that never saw it.
  const syncNow = useCallback(async (u: User) => {
    setSyncing(true);
    setSyncError(false);
    try {
      // Two-phase: read the lightweight main doc first (also seeds the
      // photo-hash cache from its manifest), and only download the photo
      // docs when the cloud copy is the newer one we're adopting.
      const cloudMain = await loadUserMain(u.uid);
      const local = snapshot();
      if (cloudMain && (cloudMain.lastUpdated ?? "") > (local.lastUpdated ?? "")) {
        const full = await hydrateCloudPhotos(u.uid, cloudMain);
        // Safety net: keep any local photo whose cloud doc didn't resolve.
        hydrate(mergeLocalPhotos(full, local));
      } else {
        await saveUserData(u.uid, local);
      }
      hydratedRef.current = true;
    } catch (err) {
      console.error("initial sync failed", err);
      hydratedRef.current = false;
      setSyncError(true);
    } finally {
      setSyncing(false);
    }
  }, [hydrate, snapshot]);

  const retrySync = useCallback(() => {
    if (user) void syncNow(user);
  }, [user, syncNow]);

  // Watch auth state
  useEffect(() => {
    if (!isFirebaseEnabled || !auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        void syncNow(u);
      } else {
        hydratedRef.current = false;
        setSyncError(false);
      }
    });
    return () => unsub();
  }, [syncNow]);

  // Push local changes to cloud (debounced) while signed in
  useEffect(() => {
    if (!isFirebaseEnabled) return;
    const unsub = useAppStore.subscribe(() => {
      if (!user || !hydratedRef.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        // The store stamps `lastUpdated` on every mutation, so the snapshot
        // already carries an accurate timestamp — push it as-is.
        const data = snapshot();
        setSyncing(true);
        saveUserData(user.uid, data)
          .then(() => setSyncError(false))
          .catch((err) => {
            console.error("cloud save failed", err);
            setSyncError(true);
          })
          .finally(() => setSyncing(false));
      }, 1500);
    });
    return () => {
      unsub();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [user, snapshot]);

  const signIn = useCallback(async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }, []);

  const signOut = useCallback(async () => {
    if (!auth) return;
    await fbSignOut(auth);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, enabled: isFirebaseEnabled, syncing, syncError, signIn, signOut, retrySync }}
    >
      {children}
    </AuthContext.Provider>
  );
}
