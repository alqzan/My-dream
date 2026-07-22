// Content hashing for media — the ONE source of truth, shared by sync.ts (which
// turns photos into cloud refs) and store.ts (which tombstones a photo the user
// removes). Both MUST hash identically or a delete tombstone would never match
// its ref. Kept Firebase-free so either module can import it without pulling in
// the SDK.

// A media string is either a local `data:` URL or a cloud download URL. Parse
// both R2 presigned URLs and legacy Firebase Storage URLs so an already-hydrated
// entry keeps its hash rather than hashing the URL text.
export function isStorageUrl(s: string): boolean {
  return /^https?:\/\//.test(s) && hashFromStorageUrl(s) !== null;
}

export function hashFromStorageUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // New Worker download links carry the content hash as a query param.
    const q = (u.searchParams.get("hash") ?? "").toLowerCase();
    if (/^[a-f0-9]{32}$/.test(q)) return q;
    const legacy = url.match(/\/o\/([^?]+)/);
    const path = legacy ? decodeURIComponent(legacy[1]) : u.pathname;
    const last = path.split("/").filter(Boolean).pop()?.toLowerCase() ?? "";
    return /^[a-f0-9]{32}$/.test(last) ? last : null;
  } catch {
    return null;
  }
}

// A photo's bytes are immutable, so its content hash never changes. Memoize
// data→hash so a save re-hashes only genuinely new images. Bounded so a very
// long session can't grow it without limit.
const hashCache = new Map<string, string>();
const HASH_CACHE_LIMIT = 4000;

export async function photoHash(data: string): Promise<string> {
  const cached = hashCache.get(data);
  if (cached) return cached;
  const bytes = new TextEncoder().encode(data);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  if (hashCache.size >= HASH_CACHE_LIMIT) hashCache.clear();
  hashCache.set(data, hex);
  return hex;
}

// The content hash of any media item, whether it's a cloud pointer (hash lives
// in the URL) or local `data:` bytes (hashed here) — null for anything else.
// Used to tombstone a removed photo by the SAME hash sync references it by.
export async function mediaHashOf(item: string): Promise<string | null> {
  if (!item) return null;
  if (isStorageUrl(item)) return hashFromStorageUrl(item);
  if (item.startsWith("data:")) return photoHash(item);
  return null;
}

export type MediaKindTag = "photos" | "audios";

// A media tombstone is keyed by ENTRY + kind + content-hash, not by hash alone.
// The same photo can live in two entries (common with Day One imports); deleting
// it from one entry must not drop it from the other. Entry ids never contain
// ':', kind is a fixed word, and the hash is 32 hex — so this composite is
// collision-free. Both store.ts (writes) and merge/sync (reads) go through here.
export function mediaTombKey(entryId: string, kind: MediaKindTag, hash: string): string {
  return `${entryId}:${kind}:${hash}`;
}
