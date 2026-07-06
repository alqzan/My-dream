"use client";
import { useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { PendingImport } from "@/components/finance/PendingImport";
import { isFirebaseEnabled } from "@/lib/firebase";
import { loadInbox, deleteInboxItem } from "@/lib/sync";
import { parseBankSmsBulk } from "@/lib/bankParser";
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
    if (!isFirebaseEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const inbox = await loadInbox();
        if (cancelled || !inbox.length) return;
        const count = inbox.reduce(
          (n, it) => n + parseBankSmsBulk(it.text, today()).transactions.length,
          0
        );
        if (count > 0) {
          setItems(inbox, count);
          openReview();
        } else {
          await Promise.all(inbox.map((it) => deleteInboxItem(it.id).catch(() => {})));
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
