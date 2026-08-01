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
  readCloudMain,
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
import type { AppData } from "@/lib/types";
import { hasData, cloudHasUnseen, shouldAdoptCloud } from "@/lib/syncDecision";
import { adoptCloudSnapshot } from "@/lib/syncAdopt";
import { createSaveScheduler, type SaveScheduler } from "@/lib/saveScheduler";
import { showToast } from "@/components/ui/UndoToast";

// "partial": the main doc synced but the picture is incomplete — a journal
// shard couldn't be read, or some media hasn't reached the cloud yet. Honest
// middle state between "synced" and "offline" so the UI never over-claims.
type SyncState = "idle" | "syncing" | "synced" | "partial" | "offline";

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

  // True while we're applying a remote snapshot, so the store subscription
  // doesn't treat that change as a local edit and echo it straight back.
  const applyingRemoteRef = useRef(false);
  // عدّادُ التعديل المحلّي. يبدأ الالتقاط **فور ترطيب IndexedDB وقبل أوّل انتظارٍ
  // شبكيّ**، فكلّ تعديلٍ يقع في نافذة الإقلاع يُرى: `adoptCloudSnapshot` تقرأه
  // فتعيد الدمج على أحدث لقطة، و`pendingEditRef` يضمن رفعه للسحابة بعدها.
  const editSeqRef = useRef(0);
  const pendingEditRef = useRef(false);
  // جدولةُ الحفظ — تُبنى بعد الدمج الأوّل. قبل ذلك تُسجَّل التعديلات في
  // `pendingEditRef` وحده (لا حفظ قبل أن نعرف مراجعة السحابة).
  const saverRef = useRef<SaveScheduler | null>(null);
  // The cloud doc's lastUpdated we last adopted/wrote. Before a save we re-read
  // the cloud doc; if it advanced past this, another device wrote in the
  // meantime and we merge instead of overwriting.
  const lastCloudUpdatedRef = useRef<string>("");
  // The main doc's revision we last adopted/wrote — passed as expectedRevision
  // on the next save so a concurrent write (another device) is caught by the
  // transaction (RevisionConflictError) instead of silently overwriting it.
  const lastRevisionRef = useRef<number>(0);
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

    // مستمعُ إخفاءِ الصفحة (يُسجَّل بعد بناء جدولة الحفظ أدناه) — يُنظَّف مع الأثر.
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

      // ===== التقاطُ التعديل المحلّي يبدأ هنا — قبل أوّل انتظارٍ شبكيّ =====
      // كان الاشتراك يُسجَّل في آخر الأثر: بعد `loadUserMain` والدمج وترطيب
      // الصور وأوّل كتابة. فتعديلٌ يقع في تلك النافذة (وهي ثوانٍ على شبكةٍ
      // بطيئة) لا يراه أحد: يمحوه `hydrate` المبنيّ على لقطةٍ أقدم منه، ولا
      // يُدفع للسحابة لأنّ الاشتراك لم يكن قد وُجد. الاشتراك الآن أوّلُ شيءٍ بعد
      // ترطيب IndexedDB، ولا يحفظ بنفسه — يرفع العدّاد والراية، ويتولّى
      // `adoptCloudSnapshot` إبقاءَ التعديل في الناتج، والحافظُ رفعَه.
      unsubStore = useAppStore.subscribe(() => {
        if (applyingRemoteRef.current) return;
        editSeqRef.current++;
        pendingEditRef.current = true;
        if (saverRef.current) {
          setStatus("syncing");
          saverRef.current.schedule();
        }
      });

      // Reuse any Storage URLs we already hold locally so hydrate doesn't
      // re-fetch every media download URL from scratch.
      primeUrlCache(snapshot().journalEntries);

      // نسخةُ العرض من الاتحاد: الترطيب **بعد** الدمج دائماً (قاعدة المستودع).
      const toDisplay = (merged: AppData, local: AppData) =>
        hydrateCloudPhotos(space, merged).then((shown) =>
          inlineCachedMedia(space, mergeLocalPhotos(shown, local))
        );

      // تطبيقُ ناتج التبنّي على المتجر — محروساً كي لا يراه الاشتراك تعديلاً محلّياً.
      const applyDisplay = (display: Partial<AppData>) => {
        applyingRemoteRef.current = true;
        hydrate(display);
        applyingRemoteRef.current = false;
      };

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
          //
          // و`adoptCloudSnapshot` تحرس النافذة نفسها من جهةٍ ثانية: `local`
          // أعلاه لقطةٌ أُخذت قبل الانتظار، فإن سجّل المالك عمليةً أثناء تنزيل
          // الصور أُعيد الدمج على أحدث لقطةٍ بدل أن يمحوها `hydrate`.
          const { display, save } = await adoptCloudSnapshot({
            snapshot, cloud: cloudMain, toDisplay, editSeq: () => editSeqRef.current,
          });
          applyDisplay(display);
          // Push the union back up so the cloud gains any entries that lived
          // only on this device; other devices then pull them. We just read the
          // cloud doc, so pass its revision for the transaction's CAS. نحفظ
          // **الناتج الغنيّ بالمراجع** (`save`) لا نسخةَ العرض، فيبقى الاستكمال
          // الجزئي: مرجعٌ لم يُنزَّل هذه الجلسة يعود كما هو بدل أن يُسقَط.
          const merged = save;
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
          const mark = editSeqRef.current;
          const full = await hydrateCloudPhotos(space, applyTombstones(cloudMain));
          const shown = await inlineCachedMedia(space, mergeLocalPhotos(full, local));
          // الجهاز كان فارغاً حين قرأنا، لكنّ التنزيل يستغرق — وقد يكتب المالك
          // مذكرةً أثناءه. عندها فقط نطوي أحدثَ لقطةٍ فوق نسخة السحابة (وهي
          // الأحدث ختماً فتفوز بعناصرها)، فلا يُمحى ما كُتب. بلا تعديلٍ عارض
          // يبقى المسار كما هو: تبنٍّ كاملٌ بلا `mergeAppData`.
          const raced = editSeqRef.current !== mark;
          const fresh = raced ? snapshot() : null;
          applyDisplay(fresh ? mergeAppData(fresh, { ...fresh, ...shown }) : shown);
          lastCloudUpdatedRef.current = cloudMain.lastUpdated ?? "";
          lastRevisionRef.current = cloudMain.revision ?? 0;
        } else if (localHasData) {
          // Only this device has data → seed the cloud from it. لقطةٌ طازجة لا
          // `local` القديمة: قراءةُ السحابة استغرقت، وما كُتب أثناءها يُرفع معها.
          const seed = snapshot();
          const r = await saveUserData(space, seed, cloudMain?.revision ?? 0);
          mediaComplete = r.mediaComplete;
          setMediaPending(!r.mediaComplete);
          lastCloudUpdatedRef.current = seed.lastUpdated ?? "";
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

      // Push the local snapshot up. Before overwriting, re-read the cloud doc;
      // if another device wrote since we last synced, merge its data in first
      // so a concurrent edit is never clobbered by last-writer-wins. The main
      // doc write goes through a transaction keyed on `revision`: if the cloud
      // advanced between our read and our write (a narrow race the re-read can't
      // close), saveUserData throws RevisionConflictError and we re-merge and
      // retry — bounded, so a persistent conflict can't spin forever.
      const pushLocal = async (): Promise<boolean> => {
        for (let attempt = 0; attempt < 4; attempt++) {
          // **قراءةٌ رخيصة أولاً**: مستندٌ واحد يحمل `lastUpdated`/`revision`.
          // كان الحفظ ينزّل كلّ shards المذكرات ليجيب سؤالاً لا علاقة له بها —
          // فتعديلُ مصروفٍ واحد يجرّ كامل المكتبة عبر الشبكة. لا ننزّلها إلا حين
          // يثبت أنّ السحابة تحرّكت (فسندمج) أو أنّ قراءةً سابقة لها فشلت
          // (فتواقيعُ الshards ناقصة ويجب تصحيحها).
          const read = await readCloudMain(space);
          const moved =
            !!read &&
            ((read.main.lastUpdated ?? "") > lastCloudUpdatedRef.current ||
              (read.main.revision ?? 0) > lastRevisionRef.current ||
              !lastShardLoadOk());
          // اللقطة **بعد** قراءة السحابة لا قبلها: القراءة رحلةُ شبكةٍ كاملة،
          // وما سُجّل أثناءها يجب أن يركب هذه الكتابة لا التي بعدها.
          let toSave = snapshot();
          if (moved) {
            // `hasData` يُسأل على اللقطة **الكاملة** لا على المستند الرئيس وحده:
            // مساحةٌ سحابية لا تحمل إلا مذكرات تبدو «فارغة» بلا الshards، فنكتب
            // فوقها لقطةَ الجهاز — ضياعُ بياناتٍ صامت.
            const cloudMain = await read!.full();
            if (hasData(cloudMain)) {
              // كما في الدمج الأوّل: الدمج على المراجع، والترطيب بعده للعرض —
              // وبالحارس نفسه، فتعديلٌ يقع أثناء تنزيل الصور هنا لا يمحوه `hydrate`.
              const { display, save } = await adoptCloudSnapshot({
                snapshot, cloud: cloudMain, toDisplay, editSeq: () => editSeqRef.current,
              });
              applyDisplay(display);
              toSave = save; // الغنيّ بالمراجع هو ما يُحفظ
              lastRevisionRef.current = cloudMain.revision ?? lastRevisionRef.current;
            }
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

      // جدولةُ الحفظ: تأجيلٌ، وإفراغٌ عند الإخفاء، وإعادةُ محاولةٍ بتباعدٍ
      // متضاعف، وحفظٌ واحدٌ في الطريق دائماً — آلةُ الحالة كلّها في
      // `@/lib/saveScheduler` (نقيّة ومختبَرة بمؤقّتاتٍ وهمية). كانت هنا مؤقّتات
      // `useRef` لا يمسّها اختبار، ومراجعُها لا تُصفَّر عند انطلاق المؤقّت فيبدو
      // مؤقّتٌ منتهٍ حفظاً معلّقاً، فيتكرّر الحفظ مع كلّ إخفاءٍ للصفحة.
      const saver = createSaveScheduler({
        save: () =>
          pushLocal().then((mediaComplete) => {
            failNotified.current = false;
            setMediaPending(!mediaComplete);
            markSynced(mediaComplete);
          }),
        onError: () => {
          setStatus("offline");
          if (!failNotified.current) {
            failNotified.current = true;
            showToast("فشلت المزامنة — سيُعاد المحاولة", "warning");
          }
        },
      });
      saverRef.current = saver;
      // تعديلٌ وقع أثناء الإقلاع (قبل جهوز الحافظ): `adoptCloudSnapshot` أبقته
      // في المتجر، وهذه الجدولةُ ترفعه للسحابة — وإلّا بقي حبيس الجهاز.
      if (pendingEditRef.current) saver.schedule();

      // ===== إفراغ الحفظ المؤجّل عند إخفاء الصفحة =====
      // الحفظ مؤجّل 1500ms. على iOS يُجمَّد التبويب فور الانتقال لتطبيقٍ آخر أو
      // إقفال الشاشة، فتعديلٌ سُجّل قبل لحظة **لا يغادر الجهاز أبداً** — وهذا
      // بالضبط شكلُ «سجّلتُ عمليةً بالجوال ولم أجدها على الآيباد». عند أول إشارة
      // إخفاء نحفظ فوراً بدل انتظار المهلة. `visibilitychange` هي الإشارة
      // الموثوقة على iOS (لا `beforeunload`)، و`pagehide` تغطّي إغلاق
      // التبويب/التنقّل — وتقعان معاً في الانتقال الواحد، فـ`flush` خاملةٌ إن لم
      // يكن ثمّ شيءٌ معلّق: إفراغٌ واحد لا اثنان.
      const flushPendingSave = () => saver.flush();
      const onHide = () => {
        if (document.visibilityState === "hidden") saver.flush();
      };
      document.addEventListener("visibilitychange", onHide);
      window.addEventListener("pagehide", flushPendingSave);
      unsubFlush = () => {
        document.removeEventListener("visibilitychange", onHide);
        window.removeEventListener("pagehide", flushPendingSave);
      };

      // 2) Live updates coming from the owner's other devices.
      unsubSnap = subscribeUserMain(space, (read) => {
        if (!read) return;
        // Receiving a snapshot at all means we're connected — clear any
        // lingering "offline" state even when there's nothing new to apply.
        markSynced();
        const state = useAppStore.getState();
        // نتبنّى اللقطة إذا: ختمُها أحدث، **أو ارتفع revision عن آخر ما تبنّيناه**
        // (كتابةٌ حقيقية من جهازٍ آخر لا تعتمد على ساعته — وهذا ما كان يُسقِط
        // *تعديل عنصرٍ قائم* من جهازٍ ساعته متأخّرة)، أو فيها محتوى لم نره.
        // القرار نفسه في `decideAdoptCloud` (مختبَر وحدةً).
        //
        // **القرار على المستند الرئيس وحده** (`read.main`) — بلا تنزيل الshards.
        // كلُّ إشعارٍ كان ينزّل كامل المذكرات **قبل** أن يُسأل هذا الشرط، بما فيه
        // صدى كتابتنا نحن، فكان كلُّ حفظٍ يجرّ تنزيلاً كاملاً يُرمى فوراً. ومذكرةٌ
        // كُتبت على جهازٍ آخر لا تفوتنا: كلّ حفظٍ يمرّ بمعاملةٍ ترفع `revision`،
        // فشرطُ المراجعة يلتقطها ولو تأخّر ختمُ ساعة ذلك الجهاز.
        if (!shouldAdoptCloud({
          cloudLastUpdated: read.main.lastUpdated,
          localLastUpdated: state.lastUpdated,
          cloudRevision: read.main.revision,
          lastRevision: lastRevisionRef.current,
          hasUnseen: cloudHasUnseen(read.main, state),
        })) return;
        (async () => {
          try {
            const cloudMain = await read.full();
            const local = snapshot();
            // Does THIS device hold changes the incoming cloud snapshot lacks?
            // (reverse of cloudHasUnseen). If so, the merge below will contain
            // data the cloud doesn't have yet, so we must push the union back —
            // the guarded hydrate won't trigger the store subscription itself.
            const localHasUnpushed = cloudHasUnseen(local, cloudMain);
            // Merge, so unsynced local edits aren't overwritten by the incoming
            // cloud snapshot (cloud is newer here, so it wins per-item conflicts).
            // بمراجع السحابة كما هي — ثمّ نرطّب الناتج للعرض. والحارس نفسه:
            // تنزيلُ صور اللقطة الواردة يستغرق، وتعديلٌ يقع أثناءه يبقى.
            const mark = editSeqRef.current;
            const { display } = await adoptCloudSnapshot({
              snapshot, cloud: cloudMain, toDisplay, editSeq: () => editSeqRef.current,
            });
            applyingRemoteRef.current = true;
            hydrate(display);
            setTimeout(() => {
              applyingRemoteRef.current = false;
            }, 0);
            lastCloudUpdatedRef.current = cloudMain.lastUpdated ?? "";
            lastRevisionRef.current = cloudMain.revision ?? lastRevisionRef.current;
            markSynced();
            // Converge the cloud: push the merged union up so the entry that
            // lived only here reaches the other devices. Guarded by
            // localHasUnpushed so two idle devices don't ping-pong saves — ومعه
            // تعديلٌ وقع أثناء التبنّي (بلعه الحارس فلم يره الاشتراك حفظاً).
            if (localHasUnpushed || editSeqRef.current !== mark) saver.schedule();
          } catch {
            setStatus("offline");
          }
        })();
      });

      // (٣) دفعُ التعديلات المحلّية مؤجَّلاً: الاشتراك سُجّل في أوّل الأثر أعلاه،
      //     وقد صار `saverRef` جاهزاً الآن فيجدول كلُّ تعديلٍ حفظَه من نفسه.
    })();

    return () => {
      cancelled = true;
      unsubStore();
      unsubSnap();
      unsubFlush();
      saverRef.current?.dispose();
      saverRef.current = null;
    };
  }, [hydrate, snapshot]);

  return (
    <SyncContext.Provider value={{ enabled: syncEnabled, status, lastSyncedAt, mediaPending }}>
      {children}
    </SyncContext.Provider>
  );
}
