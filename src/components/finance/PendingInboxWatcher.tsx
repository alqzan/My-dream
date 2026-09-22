"use client";
import { useCallback, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { PendingImport } from "@/components/finance/PendingImport";
import { isFirebaseEnabled, getSyncSpace } from "@/lib/firebase";
import { subscribeInbox, deleteInboxItem, type InboxItem } from "@/lib/sync";
import { parseBankSmsBulk } from "@/lib/bankParser";
import { today } from "@/lib/utils";
import { usePending } from "@/lib/pending";
import { useAppStore } from "@/lib/store";
import { isSafeMode, markBootPhase } from "@/lib/platform/bootGuard";

// App-wide watcher: it keeps a LIVE listener on the automatic bank-SMS inbox,
// so a message the iOS Automation delivers surfaces the review sheet at once —
// even while the app is already open (the old one-shot load ran only on launch,
// so a purchase made mid-session never appeared until the next relaunch).
// Unreadable messages are surfaced for manual review; only confirmed noise is
// cleared silently. A genuinely new item opens the review sheet immediately;
// closing with X keeps the items so the banner can reopen them, while
// approving/discarding clears everything from the cloud inbox.
export function PendingInboxWatcher() {
  const { items, reviewing, setItems, openReview, closeReview, clear } = usePending();
  const localEvents = useAppStore((state) => state.inboxEvents ?? []);
  const inboxDecisions = useAppStore((state) => state.inboxDecisions ?? []);

  // Latest inbox snapshot + guards, read inside the (stable) drain closure.
  const latestRef = useRef<InboxItem[]>([]);
  const busyRef = useRef(false);
  const reviewingRef = useRef(reviewing);
  reviewingRef.current = reviewing;
  // IDs already surfaced to the owner. Keeping this local guard means closing
  // the sheet does not immediately reopen it for the same cloud snapshot, but
  // a genuinely new bank message still opens the sheet without waiting for the
  // home screen banner.
  const surfacedIdsRef = useRef<Set<string>>(new Set());

  const drain = useCallback(async () => {
    // Never disturb an in-progress review: approve/discard deletes exactly the
    // items it surfaced, so processing a newer snapshot mid-review could delete
    // an expense the user never saw. Held-back items are picked up the moment
    // the sheet closes (the reviewing→false effect below re-runs drain).
    // الوضع الآمن (`platform/bootGuard.ts`) لا يستورد رسائل البنك.
    if (reviewingRef.current || busyRef.current || isSafeMode()) return;
    markBootPhase("inbox:drain");
    const cloudInbox = latestRef.current;
    const cloudIds = new Set(cloudInbox.map((item) => item.id));
    const terminal = new Set(["saved", "matched", "ignored", "duplicate"]);
    const localInbox: InboxItem[] = localEvents
      .filter((event) => !terminal.has(inboxDecisions.find((decision) => decision.eventId === event.eventId)?.decision ?? ""))
      .filter((event) => !event.sourceInboxId || !cloudIds.has(event.sourceInboxId))
      .map((event) => ({
        id: `local:${event.eventId}`,
        text: event.rawText,
        from: event.bank,
        ts: event.sourceReceivedAt ?? `${event.date}T${event.time ?? "00:00"}:00Z`,
        sourceEventId: event.eventId,
        sourceInboxId: event.sourceInboxId,
        localOnly: true,
      }));
    const inbox = [...cloudInbox, ...localInbox];
    if (!inbox.length) {
      surfacedIdsRef.current.clear();
      return;
    }
    busyRef.current = true;
    try {
      // Keep every source document until the owner reviews it. Two identical
      // messages can be two real purchases; the store's stable source/context
      // identity marks a likely resend for review without deleting either
      // document. Noise is also retained so an ignored decision is durable.
      const readable: InboxItem[] = [];
      const unreadable: InboxItem[] = [];
      let count = 0;
      for (const it of inbox) {
        const parsed = parseBankSmsBulk(it.text, today(), {
          sender: it.from,
          receivedAt: it.ts,
          sourceInboxId: it.sourceInboxId ?? (it.localOnly ? undefined : it.id),
          sourceId: it.sourceEventId?.replace(/:\d+$/, ""),
        });
        if (parsed.events.length) { readable.push(it); count += parsed.events.length; }
        else { unreadable.push(it); count += 1; }
      }
      const toReview = [...readable, ...unreadable];
      if (toReview.length) {
        const fresh = toReview.some((it) => !surfacedIdsRef.current.has(it.id));
        surfacedIdsRef.current = new Set(toReview.map((it) => it.id));
        setItems(toReview, count);
        // استعادة السلوك السابق: المصروف الوارد آلياً يفتح نافذة المراجعة
        // فوراً. لا نعيد فتح نفس اللقطة بعد الضغط على «إغلاق»؛ فقط عنصر جديد
        // أو عنصر بقي معلّقاً أثناء مراجعةٍ سابقة يفتحها.
        if (fresh) openReview();
      } else {
        surfacedIdsRef.current.clear();
      }
    } catch {
      /* offline — the listener re-fires on reconnect */
    } finally {
      busyRef.current = false;
    }
  }, [inboxDecisions, localEvents, openReview, setItems]);

  useEffect(() => {
    if (isSafeMode()) return;
    if (!isFirebaseEnabled || !getSyncSpace()) {
      latestRef.current = [];
      void drain();
      return;
    }
    const unsub = subscribeInbox((inbox) => {
      latestRef.current = inbox;
      void drain();
    });
    return unsub;
  }, [drain]);

  // إذا وصل مصرفٌ جديد أثناء فتح النافذة، تُعاد قراءة اللقطة بعد الإغلاق؛
  // حارسُ IDs أعلاه يفتحها فقط إن كان فيها عنصر لم نعرضه بعد.
  useEffect(() => {
    if (!reviewing) void drain();
  }, [reviewing, drain]);

  if (!reviewing) return null;
  return (
    <Modal open={reviewing} onClose={closeReview} title="معاملات جديدة من البنك 🏦">
      <PendingImport items={items} onClose={clear} />
    </Modal>
  );
}
