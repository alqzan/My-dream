// مدار — offline service worker.
// Runtime caching: navigations are network-first (so deploys show up)
// with a cache fallback for offline; static assets are cache-first.
// All user data lives in IndexedDB, so caching the shell is enough for
// the whole app to work with no connection.
// v2: bounded cache — old hashed chunks used to accumulate forever; now the
// runtime cache is trimmed to MAX_ENTRIES so app storage stays lean over time.
// v3: bump the cache name so activate() purges every v2 entry. Combined with
// skipWaiting + clients.claim this forces a stale standalone PWA (iOS caches the
// start_url aggressively and won't refresh on reopen alone) onto the newest
// deploy — the SW file itself changing is what makes the browser re-check.
const CACHE = "madar-v3";
const MAX_ENTRIES = 100;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Keep the runtime cache from growing without bound. cache.keys() preserves
// insertion order, so the oldest entries (typically stale hashed chunks from
// past deploys) are the first evicted. A still-referenced asset that gets
// trimmed is simply re-fetched on next need — cache-first falls back to network.
async function putAndTrim(req, res) {
  const cache = await caches.open(CACHE);
  await cache.put(req, res);
  const keys = await cache.keys();
  if (keys.length > MAX_ENTRIES) {
    for (const old of keys.slice(0, keys.length - MAX_ENTRIES)) {
      await cache.delete(old);
    }
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Firebase etc. go straight out

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          putAndTrim(req, res.clone());
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          // Fall back to any cached page of the app (SPA-ish shell).
          const all = await caches.open(CACHE).then((c) => c.keys());
          const page = all.find((r) => r.mode === "navigate" || r.url.endsWith(".html") || r.url.endsWith("/"));
          return page ? caches.match(page) : Response.error();
        })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok && (res.type === "basic" || res.type === "default")) {
            putAndTrim(req, res.clone());
          }
          return res;
        })
    )
  );
});
