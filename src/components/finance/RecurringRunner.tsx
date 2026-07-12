"use client";
import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

// Generates any due recurring transactions once per app load, regardless of
// which page is opened first. Previously this only ran from the home page
// and the finance page's own useEffect — a session that stayed open for days
// without visiting either (or opened straight into another tab) could miss a
// due rent/subscription until one of those two pages happened to mount.
// Lives once at the layout level (mounted after the store hydrates, like
// PendingInboxWatcher) so it's a true app-wide guarantee.
export function RecurringRunner() {
  const runRecurring = useAppStore((s) => s.runRecurring);

  useEffect(() => {
    runRecurring();
  }, [runRecurring]);

  return null;
}
