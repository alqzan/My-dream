// مدار — offline service worker.
// Navigations are cache-first with a background refresh; static assets are
// cache-first. All user data lives in IndexedDB, so showing the cached shell
// immediately keeps navigation responsive while the network catches up.
//
// v4: precache. On install we fetch precache.json (generated at build time by
// scripts/gen-precache.mjs) and cache EVERY route + asset, so a route works
// offline even if it was never opened — the old runtime-only cache left an
// unvisited page blank offline. The build id is stamped into CACHE so each
// deploy gets a fresh cache (reinstall → re-precache, stale chunks purged), and
// every cache write is tied to waitUntil so the worker can't be killed mid-write.
const CACHE = "madar-__BUILD__";
const MAX_ENTRIES = 200;

// ===== الخزن المسبق لا يمسّه التشذيب =====
// `cache.keys()` تحفظ ترتيب الإدخال، فأقدمُ المدخلات هي مدخلاتُ التثبيت نفسها:
// أوجهُ المسارات وحزمُ JS التي يقوم عليها التطبيق. فما إن يتجاوز مجموعُ
// المدخلات السقفَ حتى يبدأ التشذيب بأكل الخزن المسبق من رأسه، فتخيب المطابقةُ
// ويذهب الطلب إلى الشبكة — وعلى جوّالٍ شبكتُه نائمة يعني ذلك حزمةً لا تصل، أي
// `ChunkLoadError`، أي `error.tsx` يمحو الخزن ويعيد التحميل: يُقذف المالك من
// مكانه إلى شاشة «مدار». عددُ الحزم يكبر مع كلّ ميزة (78 حزمةً اليوم من 116
// مدخلاً)، فبلوغُ السقف مسألةُ وقتٍ لا احتمالٌ بعيد.
//
// والقائمة تُحفظ **في الخزن نفسه** لا في متغيّرٍ عامّ: العاملُ يُوقَظ ويُوقَف بلا
// حالةٍ تعبر، فقائمةٌ في الذاكرة تضيع عند أوّل إيقاف ويعود التشذيب يأكل الخزن.
const manifestKey = () => new URL("precache.json", self.registration.scope).href;

let precachedPromise = null;
function precachedUrls() {
  if (!precachedPromise) {
    precachedPromise = (async () => {
      try {
        const cache = await caches.open(CACHE);
        const res = await cache.match(manifestKey());
        if (!res) return new Set();
        const { urls } = await res.json();
        return new Set((urls ?? []).map((u) => new URL(u, location.origin).href));
      } catch {
        return new Set(); // بلا قائمة لا نشذّب شيئاً — الأسلم
      }
    })();
  }
  return precachedPromise;
}

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
          // القائمة نفسها في الخزن: يقرأها التشذيب بعد أيّ إيقاظٍ للعامل.
          await cache.put(manifestKey(), new Response(JSON.stringify({ urls: urls ?? [] })));
          precachedPromise = null;
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
//
// لكنّ الخزن المسبق مستثنى (السبب في تعليق `precachedUrls` أعلاه): ما دخل عند
// التثبيت هو التطبيقُ نفسه، وإخراجُه من الخزن يُبطل العمل دون شبكة ويحوّل أوّلَ
// حزمةٍ متأخّرة إلى إعادة تحميلٍ كاملة. فالسقفُ سقفُ ما أضافه التشغيل وحده.
async function putAndTrim(req, res) {
  const cache = await caches.open(CACHE);
  await cache.put(req, res);
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return; // فحصٌ رخيص قبل قراءة القائمة
  const precached = await precachedUrls();
  const evictable = keys.filter((k) => !precached.has(k.url) && k.url !== manifestKey());
  for (const old of evictable.slice(0, evictable.length - MAX_ENTRIES)) {
    await cache.delete(old);
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
        // The mobile bar uses native document links so it cannot be blocked by
        // an App Router RSC request. Return the precached HTML immediately;
        // waiting for GitHub Pages here made every tap look like a spinner.
        const cached = await caches.match(req);
        if (cached) {
          event.waitUntil(
            (async () => {
              try {
                const res = await fetch(req, { cache: "no-store" });
                if (res.ok && (res.type === "basic" || res.type === "default")) {
                  await putAndTrim(req, res.clone());
                }
              } catch {
                /* cached navigation is already available while offline */
              }
            })()
          );
          return cached;
        }

        try {
          const res = await fetch(req);
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

  // ===== حمولةُ التنقّل (RSC) — ما تنتظره نقرةُ التبويب =====
  // في App Router لا ينتقل الرابط عند الضغط حتى تصل حمولةُ المسار
  // (`/journal/index.txt?_rsc=<بصمةُ البناء>`)، و`Link` يلغي سلوك الرابط
  // الأصليّ قبل أن ينتظرها. فما دامت الحمولة في الطريق **لا يقع شيء** عند
  // الضغط: لا تنقّل، ولا رسالة، ولا حتى انتقالُ متصفّحٍ عاديّ — يبدو الشريط
  // السفلي معطّلاً تماماً.
  //
  // وهذه الحمولات مخزّنةٌ عندنا مسبقاً منذ التثبيت، لكن بمسارها المجرّد
  // (`/journal/index.txt`) بينما يطلبها المتصفّح بالاستعلام (`?_rsc=`)،
  // و`caches.match` يطابق الاستعلامَ افتراضاً — فكان الخزن يخيب في **كلّ**
  // نقرة وتذهب كلُّ واحدةٍ إلى الشبكة. وعند إقلاعٍ بارد على الجوّال (والشبكة لم
  // تستيقظ بعد) تتعلّق الطلبات السبعة معاً، فتموت التبويبات حتى يخرج المالك من
  // التطبيق ويعود. `ignoreSearch` يجعلها تُخدَم من الخزن فوراً وبلا شبكةٍ أصلاً.
  //
  // آمنٌ عبر الإصدارات: اسم الخزن يحمل بصمة البناء، فكلّ نشرةٍ تعيد التثبيت
  // بخزنٍ جديد وتمحو القديم — فلا يمكن أن تُخدَم حمولةُ بناءٍ لا تطابق الصفحة
  // إلا في نافذة النشر نفسها، وهي الحالة التي كانت الشبكة تعطي فيها الجديدَ
  // كذلك. ونخزّن الردّ بالمسار المجرّد فيبقى في الخزن مدخلٌ واحدٌ لكلّ مسار.
  if (url.searchParams.has("_rsc")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok && (res.type === "basic" || res.type === "default")) {
          event.waitUntil(putAndTrim(url.origin + url.pathname, res.clone()));
        }
        return res;
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
