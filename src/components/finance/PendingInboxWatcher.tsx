"use client";
import { useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { PendingImport } from "@/components/finance/PendingImport";
import { isFirebaseEnabled, getSyncSpace } from "@/lib/firebase";
import { loadInbox, deleteInboxItem } from "@/lib/sync";
import { parseBankSmsBulk, isNoiseMessage } from "@/lib/bankParser";
import { today } from "@/lib/utils";
import { usePending } from "@/lib/pending";

// App-wide watcher: on launch (from any page, including the home screen) it
// drains the automatic bank-SMS inbox into shared state, pops the review sheet,
// and keeps the home-screen count in sync. Unreadable messages are cleared
// silently. Closing the sheet with X keeps the items so the home banner can
// reopen it; approving/discarding clears everything.
export function PendingInboxWatcher() {
  const { items, reviewing, setItems, openReview, closeReview, clear } = usePending();

  useEffect(() => {
    if (!isFirebaseEnabled || !getSyncSpace()) return;
    let cancelled = false;
    (async () => {
      try {
        const inbox = await loadInbox();
        if (cancelled || !inbox.length) return;
        // Classify each message so nothing an expense could hide in is ever
        // dropped unseen. Only confirmed noise (OTP, balance-only alert,
        // decline, statement, incoming credit) is deleted silently. A message
        // that isn't noise but the parser couldn't read is KEPT and surfaced
        // for manual review — previously these were deleted, so a bank format
        // we didn't recognise made the expense vanish with no trace.
        const readable: typeof inbox = [];
        const unreadable: typeof inbox = [];
        const noise: typeof inbox = [];
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
        /* offline — try again next launch */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!reviewing) return null;
  return (
    <Modal open={reviewing} onClose={closeReview} title="معاملات جديدة من البنك 🏦">
      <PendingImport items={items} onClose={clear} />
    </Modal>
  );
}
