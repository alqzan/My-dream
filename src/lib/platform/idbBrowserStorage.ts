// Browser compatibility adapter for IndexedDB recovery and page lifecycle.
// Keeping these APIs here leaves idbStorage.ts portable and data-agnostic.

const LOCAL_FALLBACK_PREFIX = "my-dream-idb-fallback:";
const LOCAL_FALLBACK_MAX_CHARS = 2_000_000;

function localStorageOrNull(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

function fallbackKey(name: string): string {
  return `${LOCAL_FALLBACK_PREFIX}${name}`;
}

export function readLocalFallback(name: string): string | null {
  try { return localStorageOrNull()?.getItem(fallbackKey(name)) ?? null; } catch { return null; }
}

export function writeLocalFallback(name: string, value: string): boolean {
  if (value.length > LOCAL_FALLBACK_MAX_CHARS) return false;
  try {
    const storage = localStorageOrNull();
    if (!storage) return false;
    storage.setItem(fallbackKey(name), value);
    return true;
  } catch { return false; }
}

export function removeLocalFallback(name: string): void {
  try { localStorageOrNull()?.removeItem(fallbackKey(name)); } catch { /* ignore */ }
}

/** Read the legacy Zustand key for the one-time localStorage -> IndexedDB move. */
export function readLegacyStorageValue(name: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(name);
}

export function removeLegacyStorageValue(name: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(name); } catch { /* ignore */ }
}

/** Attach the lifecycle flush in the browser adapter, not the storage core. */
export function bindPersistenceLifecycle(flush: () => void): void {
  if (typeof window === "undefined") return;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}
