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
import { loadUserData, saveUserData } from "@/lib/sync";
import { useAppStore } from "@/lib/store";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  enabled: boolean;
  syncing: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  enabled: false,
  syncing: false,
  signIn: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isFirebaseEnabled);
  const [syncing, setSyncing] = useState(false);
  const hydratedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hydrate = useAppStore((s) => s.hydrate);
  const snapshot = useAppStore((s) => s.snapshot);

  // Watch auth state
  useEffect(() => {
    if (!isFirebaseEnabled || !auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // Merge: take whichever side has the newer lastUpdated
        setSyncing(true);
        try {
          const cloud = await loadUserData(u.uid);
          const local = snapshot();
          if (cloud && (cloud.lastUpdated ?? "") > (local.lastUpdated ?? "")) {
            hydrate(cloud);
          } else {
            await saveUserData(u.uid, local);
          }
        } finally {
          hydratedRef.current = true;
          setSyncing(false);
        }
      } else {
        hydratedRef.current = false;
      }
    });
    return () => unsub();
  }, [hydrate, snapshot]);

  // Push local changes to cloud (debounced) while signed in
  useEffect(() => {
    if (!isFirebaseEnabled) return;
    const unsub = useAppStore.subscribe(() => {
      if (!user || !hydratedRef.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const data = { ...snapshot(), lastUpdated: new Date().toISOString() };
        setSyncing(true);
        saveUserData(user.uid, data).finally(() => setSyncing(false));
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
      value={{ user, loading, enabled: isFirebaseEnabled, syncing, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
