import { create } from "zustand";
import type { InboxItem } from "./sync";

// Shared state for the automatic bank-SMS inbox, so the global watcher (which
// owns the review sheet) and the home-screen banner (which shows the count and
// can reopen it) stay in sync.
interface PendingState {
  items: InboxItem[];
  count: number; // number of parseable expenses waiting
  reviewing: boolean;
  setItems: (items: InboxItem[], count: number) => void;
  openReview: () => void;
  closeReview: () => void;
  clear: () => void;
}

export const usePending = create<PendingState>((set) => ({
  items: [],
  count: 0,
  reviewing: false,
  setItems: (items, count) => set({ items, count }),
  openReview: () => set({ reviewing: true }),
  closeReview: () => set({ reviewing: false }),
  clear: () => set({ items: [], count: 0, reviewing: false }),
}));
