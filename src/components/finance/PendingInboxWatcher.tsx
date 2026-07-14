"use client";
import { useCallback, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { PendingImport } from "@/components/finance/PendingImport";
import { isFirebaseEnabled, getSyncSpace } from "@/lib/firebase";
import { subscribeInbox, deleteInboxItem, type InboxItem } from "@/lib/sync";
import { parseBankSmsBulk, isNoiseMessage } from "@/lib/bankParser";
import { today } from "@/lib/utils";
import { usePending } from "@/lib/pending";

// App-wide watcher: it keeps a LIVE listener on the automatic bank-SMS inbox,
// so a message the iOS Automation delivers surfaces the review sheet at once —
// even while the app is already open (the old one-shot load ran only on launch,
// so a purchase made mid-session never appeared until the next relaunch).
// Unreadable messages are surfaced for manual review; only confirmed noise is
// cleared silently. Closing with X keeps the items so the home banner can
// reopen; approving/discarding clears everything from the cloud inbox.
export function PendingInboxWatcher() {
  const { items, reviewing, setItems, openReview, closeReview, clear } = usePending();

  // Latest inbox snapshot + guards, read inside the (stable) drain closure.
  const latestRef = useRef<InboxItem[]>([]);
  const busyRef = useRef(false);
  const reviewingRef = useRef(reviewing);
  reviewingRef.current = reviewing;

  const drain = useCallback(async () => {
    // Never disturb an in-progress review: approve/discard deletes exactly the
    // items it surfaced, so processing a newer snapshot mid-review could delete
    // an expense the user never saw. Held-back items are picked up the moment
    // the sheet closes (the reviewing→false effect below re-runs drain).
    if (reviewingRef.current || busyRef.current) return;
    const inbox = latestRef.current;
    if (!inbox.length) return;
    busyRef.current = true;
    try {
      // Classify each message so nothing an expense could hide in is dropped
      // unseen. Only confirmed noise (OTP, balance-only alert, decline,
      // statement, incoming credit) is deleted silently; an unreadable-but-not-
      // noise message is KEPT and surfaced for manual review.
      const readable: InboxItem[] = [];
      const unreadable: InboxItem[] = [];
      const noise: InboxItem[] = [];
      let count = 0;
      for (const it of inbox) {
        const n = parseBankSmsBulk(it.text, today()).transactions.length;
        if (n > 0) { readable.push(it); count += n; }
        else if (isNoiseMessage(it.text)) noise.push(it);
        else { unreadable.push(it); count += 1; }
      }
      if (noise.length) {
        await Promise.all(noise.map((it) => deleteInboxItem(it.id).catch(() => {})));
      }
      const toReview = [...readable, ...unreadable];
      if (toReview.length) {
        setItems(toReview, count);
        openReview();
      }
    } catch {
      /* offline — the listener re-fires on reconnect */
    } finally {
      busyRef.current = false;
    }
  }, [setItems, openReview]);

  useEffect(() => {
    if (!isFirebaseEnabled || !getSyncSpace()) return;
    const unsub = subscribeInbox((inbox) => {
      latestRef.current = inbox;
      void drain();
    });
    return unsub;
  }, [drain]);

  // When a review closes, catch anything that landed while it was open.
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
