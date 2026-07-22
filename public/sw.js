// مدار — offline service worker.
// Navigations are network-first (so deploys show up) with a cache fallback for
// offline; static assets are cache-first. All user data lives in IndexedDB, so
// caching the shell is enough for the whole app to work with no connection.
//
// v4: precache. On install we fetch precache.json (generated at build time by
// scripts/gen-precache.mjs) and cache EVERY route + asset, so a route works
// offline even if it was never opened — the old runtime-only cache left an
// unvisited page blank offline. The build id is stamped into CACHE so each
// deploy gets a fresh cache (reinstall → re-precache, stale chunks purged), and
// every cache write is tied to waitUntil so the worker can't be killed mid-write.
const CACHE = "madar-__BUILD__";
const MAX_ENTRIES = 200;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch(new URL("precache.json", self.registration.scope), { cache: "no-store" });
        if (res.ok) {
          const { urls } = await res.json();
          const cache = await caches.open(CACHE);
          // Cache each entry independently so one failed asset (a 404 on an old
          // deploy, a flaky fetch) can't abort the whole install like addAll would.
          await Promise.allSettled((urls ?? []).map((u) => cache.add(u)));
        }
      } catch {
        /* offline install or missing manifest — runtime caching still fills in */
      }
      await self.skipWaiting();
    })()
  );
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
      (async () => {
        try {
          const res = await fetch(req);
          // Tie the cache write to the event so the SW isn't terminated before
          // it finishes (the old code let this race).
          event.waitUntil(putAndTrim(req, res.clone()));
          return res;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          // Fall back to any cached page of the app (SPA-ish shell).
          const cache = await caches.open(CACHE);
          const all = await cache.keys();
          const page = all.find((r) => r.mode === "navigate" || r.url.endsWith("/") || r.url.endsWith(".html"));
          return page ? cache.match(page) : Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok && (res.type === "basic" || res.type === "default")) {
        event.waitUntil(putAndTrim(req, res.clone()));
      }
      return res;
    })()
  );
});
