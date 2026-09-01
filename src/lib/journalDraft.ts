/**
 * Small, browser-only-at-call-site draft writer for the journal composer.
 *
 * Writing the whole draft to localStorage is synchronous. Doing that for every
 * keypress makes a long Arabic note compete with the keyboard for the main
 * thread, especially on a phone. This writer keeps the latest snapshot in
 * memory and writes it once the typing burst settles; `flush`/`dispose` keep
 * the crash/close safety of the old path.
 */

export interface JournalDraft {
  date: string;
  title: string;
  content: string;
  question: string;
  answering: boolean;
}

export interface JournalDraftStorage {
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface JournalDraftWriter {
  schedule(draft: JournalDraft): void;
  flush(): void;
  clear(): void;
  dispose(): void;
}

export const JOURNAL_DRAFT_DEBOUNCE_MS = 350;
/**
 * سقفُ التأجيل. التأجيل وحده يُصفَّر مع كل ضغطة، فكتابةٌ متدفّقة لا تسكت ٣٥٠ms
 * تؤجّل المسودة إلى ما لا نهاية — وهي بالضبط الحالة التي تكثر فيها الكتابة
 * ويكثر ما يضيع لو انطفأ التبويب. بعد هذا السقف تُكتب المسودة ولو لم يتوقّف
 * الكاتب، ثمّ يبدأ سقفٌ جديد.
 */
export const JOURNAL_DRAFT_MAX_WAIT_MS = 3000;

export function createJournalDraftWriter(
  storage: JournalDraftStorage,
  key: string,
  delayMs = JOURNAL_DRAFT_DEBOUNCE_MS,
  maxWaitMs = JOURNAL_DRAFT_MAX_WAIT_MS,
): JournalDraftWriter {
  let latest: JournalDraft | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstScheduledAt = 0;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    firstScheduledAt = 0;
  };

  const write = () => {
    clearTimer();
    if (disposed || !latest) return;

    const draft = latest;
    try {
      if (draft.title.trim() || draft.content.trim()) {
        storage.setItem(key, JSON.stringify(draft));
      } else {
        storage.removeItem(key);
      }
    } catch {
      // localStorage can be unavailable or full; the real journal save remains
      // the source of truth and handles its own persistence path.
    }
  };

  return {
    schedule(draft) {
      if (disposed) return;
      latest = { ...draft };
      const now = Date.now();
      if (firstScheduledAt === 0) firstScheduledAt = now;
      const waited = now - firstScheduledAt;
      if (waited >= maxWaitMs) {
        write(); // يُصفّر المؤقّت والسقف معاً
        return;
      }
      const startedAt = firstScheduledAt;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(write, Math.min(delayMs, maxWaitMs - waited));
      firstScheduledAt = startedAt;
    },
    flush() {
      if (disposed) return;
      write();
    },
    clear() {
      if (disposed) return;
      clearTimer();
      latest = null;
      try { storage.removeItem(key); } catch { /* storage unavailable */ }
    },
    dispose() {
      if (disposed) return;
      write();
      disposed = true;
      latest = null;
      clearTimer();
    },
  };
}
