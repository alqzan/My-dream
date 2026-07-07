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
  mergeAppData,
  subscribeUserMain,
} from "@/lib/sync";
import { useAppStore } from "@/lib/store";
import { showToast } from "@/components/ui/UndoToast";
import type { AppData } from "@/lib/types";

type SyncState = "idle" | "syncing" | "synced" | "offline";

const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30000;

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

// Does this snapshot hold any real user data? Used so a fresh, empty device
// can never overwrite a cloud space that already holds the owner's data —
// timestamps alone aren't enough, since a brand-new device starts with a
// "now" stamp that would otherwise look newer than older real data.
function hasData(d: Partial<AppData>): boolean {
  const nonEmpty =
    (d.transactions?.length ?? 0) > 0 ||
    (d.journalEntries?.length ?? 0) > 0 ||
    (d.books?.length ?? 0) > 0 ||
    (d.readingLogs?.length ?? 0) > 0 ||
    (d.recurring?.length ?? 0) > 0 ||
    (d.budgets?.length ?? 0) > 0 ||
    (d.reserves?.length ?? 0) > 0 ||
    (d.prayerLogs?.length ?? 0) > 0 ||
    (d.futureLetters?.length ?? 0) > 0;
  const habitsLogged = (d.habits ?? []).some((h) => (h.logs?.length ?? 0) > 0);
  return nonEmpty || habitsLogged;
}

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
  // The cloud doc's lastUpdated we last adopted/wrote. Before a save we re-read
  // the cloud doc; if it advanced past this, another device wrote in the
  // meantime and we merge instead of overwriting.
  const lastCloudUpdatedRef = useRef<string>("");
  // Failed-save retry with exponential backoff (2s → 4s → … capped at 30s).
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(RETRY_BASE_MS);
  const failNotified = useRef(false); // toast only once per failure streak

  const hydrate = useAppStore((s) => s.hydrate);
  const snapshot = useAppStore((s) => s.snapshot);

  useEffect(() => {
    if (!isFirebaseEnabled) return;
    const space = SYNC_SPACE_ID;

    let cancelled = false;
    let unsubStore: () => void = () => {};
    let unsubSnap: () => void = () => {};

    (async () => {
      // 1) Initial merge. Adopt the cloud when this device is empty (so a
      //    fresh device pulls the owner's existing data) OR when the cloud is
      //    genuinely newer. Only push local up when it actually has data, so a
      //    blank device can never wipe a cloud space that holds real data.
      try {
        const cloudMain = await loadUserMain(space);
        const local = snapshot();
        const cloudHasData = !!cloudMain && hasData(cloudMain);
        const localHasData = hasData(local);
        const cloudNewer = (cloudMain?.lastUpdated ?? "") > (local.lastUpdated ?? "");

        if (cloudMain && cloudHasData && (!localHasData || cloudNewer)) {
          const full = await hydrateCloudPhotos(space, cloudMain);
          // Merge rather than blindly adopt the cloud, so local-only edits
          // made before this device ever synced aren't dropped.
          const merged = localHasData ? mergeAppData(local, full) : full;
          applyingRemoteRef.current = true;
          hydrate(mergeLocalPhotos(merged, local));
          applyingRemoteRef.current = false;
          lastCloudUpdatedRef.current = cloudMain.lastUpdated ?? "";
        } else if (localHasData) {
          await saveUserData(space, local);
          lastCloudUpdatedRef.current = local.lastUpdated ?? "";
        } else {
          lastCloudUpdatedRef.current = cloudMain?.lastUpdated ?? "";
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
        // Receiving a snapshot at all means we're connected — clear any
        // lingering "offline" state even when there's nothing new to apply.
        setStatus("synced");
        setLastSyncedAt(Date.now());
        const localUpdated = useAppStore.getState().lastUpdated ?? "";
        if ((cloudMain.lastUpdated ?? "") <= localUpdated) return;
        (async () => {
          try {
            const full = await hydrateCloudPhotos(space, cloudMain);
            const local = snapshot();
            // Merge, so unsynced local edits aren't overwritten by the incoming
            // cloud snapshot (cloud is newer here, so it wins per-item conflicts).
            const merged = mergeAppData(local, full);
            applyingRemoteRef.current = true;
            hydrate(mergeLocalPhotos(merged, local));
            setTimeout(() => {
              applyingRemoteRef.current = false;
            }, 0);
            lastCloudUpdatedRef.current = cloudMain.lastUpdated ?? "";
            setStatus("synced");
            setLastSyncedAt(Date.now());
          } catch {
            setStatus("offline");
          }
        })();
      });

      // Push the local snapshot up. Before overwriting, re-read the cloud doc;
      // if another device wrote since we last synced, merge its data in first
      // so a concurrent edit is never clobbered by last-writer-wins.
      const pushLocal = async () => {
        let toSave = snapshot();
        const cloudMain = await loadUserMain(space);
        if (
          cloudMain &&
          hasData(cloudMain) &&
          (cloudMain.lastUpdated ?? "") > lastCloudUpdatedRef.current
        ) {
          const full = await hydrateCloudPhotos(space, cloudMain);
          const merged = mergeAppData(toSave, full);
          applyingRemoteRef.current = true;
          hydrate(mergeLocalPhotos(merged, toSave));
          applyingRemoteRef.current = false;
          toSave = merged;
        }
        const stamp = new Date().toISOString();
        toSave = { ...toSave, lastUpdated: stamp };
        // Reflect the stamp locally (guarded) so the echoed snapshot is a
        // no-op instead of triggering another save.
        applyingRemoteRef.current = true;
        useAppStore.setState({ lastUpdated: stamp });
        applyingRemoteRef.current = false;
        await saveUserData(space, toSave);
        lastCloudUpdatedRef.current = stamp;
      };

      // Attempt a push; on failure surface a toast (once per streak) and retry
      // with exponential backoff so a transient outage doesn't leave the edit
      // stranded on this device until the next manual change.
      const attemptSave = () => {
        pushLocal()
          .then(() => {
            retryDelay.current = RETRY_BASE_MS;
            failNotified.current = false;
            setStatus("synced");
            setLastSyncedAt(Date.now());
          })
          .catch(() => {
            setStatus("offline");
            if (!failNotified.current) {
              failNotified.current = true;
              showToast("فشلت المزامنة — سيُعاد المحاولة", "warning");
            }
            if (retryTimer.current) clearTimeout(retryTimer.current);
            retryTimer.current = setTimeout(attemptSave, retryDelay.current);
            retryDelay.current = Math.min(retryDelay.current * 2, RETRY_MAX_MS);
          });
      };

      // 3) Push local edits up (debounced).
      unsubStore = useAppStore.subscribe(() => {
        if (!hydratedRef.current || applyingRemoteRef.current) return;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        // A fresh edit supersedes any pending retry — the new snapshot covers it.
        if (retryTimer.current) clearTimeout(retryTimer.current);
        setStatus("syncing");
        saveTimer.current = setTimeout(attemptSave, 1500);
      });
    })();

    return () => {
      cancelled = true;
      unsubStore();
      unsubSnap();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [hydrate, snapshot]);

  return (
    <SyncContext.Provider value={{ enabled: isFirebaseEnabled, status, lastSyncedAt }}>
      {children}
    </SyncContext.Provider>
  );
}
