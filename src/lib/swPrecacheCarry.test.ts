import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ===== حارسُ نقل الخزن بين النشرات =====
// اسمُ الخزن يحمل رقمَ البناء، فكلُّ نشرةٍ خزنٌ جديدٌ فارغ — وكان التثبيت
// يُنزّل القائمةَ كاملةً في كلّ مرّة. وما تحت `/_next/static/` معنوَنٌ بمحتواه،
// فاتّفاقُ الاسم اتّفاقُ محتوىً يقيناً ويُنسَخ بلا شبكة.
//
// والشرطُ المقابل — وهو شرطُ سلامةٍ لا تحسين — أنّ صفحةَ مسارٍ **لا تُنسَخ
// أبداً**: اسمُها ثابتٌ ومحتواها يتغيّر، ونسخُ القديمة إقلاعٌ بنسخةٍ تشير إلى
// حزمٍ حُذفت (ChunkLoadError). الاختباران أدناه يثبّتان الوجهين.

const SW_SRC = readFileSync(fileURLToPath(new URL("../../public/sw.js", import.meta.url)), "utf8");

class FakeCache {
  entries = new Map<string, { url: string; from: string }>();
  constructor(public name: string) {}
  async put(r: string | { url: string }, res: { url: string; from: string }) {
    this.entries.set(typeof r === "string" ? r : r.url, res);
  }
  async add(url: string) {
    this.entries.set(url, { url, from: "network" });
  }
  async match(r: string | { url: string }) {
    const hit = this.entries.get(typeof r === "string" ? r : r.url);
    return hit ? { ...hit, clone: () => ({ ...hit }) } : undefined;
  }
  async keys() { return [...this.entries.keys()].map((url) => ({ url })); }
  async delete() { return true; }
}

/** يُشغّل `public/sw.js` ويُطلق التثبيت على خزنٍ سابقٍ محدَّد المحتوى. */
async function install(previous: string[], urls: string[]) {
  const caches_ = new Map<string, FakeCache>();
  const old = new FakeCache("madar-oldbuild");
  for (const u of previous) old.entries.set(u, { url: u, from: "previous" });
  caches_.set("madar-oldbuild", old);

  const listeners = new Map<string, (e: unknown) => void>();
  const self = {
    addEventListener: (t: string, fn: (e: unknown) => void) => listeners.set(t, fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    registration: { scope: "https://example.test/" },
  };
  const caches = {
    open: async (name: string) => {
      if (!caches_.has(name)) caches_.set(name, new FakeCache(name));
      return caches_.get(name)!;
    },
    keys: async () => [...caches_.keys()],
    match: async () => undefined,
    delete: async (k: string) => caches_.delete(k),
  };
  const fetchSpy = vi.fn(async () => ({
    ok: true,
    json: async () => ({ urls }),
  }));
  const location = { origin: "https://example.test" };

  // eslint-disable-next-line no-new-func
  new Function("self", "caches", "fetch", "location", SW_SRC)(self, caches, fetchSpy, location);

  const waits: Promise<unknown>[] = [];
  listeners.get("install")!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
  await Promise.all(waits);

  const fresh = [...caches_.entries()].find(([k]) => k !== "madar-oldbuild")![1];
  return {
    sourceOf: (u: string) => fresh.entries.get(u)?.from,
    cached: fresh,
  };
}

const CHUNK = "/_next/static/chunks/1255-d27db1f5427ecc10.js";
const CSS = "/_next/static/css/6e4e9d1672f06b04.css";
const NEW_CHUNK = "/_next/static/chunks/9999-brandnewhash.js";
const ROUTE = "/quran/";
const MANIFEST = "/manifest.webmanifest";

describe("تثبيتُ العامل — نقلُ ما لم يتغيّر", () => {
  it("ما تحت _next/static ينُسَخ من خزن النشرة السابقة بلا شبكة", async () => {
    const { sourceOf } = await install([CHUNK, CSS], [CHUNK, CSS]);
    expect(sourceOf(CHUNK)).toBe("previous");
    expect(sourceOf(CSS)).toBe("previous");
  });

  it("وما تغيّر اسمُه يُنزَّل", async () => {
    const { sourceOf } = await install([CHUNK], [CHUNK, NEW_CHUNK]);
    expect(sourceOf(CHUNK)).toBe("previous");
    expect(sourceOf(NEW_CHUNK)).toBe("network");
  });

  // شرطُ السلامة: نسخُ صفحةٍ قديمة = إقلاعٌ يشير إلى حزمٍ حُذفت.
  it("صفحاتُ المسارات والبيان تُنزَّل دائماً ولو كانت في الخزن السابق", async () => {
    const { sourceOf } = await install([ROUTE, MANIFEST, CHUNK], [ROUTE, MANIFEST, CHUNK]);
    expect(sourceOf(ROUTE)).toBe("network");
    expect(sourceOf(MANIFEST)).toBe("network");
    expect(sourceOf(CHUNK)).toBe("previous");
  });

  it("وبلا خزنٍ سابق يُنزَّل كلُّ شيء (أوّلُ تثبيت)", async () => {
    const { sourceOf } = await install([], [ROUTE, CHUNK, CSS]);
    for (const u of [ROUTE, CHUNK, CSS]) expect(sourceOf(u)).toBe("network");
  });
});
