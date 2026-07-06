"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { isFirebaseEnabled, SYNC_SPACE_ID } from "@/lib/firebase";
import {
  loadUserMain,
  hydrateCloudPhotos,
  saveUserData,
  mergeLocalPhotos,
  subscribeUserMain,
} from "@/lib/sync";
import { useAppStore } from "@/lib/store";

type SyncState = "idle" | "syncing" | "synced" | "offline";

interface SyncContextValue {
  enabled: boolean;
  status: SyncState;
  lastSyncedAt: number | null;
}

const SyncContext = createContext<SyncContextValue>({
  enabled: false,
  status: "idle",
  lastSyncedAt: null,
});

export const useSync = () => useContext(SyncContext);

// Login-free sync: every device shares one Firestore document keyed by a
// fixed secret space id, so opening the app just works — no email, no login.
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SyncState>(isFirebaseEnabled ? "syncing" : "idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const hydratedRef = useRef(false);
  // True while we're applying a remote snapshot, so the store subscription
  // doesn't treat that change as a local edit and echo it straight back.
  const applyingRemoteRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hydrate = useAppStore((s) => s.hydrate);
  const snapshot = useAppStore((s) => s.snapshot);

  useEffect(() => {
    if (!isFirebaseEnabled) return;
    const space = SYNC_SPACE_ID;

    let cancelled = false;
    let unsubStore: () => void = () => {};
    let unsubSnap: () => void = () => {};

    (async () => {
      // 1) Initial merge: newest side wins, then push local up if it's ahead.
      try {
        const cloudMain = await loadUserMain(space);
        const local = snapshot();
        if (cloudMain && (cloudMain.lastUpdated ?? "") > (local.lastUpdated ?? "")) {
          const full = await hydrateCloudPhotos(space, cloudMain);
          applyingRemoteRef.current = true;
          hydrate(mergeLocalPhotos(full, local));
          applyingRemoteRef.current = false;
        } else {
          await saveUserData(space, local);
        }
        setStatus("synced");
        setLastSyncedAt(Date.now());
      } catch {
        setStatus("offline");
      }
      if (cancelled) return;
      hydratedRef.current = true;

      // 2) Live updates coming from the owner's other devices.
      unsubSnap = subscribeUserMain(space, (cloudMain) => {
        if (!cloudMain) return;
        const localUpdated = useAppStore.getState().lastUpdated ?? "";
        if ((cloudMain.lastUpdated ?? "") <= localUpdated) return;
        (async () => {
          try {
            const full = await hydrateCloudPhotos(space, cloudMain);
            const local = snapshot();
            applyingRemoteRef.current = true;
            hydrate(mergeLocalPhotos(full, local));
            setTimeout(() => {
              applyingRemoteRef.current = false;
            }, 0);
            setStatus("synced");
            setLastSyncedAt(Date.now());
          } catch {
            setStatus("offline");
          }
        })();
      });

      // 3) Push local edits up (debounced).
      unsubStore = useAppStore.subscribe(() => {
        if (!hydratedRef.current || applyingRemoteRef.current) return;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        setStatus("syncing");
        saveTimer.current = setTimeout(() => {
          const stamp = new Date().toISOString();
          const data = { ...snapshot(), lastUpdated: stamp };
          // Reflect the stamp locally (guarded) so the echoed snapshot is a
          // no-op instead of triggering another save.
          applyingRemoteRef.current = true;
          useAppStore.setState({ lastUpdated: stamp });
          applyingRemoteRef.current = false;
          saveUserData(space, data)
            .then(() => {
              setStatus("synced");
              setLastSyncedAt(Date.now());
            })
            .catch(() => setStatus("offline"));
        }, 1500);
      });
    })();

    return () => {
      cancelled = true;
      unsubStore();
      unsubSnap();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [hydrate, snapshot]);

  return (
    <SyncContext.Provider value={{ enabled: isFirebaseEnabled, status, lastSyncedAt }}>
      {children}
    </SyncContext.Provider>
  );
}
