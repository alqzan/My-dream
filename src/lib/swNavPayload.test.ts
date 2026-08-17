import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ===== حارسُ الشريط السفلي =====
// نقرةُ التبويب في App Router لا تنتقل حتى تصل حمولةُ المسار
// (`/journal/index.txt?_rsc=<بصمة>`)، و`Link` ألغى سلوك الرابط الأصليّ قبل أن
// ينتظرها — فتعليقُ هذا الطلب يعني تبويباً ميّتاً بلا أيّ أثرٍ للضغط. الحمولات
// مخزّنةٌ مسبقاً بمسارها المجرّد، وكان `caches.match` يطابق الاستعلامَ فيخيب
// دائماً وتذهب كلُّ نقرةٍ إلى الشبكة. هذا الاختبار يشغّل `public/sw.js` نفسه في
// نطاقٍ وهميّ ويتحقّق أنّ الحمولة تُخدَم من الخزن **بلا لمس الشبكة**.

const SW_SRC = readFileSync(fileURLToPath(new URL("../../public/sw.js", import.meta.url)), "utf8");

interface FakeReq { method: string; url: string; mode: string }
const req = (url: string, mode = "no-cors"): FakeReq => ({ method: "GET", url, mode });

const bare = (url: string) => url.split("?")[0];

class FakeCache {
  entries = new Map<string, unknown>();
  async put(r: FakeReq | string, res: unknown) {
    this.entries.set(typeof r === "string" ? r : r.url, res);
  }
  async add(url: string) {
    this.entries.set(url, { url, ok: true, type: "basic", clone: () => ({ url }) });
  }
  async match(r: FakeReq | string, opts: { ignoreSearch?: boolean } = {}) {
    const url = typeof r === "string" ? r : r.url;
    if (this.entries.has(url)) return this.entries.get(url);
    if (opts.ignoreSearch) {
      for (const [k, v] of this.entries) if (bare(k) === bare(url)) return v;
    }
    return undefined;
  }
  async keys() {
    return [...this.entries.keys()].map((url) => ({ url, mode: "no-cors" }));
  }
  async delete(r: FakeReq | string) {
    return this.entries.delete(typeof r === "string" ? r : r.url);
  }
}

/** Loads public/sw.js into a stub worker scope and returns its fetch handler. */
function loadWorker(opts: { cached?: string[]; fetchImpl?: (r: FakeReq | URL) => Promise<unknown> } = {}) {
  const cache = new FakeCache();
  for (const url of opts.cached ?? []) cache.entries.set(url, { url, ok: true, type: "basic", clone: () => ({ url }) });

  const listeners = new Map<string, (e: unknown) => void>();
  const self = {
    addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    registration: { scope: "https://example.test/" },
  };
  const caches = {
    open: async () => cache,
    match: (r: FakeReq | string, o?: { ignoreSearch?: boolean }) => cache.match(r, o),
    keys: async () => ["madar-test"],
    delete: async () => true,
  };
  const fetchImpl = opts.fetchImpl ?? (async () => { throw new Error("network touched"); });
  const fetchSpy = vi.fn(fetchImpl);
  const location = { origin: "https://example.test" };

  // eslint-disable-next-line no-new-func
  new Function("self", "caches", "fetch", "location", SW_SRC)(self, caches, fetchSpy, location);

  const onFetch = listeners.get("fetch")!;
  // وعودُ `waitUntil` تُجمَع بدل أن تُرمى: عملُ الخلفية (الخزن والتشذيب) يقع
  // فيها، فاختبارُه يحتاج انتظارَها صراحةً — والاختبارات التي لا تعنيها تتجاهلها.
  const waits: Promise<unknown>[] = [];
  const handle = async (request: FakeReq) => {
    let responded: Promise<unknown> | undefined;
    onFetch({
      request,
      respondWith: (p: Promise<unknown>) => { responded = p; },
      waitUntil: (p: Promise<unknown>) => { waits.push(p); },
    });
    return responded === undefined ? undefined : await responded;
  };
  const install = async () => {
    let done: Promise<unknown> | undefined;
    listeners.get("install")!({ waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
  };
  const settleWaits = async () => { await Promise.allSettled(waits.splice(0)); };
  return { handle, fetchSpy, cache, install, settleWaits };
}

describe("service worker · حمولةُ تنقّل RSC", () => {
  it("تعرض الصفحة المسبقة التخزين فوراً قبل تحديثها من الشبكة", async () => {
    const cachedUrl = "https://example.test/journal/";
    const { handle, fetchSpy } = loadWorker({
      cached: [cachedUrl],
      // If navigation waited for this request, the test would never finish.
      fetchImpl: () => new Promise(() => {}),
    });

    const res = await handle(req(cachedUrl, "navigate"));

    expect(res).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledOnce(); // background refresh only
  });

  it("تُخدَم من الخزن المسبق رغم اختلاف `?_rsc=` — بلا شبكة", async () => {
    const { handle, fetchSpy } = loadWorker({ cached: ["https://example.test/journal/index.txt"] });

    const res = await handle(req("https://example.test/journal/index.txt?_rsc=1p-R_iEY6bj0"));

    expect(res).toBeTruthy();
    // الضمانة الحقيقية: الشبكة لم تُلمس، فلا يمكن لطلبٍ متعلّقٍ أن يقتل التبويب.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("لا تخلط المسارات: حمولةُ مسارٍ لا تُخدَم لمسارٍ آخر", async () => {
    const net = { url: "net", ok: true, type: "basic", clone: () => ({ url: "net" }) };
    const { handle, fetchSpy } = loadWorker({
      cached: ["https://example.test/journal/index.txt"],
      fetchImpl: async () => net,
    });

    const res = await handle(req("https://example.test/quran/index.txt?_rsc=1p-R_iEY6bj0"));

    expect(res).toBe(net);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("تُخزَّن الحمولة المُنزَّلة بالمسار المجرّد فتخدم بصمةَ البناء التالية", async () => {
    const net = { url: "net", ok: true, type: "basic", clone: () => ({ url: "net", cloned: true }) };
    const { handle, cache } = loadWorker({ fetchImpl: async () => net });

    await handle(req("https://example.test/stats/index.txt?_rsc=abc"));

    expect([...cache.entries.keys()]).toEqual(["https://example.test/stats/index.txt"]);
  });

  // ===== حارسُ الخزن المسبق =====
  // `cache.keys()` بترتيب الإدخال، فأقدمُ المدخلات مدخلاتُ التثبيت. وكان التشذيب
  // يحذف الأقدم بلا تمييز، فما إن يتجاوز الخزنُ سقفه حتى يأكل التطبيقَ نفسه:
  // حزمةٌ محذوفة → طلبٌ للشبكة → `ChunkLoadError` على شبكةٍ نائمة → `error.tsx`
  // يمحو كلّ شيءٍ ويعيد التحميل، فيُقذف المالك من مكانه إلى شاشة «مدار».
  it("التشذيب لا يأكل الخزن المسبق مهما تجاوز السقف", async () => {
    const urls = Array.from({ length: 205 }, (_, i) => `https://example.test/_next/static/c${i}.js`);
    const manifest = { ok: true, json: async () => ({ urls }) };
    const asset = { url: "new", ok: true, type: "basic", clone: () => ({ url: "new" }) };
    const { handle, cache, install, settleWaits } = loadWorker({
      fetchImpl: async (r: FakeReq | URL) => (String(r).endsWith("precache.json") ? manifest : asset),
    });

    await install();
    expect(cache.entries.size).toBe(urls.length + 1); // + قائمةُ الخزن المسبق

    // أصلٌ جديد وقت التشغيل يتجاوز بالخزن سقفَه.
    await handle(req("https://example.test/_next/static/runtime-new.js"));
    await settleWaits();

    for (const u of urls) expect(cache.entries.has(u)).toBe(true);
  });

  it("يشذّب ما أضافه التشغيل وحده حين يتجاوز سقفَه", async () => {
    const manifest = { ok: true, json: async () => ({ urls: ["https://example.test/quran/"] }) };
    const asset = { url: "new", ok: true, type: "basic", clone: () => ({ url: "new" }) };
    const { handle, cache, install, settleWaits } = loadWorker({
      fetchImpl: async (r: FakeReq | URL) => (String(r).endsWith("precache.json") ? manifest : asset),
    });

    await install();
    for (let i = 0; i < 201; i++) {
      await handle(req(`https://example.test/_next/static/r${i}.js`));
      await settleWaits(); // كتابةٌ ثمّ تشذيبٌ بترتيبٍ معلوم
    }

    expect(cache.entries.has("https://example.test/quran/")).toBe(true); // الخزن المسبق سليم
    expect(cache.entries.has("https://example.test/_next/static/r0.js")).toBe(false); // أقدمُ ما أضافه التشغيل
    expect(cache.entries.has("https://example.test/_next/static/r200.js")).toBe(true);
  });

  it("الأصول العادية تبقى على المطابقة التامّة (لا يمسّها `ignoreSearch`)", async () => {
    const { handle, fetchSpy } = loadWorker({
      cached: ["https://example.test/_next/static/chunk.js"],
      fetchImpl: async () => ({ url: "net", ok: true, type: "basic", clone: () => ({}) }),
    });

    const hit = await handle(req("https://example.test/_next/static/chunk.js"));
    expect(hit).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
