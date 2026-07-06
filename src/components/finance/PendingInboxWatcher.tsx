"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PendingImport } from "@/components/finance/PendingImport";
import { isFirebaseEnabled } from "@/lib/firebase";
import { loadInbox, deleteInboxItem, type InboxItem } from "@/lib/sync";
import { parseBankSmsBulk } from "@/lib/bankParser";
import { today } from "@/lib/utils";

// App-wide watcher: on launch (from any page, including the home screen) it
// drains the automatic bank-SMS inbox and, if anything parses into an expense,
// pops the review sheet so the user approves right away — no need to open the
// finance page first. Unreadable messages are cleared silently.
export function PendingInboxWatcher() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isFirebaseEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const inbox = await loadInbox();
        if (cancelled || !inbox.length) return;
        const hasExpense = inbox.some(
          (it) => parseBankSmsBulk(it.text, today()).transactions.length > 0
        );
        if (hasExpense) {
          setItems(inbox);
          setOpen(true);
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
  }, []);

  if (!open) return null;
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="معاملات جديدة من البنك 🏦">
      <PendingImport items={items} onClose={() => { setOpen(false); setItems([]); }} />
    </Modal>
  );
}
