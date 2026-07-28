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
  applyTombstones,
  subscribeUserMain,
  primeUrlCache,
  inlineCachedMedia,
  lastShardLoadOk,
  RevisionConflictError,
} from "@/lib/sync";
import { useAppStore } from "@/lib/store";
import { hasData, cloudHasUnseen, shouldAdoptCloud } from "@/lib/syncDecision";
import { showToast } from "@/components/ui/UndoToast";

// "partial": the main doc synced but the picture is incomplete — a journal
// shard couldn't be read, or some media hasn't reached the cloud yet. Honest
// middle state between "synced" and "offline" so the UI never over-claims.
type SyncState = "idle" | "syncing" | "synced" | "partial" | "offline";

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

// `hasData` / `cloudHasUnseen` / `shouldAdoptCloud` تعيش الآن في
// `@/lib/syncDecision` — دوالٌّ نقيّة بلا Firebase، فتُختبر وحدةً (كانت هنا داخل
// المكوّن فلا يمسّها أيّ اختبار، وهي أخطر قرارٍ في المزامنة).

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
  // The main doc's revision we last adopted/wrote — passed as expectedRevision
  // on the next save so a concurrent write (another device) is caught by the
  // transaction (RevisionConflictError) instead of silently overwriting it.
  const lastRevisionRef = useRef<number>(0);
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

    // Mark a clean sync — but downgrade to "partial" when the picture is
    // incomplete (a shard we couldn't read, or media still pending), so the UI
    // never claims a full "متزامن" over a partial state.
    const markSynced = (mediaComplete = true) => {
      setStatus(!lastShardLoadOk() || !mediaComplete ? "partial" : "synced");
      setLastSyncedAt(Date.now());
    };

    // مستمعُ إخفاءِ الصفحة (يُسجَّل بعد تعريف attemptSave أدناه) — يُنظَّف مع الأثر.
    let unsubFlush: () => void = () => {};

    (async () => {
      // ===== انتظر ترطيب المتجر من IndexedDB قبل أيّ قرار مزامنة =====
      // `persist` غير متزامن: من دون هذا الانتظار تقرأ المزامنة `snapshot()` وهي
      // الحالة الافتراضية، فيبدو الجهاز «فارغاً» (`hasData` = false) فيتبنّى
      // السحابة كاملة، ثمّ ينتهي الترطيب فيستبدل الحالةَ بنسخة الجهاز القديمة —
      // فتختفي عمليةٌ سُجّلت على جهازٍ آخر. والأسوأ: `lastCloudUpdatedRef` و
      // `lastRevisionRef` صارا لتوّهما قيمَ السحابة، فشرط إعادة الدمج في
      // `pushLocal` لا يتحقّق، فتُكتب اللقطة القديمة بـ`merge:false` وتُمحى
      // العملية من السحابة أيضاً. الانتظار هنا يسدّ الباب من أصله.
      if (!useAppStore.persist.hasHydrated()) {
        await new Promise<void>((resolve) => {
          const un = useAppStore.persist.onFinishHydration(() => { un(); resolve(); });
        });
      }
      if (cancelled) return;

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
        let mediaComplete = true;

        if (cloudMain && cloudHasData && localHasData) {
          // Both sides hold data. ALWAYS union them — never let the device with
          // the newer top-level stamp overwrite the other, or an entry written
          // on one device is silently dropped when the other's clock/stamp
          // happens to be ahead (the bug: iPad journal entries vanished on the
          // iPhone). mergeAppData keeps every entry and resolves per-item
          // conflicts by the newer stamp.
          //
          // **الدمج على المراجع لا على البايتات**: `cloudMain` يدخل الدمج وهو ما
          // يزال يحمل `photoRefs`/`audioRefs`، فيوحّدها `mergeEntryMedia` بلا
          // فقد. لو رطّبنا الصور أولاً لصارت النسخة السحابية مصفوفةَ بايتات،
          // وقاعدةُ «لا نستبدل مجموعةً موجودة» تُسقط الصورة الثانية بلا مرجعٍ
          // يعيدها — فتصير يتيمةً في R2. الترطيب بعد الدمج، للعرض وحده.
          const merged = mergeAppData(local, cloudMain);
          const shown = await hydrateCloudPhotos(space, merged);
          applyingRemoteRef.current = true;
          hydrate(await inlineCachedMedia(space, mergeLocalPhotos(shown, local)));
          applyingRemoteRef.current = false;
          // Push the union back up so the cloud gains any entries that lived
          // only on this device; other devices then pull them. We just read the
          // cloud doc, so pass its revision for the transaction's CAS. نحفظ
          // **الناتج الغنيّ بالمراجع** (`merged`) لا نسخةَ العرض، فيبقى الاستكمال
          // الجزئي: مرجعٌ لم يُنزَّل هذه الجلسة يعود كما هو بدل أن يُسقَط.
          const r = await saveUserData(space, merged, cloudMain.revision ?? 0);
          mediaComplete = r.mediaComplete;
          setMediaPending(!r.mediaComplete);
          lastCloudUpdatedRef.current = merged.lastUpdated ?? cloudMain.lastUpdated ?? "";
          lastRevisionRef.current = r.revision;
        } else if (cloudMain && cloudHasData) {
          // Only the cloud has data → adopt it wholesale onto this fresh device.
          // Filter the cloud's own tombstones first: this is the ONE path that
          // skips mergeAppData, and the journal shards can still hold entries
          // the owner deleted (empty shards are deliberately never deleted), so
          // without this a fresh device resurrects them.
          // الشواهد **قبل** الترطيب: صورةٌ محذوفة يُسقط مرجعَها التنقيةُ، فلا
          // تُنزَّل بايتاتها أصلاً (كنّا ننزّلها ثمّ نرميها).
          const full = await hydrateCloudPhotos(space, applyTombstones(cloudMain));
          applyingRemoteRef.current = true;
          hydrate(await inlineCachedMedia(space, mergeLocalPhotos(full, local)));
          applyingRemoteRef.current = false;
          lastCloudUpdatedRef.current = cloudMain.lastUpdated ?? "";
          lastRevisionRef.current = cloudMain.revision ?? 0;
        } else if (localHasData) {
          // Only this device has data → seed the cloud from it.
          const r = await saveUserData(space, local, cloudMain?.revision ?? 0);
          mediaComplete = r.mediaComplete;
          setMediaPending(!r.mediaComplete);
          lastCloudUpdatedRef.current = local.lastUpdated ?? "";
          lastRevisionRef.current = r.revision;
        } else {
          lastCloudUpdatedRef.current = cloudMain?.lastUpdated ?? "";
          lastRevisionRef.current = cloudMain?.revision ?? 0;
        }
        markSynced(mediaComplete);
      } catch {
        setStatus("offline");
      }
      if (cancelled) return;
      hydratedRef.current = true;

      // Push the local snapshot up. Before overwriting, re-read the cloud doc;
      // if another device wrote since we last synced, merge its data in first
      // so a concurrent edit is never clobbered by last-writer-wins. The main
      // doc write goes through a transaction keyed on `revision`: if the cloud
      // advanced between our read and our write (a narrow race the re-read can't
      // close), saveUserData throws RevisionConflictError and we re-merge and
      // retry — bounded, so a persistent conflict can't spin forever.
      const pushLocal = async (): Promise<boolean> => {
        for (let attempt = 0; attempt < 4; attempt++) {
          let toSave = snapshot();
          const cloudMain = await loadUserMain(space);
          if (
            cloudMain &&
            hasData(cloudMain) &&
            ((cloudMain.lastUpdated ?? "") > lastCloudUpdatedRef.current ||
              (cloudMain.revision ?? 0) > lastRevisionRef.current)
          ) {
            // كما في الدمج الأوّل: الدمج على المراجع، والترطيب بعده للعرض.
            const merged = mergeAppData(toSave, cloudMain);
            const shown = await hydrateCloudPhotos(space, merged);
            applyingRemoteRef.current = true;
            hydrate(await inlineCachedMedia(space, mergeLocalPhotos(shown, toSave)));
            applyingRemoteRef.current = false;
            toSave = merged; // الغنيّ بالمراجع هو ما يُحفظ
            lastRevisionRef.current = cloudMain.revision ?? lastRevisionRef.current;
          }
          const stamp = new Date().toISOString();
          toSave = { ...toSave, lastUpdated: stamp };
          // Reflect the stamp locally (guarded) so the echoed snapshot is a
          // no-op instead of triggering another save.
          applyingRemoteRef.current = true;
          useAppStore.setState({ lastUpdated: stamp });
          applyingRemoteRef.current = false;
          try {
            const res = await saveUserData(space, toSave, lastRevisionRef.current);
            lastCloudUpdatedRef.current = stamp;
            lastRevisionRef.current = res.revision;
            return res.mediaComplete;
          } catch (err) {
            if (err instanceof RevisionConflictError) {
              // Another device wrote between our read and our transaction. Adopt
              // its revision and loop to re-read + re-merge before retrying.
              lastRevisionRef.current = err.cloudRevision;
              continue;
            }
            throw err;
          }
        }
        // Exhausted retries against a moving target — treat as a transient
        // failure so the backoff/retry path takes over rather than looping hot.
        throw new Error("revision conflict: retries exhausted");
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
            markSynced(mediaComplete);
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

      // ===== إفراغ الحفظ المؤجّل عند إخفاء الصفحة =====
      // الحفظ مؤجّل 1500ms. على iOS يُجمَّد التبويب فور الانتقال لتطبيقٍ آخر أو
      // إقفال الشاشة، فتعديلٌ سُجّل قبل لحظة **لا يغادر الجهاز أبداً** — وهذا
      // بالضبط شكلُ «سجّلتُ عمليةً بالجوال ولم أجدها على الآيباد». عند أول إشارة
      // إخفاء نُلغي المؤقّت ونحفظ فوراً بدل انتظار المهلة. `visibilitychange`
      // هي الإشارة الموثوقة على iOS (لا `beforeunload`)، و`pagehide` تغطّي
      // إغلاق التبويب/التنقّل.
      const flushPendingSave = () => {
        if (!saveTimer.current && !retryTimer.current) return; // لا شيء معلّق
        if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
        if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
        attemptSave();
      };
      const onHide = () => {
        if (document.visibilityState === "hidden") flushPendingSave();
      };
      document.addEventListener("visibilitychange", onHide);
      window.addEventListener("pagehide", flushPendingSave);
      unsubFlush = () => {
        document.removeEventListener("visibilitychange", onHide);
        window.removeEventListener("pagehide", flushPendingSave);
      };

      // 2) Live updates coming from the owner's other devices.
      unsubSnap = subscribeUserMain(space, (cloudMain) => {
        if (!cloudMain) return;
        // Receiving a snapshot at all means we're connected — clear any
        // lingering "offline" state even when there's nothing new to apply.
        markSynced();
        const state = useAppStore.getState();
        // نتبنّى اللقطة إذا: ختمُها أحدث، **أو ارتفع revision عن آخر ما تبنّيناه**
        // (كتابةٌ حقيقية من جهازٍ آخر لا تعتمد على ساعته — وهذا ما كان يُسقِط
        // *تعديل عنصرٍ قائم* من جهازٍ ساعته متأخّرة)، أو فيها محتوى لم نره.
        // القرار نفسه في `decideAdoptCloud` (مختبَر وحدةً).
        if (!shouldAdoptCloud({
          cloudLastUpdated: cloudMain.lastUpdated,
          localLastUpdated: state.lastUpdated,
          cloudRevision: cloudMain.revision,
          lastRevision: lastRevisionRef.current,
          hasUnseen: cloudHasUnseen(cloudMain, state),
        })) return;
        (async () => {
          try {
            const local = snapshot();
            // Does THIS device hold changes the incoming cloud snapshot lacks?
            // (reverse of cloudHasUnseen). If so, the merge below will contain
            // data the cloud doesn't have yet, so we must push the union back —
            // the guarded hydrate won't trigger the store subscription itself.
            const localHasUnpushed = cloudHasUnseen(local, cloudMain);
            // Merge, so unsynced local edits aren't overwritten by the incoming
            // cloud snapshot (cloud is newer here, so it wins per-item conflicts).
            // بمراجع السحابة كما هي — ثمّ نرطّب الناتج للعرض.
            const merged = mergeAppData(local, cloudMain);
            const shown = await hydrateCloudPhotos(space, merged);
            const inlined = await inlineCachedMedia(space, mergeLocalPhotos(shown, local));
            applyingRemoteRef.current = true;
            hydrate(inlined);
            setTimeout(() => {
              applyingRemoteRef.current = false;
            }, 0);
            lastCloudUpdatedRef.current = cloudMain.lastUpdated ?? "";
            lastRevisionRef.current = cloudMain.revision ?? lastRevisionRef.current;
            markSynced();
            // Converge the cloud: push the merged union up so the entry that
            // lived only here reaches the other devices. Guarded by
            // localHasUnpushed so two idle devices don't ping-pong saves.
            if (localHasUnpushed) attemptSave();
          } catch {
            setStatus("offline");
          }
        })();
      });

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
      unsubFlush();
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
