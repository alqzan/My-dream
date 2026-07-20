"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { isFirebaseEnabled, getSyncSpace } from "@/lib/firebase";
import {
  loadUserMain,
  hydrateCloudPhotos,
  saveUserData,
  mergeLocalPhotos,
  mergeAppData,
  subscribeUserMain,
  primeUrlCache,
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
  // True when the text doc synced but some referenced photo/voice note hasn't
  // reached the cloud yet — so the UI can be honest instead of claiming "متزامن".
  mediaPending: boolean;
}

const SyncContext = createContext<SyncContextValue>({
  enabled: false,
  status: "idle",
  lastSyncedAt: null,
  mediaPending: false,
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

// True when the cloud snapshot carries any id/date-keyed item this device
// doesn't have locally. Used so a lagging top-level `lastUpdated` (e.g. the
// other device's clock runs a few minutes behind) can never hide a genuinely
// new entry written elsewhere — we pull on unseen content, not just on a newer
// timestamp.
function cloudHasUnseen(cloud: Partial<AppData>, local: AppData): boolean {
  const has = (localItems: { id: string }[], cloudItems?: { id: string }[]) => {
    const ids = new Set(localItems.map((i) => i.id));
    return (cloudItems ?? []).some((i) => !ids.has(i.id));
  };
  const localDates = new Set(local.prayerLogs.map((p) => p.date));
  return (
    has(local.journalEntries, cloud.journalEntries) ||
    has(local.transactions, cloud.transactions) ||
    has(local.books, cloud.books) ||
    has(local.readingLogs, cloud.readingLogs) ||
    has(local.futureLetters, cloud.futureLetters) ||
    (cloud.prayerLogs ?? []).some((p) => !localDates.has(p.date))
  );
}

// Login-free sync: every device shares one Firestore document keyed by a
// fixed secret space id, so opening the app just works — no email, no login.
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const spaceId = getSyncSpace();
  const syncEnabled = isFirebaseEnabled && !!spaceId;
  const [status, setStatus] = useState<SyncState>(syncEnabled ? "syncing" : "idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [mediaPending, setMediaPending] = useState(false);

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
    const space = getSyncSpace();
    if (!isFirebaseEnabled || !space) return;

    let cancelled = false;
    let unsubStore: () => void = () => {};
    let unsubSnap: () => void = () => {};

    (async () => {
      // Reuse any Storage URLs we already hold locally so hydrate doesn't
      // re-fetch every media download URL from scratch.
      primeUrlCache(snapshot().journalEntries);

      // 1) Initial merge. Adopt the cloud when this device is empty (so a
      //    fresh device pulls the owner's existing data) OR when the cloud is
      //    genuinely newer. Only push local up when it actually has data, so a
      //    blank device can never wipe a cloud space that holds real data.
      try {
        const cloudMain = await loadUserMain(space);
        const local = snapshot();
        const cloudHasData = !!cloudMain && hasData(cloudMain);
        const localHasData = hasData(local);

        if (cloudMain && cloudHasData && localHasData) {
          // Both sides hold data. ALWAYS union them — never let the device with
          // the newer top-level stamp overwrite the other, or an entry written
          // on one device is silently dropped when the other's clock/stamp
          // happens to be ahead (the bug: iPad journal entries vanished on the
          // iPhone). mergeAppData keeps every entry and resolves per-item
          // conflicts by the newer stamp.
          const full = await hydrateCloudPhotos(space, cloudMain);
          const merged = mergeAppData(local, full);
          applyingRemoteRef.current = true;
          hydrate(mergeLocalPhotos(merged, local));
          applyingRemoteRef.current = false;
          // Push the union back up so the cloud gains any entries that lived
          // only on this device; other devices then pull them.
          const r = await saveUserData(space, merged);
          setMediaPending(!r.mediaComplete);
          lastCloudUpdatedRef.current = merged.lastUpdated ?? cloudMain.lastUpdated ?? "";
        } else if (cloudMain && cloudHasData) {
          // Only the cloud has data → adopt it wholesale onto this fresh device.
          const full = await hydrateCloudPhotos(space, cloudMain);
          applyingRemoteRef.current = true;
          hydrate(mergeLocalPhotos(full, local));
          applyingRemoteRef.current = false;
          lastCloudUpdatedRef.current = cloudMain.lastUpdated ?? "";
        } else if (localHasData) {
          // Only this device has data → seed the cloud from it.
          const r = await saveUserData(space, local);
          setMediaPending(!r.mediaComplete);
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
        const state = useAppStore.getState();
        const localUpdated = state.lastUpdated ?? "";
        const cloudNewer = (cloudMain.lastUpdated ?? "") > localUpdated;
        // Apply when the cloud is newer OR when it holds items we haven't seen
        // yet — a stale top-level stamp (device clocks drift) must never hide a
        // real new entry written on another device.
        if (!cloudNewer && !cloudHasUnseen(cloudMain, state)) return;
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
        const res = await saveUserData(space, toSave);
        lastCloudUpdatedRef.current = stamp;
        return res.mediaComplete;
      };

      // Attempt a push; on failure surface a toast (once per streak) and retry
      // with exponential backoff so a transient outage doesn't leave the edit
      // stranded on this device until the next manual change.
      const attemptSave = () => {
        pushLocal()
          .then((mediaComplete) => {
            retryDelay.current = RETRY_BASE_MS;
            failNotified.current = false;
            setMediaPending(!mediaComplete);
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
    <SyncContext.Provider value={{ enabled: syncEnabled, status, lastSyncedAt, mediaPending }}>
      {children}
    </SyncContext.Provider>
  );
}
