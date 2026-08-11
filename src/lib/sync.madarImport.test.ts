// حارس بوابة التحقّق من وجود وسائط .madarimport في R2 (sync.ts#verifyMediaHashesPresent)
// — الفحص الوحيد الذي يحق له السماح بإنشاء أي مذكرة من ملف مستورد الذكريات.
// نفس أسلوب تزييف Firebase/idb-keyval المتّبع في sync.photos.test.ts.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) => ({ __doc: args }),
  collection: (...args: unknown[]) => ({ __col: args }),
  getDoc: vi.fn(async () => ({ exists: () => false })),
  setDoc: vi.fn(async () => {}),
  getDocs: vi.fn(async () => ({ docs: [], forEach: () => {} })),
  onSnapshot: vi.fn(),
  deleteDoc: vi.fn(async () => {}),
  runTransaction: async (_db: unknown, fn: (txn: unknown) => Promise<unknown>) =>
    fn({ get: vi.fn(async () => ({ exists: () => false })), set: vi.fn() }),
}));

vi.mock("./firebase", () => ({ db: { __db: true }, getSyncSpace: () => "space" }));

vi.mock("idb-keyval", () => ({
  get: async () => undefined,
  set: async () => {},
}));

vi.mock("@/components/ui/UndoToast", () => ({ showToast: vi.fn() }));

const HASH_A = "a".repeat(32);
const HASH_B = "b".repeat(32);
const HASH_MISSING = "c".repeat(32);

let sync: typeof import("./sync");

beforeAll(async () => {
  process.env.NEXT_PUBLIC_R2_WORKER_URL = "https://worker.example";
  sync = await import("./sync");
});

beforeEach(() => {
  vi.restoreAllMocks();
});

// يجيب فقط عن /v1/media/inventory بلائحة هاشات كل kind — أي شيءٍ آخر مرفوض.
function mockInventory(photos: string[], audios: string[]) {
  global.fetch = vi.fn(async (url: unknown, opts: unknown) => {
    if (!String(url).includes("/v1/media/inventory")) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    const kind = JSON.parse((opts as { body: string }).body).kind;
    return { ok: true, status: 200, json: async () => ({ hashes: kind === "photos" ? photos : audios }) };
  }) as unknown as typeof fetch;
}

describe("verifyMediaHashesPresent — البوابة قبل إنشاء أي مذكرة", () => {
  it("ok=true حين كل الهاشات المرجعية موجودة فعلاً في R2", async () => {
    mockInventory([HASH_A], [HASH_B]);
    const r = await sync.verifyMediaHashesPresent("key", [HASH_A], [HASH_B]);
    expect(r.ok).toBe(true);
    expect(r.reachable).toBe(true);
    expect(r.missingPhotos).toEqual([]);
    expect(r.missingAudios).toEqual([]);
  });

  it("هاشٌ صورةٍ واحد ناقص → ok=false ويُسمّى بالضبط (توقف العملية كاملة)", async () => {
    mockInventory([HASH_A], [HASH_B]);
    const r = await sync.verifyMediaHashesPresent("key", [HASH_A, HASH_MISSING], [HASH_B]);
    expect(r.ok).toBe(false);
    expect(r.missingPhotos).toEqual([HASH_MISSING]);
    expect(r.missingAudios).toEqual([]);
  });

  it("هاشٌ صوتٍ واحد ناقص كافٍ لإفشال التحقّق أيضاً", async () => {
    mockInventory([HASH_A], []);
    const r = await sync.verifyMediaHashesPresent("key", [HASH_A], [HASH_B]);
    expect(r.ok).toBe(false);
    expect(r.missingAudios).toEqual([HASH_B]);
  });

  it("تعذّر الوصول لـR2 نفسه → ok=false وreachable=false (لا نفترض أنّ الغياب يعني ناقصاً)", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    const r = await sync.verifyMediaHashesPresent("key", [HASH_A], []);
    expect(r.ok).toBe(false);
    expect(r.reachable).toBe(false);
  });

  it("مفتاحٌ خاطئ (401) يُصنَّف auth لا خطأً عاماً", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: "bad key" }) })) as unknown as typeof fetch;
    const r = await sync.verifyMediaHashesPresent("wrong-key", [HASH_A], []);
    expect(r.reachable).toBe(false);
    expect(r.error).toBe("auth");
  });

  it("قوائم مراجع فارغة تنجح تلقائياً (لا شيء لنتحقّق منه)", async () => {
    mockInventory([], []);
    const r = await sync.verifyMediaHashesPresent("key", [], []);
    expect(r.ok).toBe(true);
  });
});
