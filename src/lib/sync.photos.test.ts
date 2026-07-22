import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { AppData, JournalEntry } from "./types";
import { EMPTY_HIFZ, EMPTY_KHATMA } from "./types";

// ===================== Mocks =====================
// sync.ts talks to Firestore, idb-keyval and the R2 Worker. We stub all three so
// the media-hydration logic (the part this suite exercises) runs in plain Node.

const setDocMock = vi.fn(async () => {});
const getDocMock = vi.fn(async () => ({ exists: () => false }));
const getDocsMock = vi.fn(async () => ({ docs: [], forEach: () => {} }));

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) => ({ __doc: args }),
  collection: (...args: unknown[]) => ({ __col: args }),
  getDoc: (...a: unknown[]) => getDocMock(...(a as [])),
  setDoc: (...a: unknown[]) => setDocMock(...(a as [])),
  getDocs: (...a: unknown[]) => getDocsMock(...(a as [])),
  onSnapshot: vi.fn(),
  deleteDoc: vi.fn(async () => {}),
  // The main-doc write now runs inside a transaction; the mock forwards txn.get
  // to getDocMock and txn.set to setDocMock so existing assertions (which scan
  // setDocMock.mock.calls for the main/shard writes) keep working, and the CAS
  // conflict path is exercisable by pointing getDocMock at a higher revision.
  runTransaction: async (_db: unknown, fn: (txn: unknown) => Promise<unknown>) =>
    fn({
      get: (...a: unknown[]) => getDocMock(...(a as [])),
      set: (...a: unknown[]) => { setDocMock(...(a as [])); },
    }),
}));

vi.mock("./firebase", () => ({ db: { __db: true }, getSyncSpace: () => "space" }));

const idbStore = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idbStore.get(k),
  set: async (k: string, v: unknown) => {
    idbStore.set(k, v);
  },
}));

vi.mock("@/components/ui/UndoToast", () => ({ showToast: vi.fn() }));

const MEDIA_CACHE_PREFIX = "madar-media:";
const HASH_A = "a".repeat(32);
const HASH_B = "b".repeat(32);

let sync: typeof import("./sync");

beforeAll(async () => {
  process.env.NEXT_PUBLIC_R2_WORKER_URL = "https://worker.example";
  sync = await import("./sync");
});

// Minimal valid AppData carrying just the journal entries a test needs.
function appData(journalEntries: JournalEntry[]): AppData {
  return {
    transactions: [],
    books: [],
    readingLogs: [],
    journalEntries,
    habits: [],
    recurring: [],
    budgets: [],
    categories: [],
    reserves: [],
    prayerLogs: [],
    quranReflections: [],
    quranHifz: structuredClone(EMPTY_HIFZ),
    quranWird: [],
    quranKhatma: structuredClone(EMPTY_KHATMA),
    dailyBudget: null,
    monthlyIncome: null,
    futureLetters: [],
    salaryDay: 27,
    lastSalaryConfirm: null,
    readingGoal: null,
    merchantRules: {},
    deleted: {},
    lastUpdated: "2026-01-01T00:00:00.000Z",
  };
}

// An entry as it arrives from the cloud: media replaced by content-hash refs.
function cloudEntry(id: string, refs: { photoRefs?: string[]; audioRefs?: string[] }): JournalEntry {
  return { id, date: "2026-01-01", content: "x", ...refs } as JournalEntry;
}

beforeEach(() => {
  idbStore.clear();
  setDocMock.mockClear();
  getDocMock.mockClear();
  getDocMock.mockResolvedValue({ exists: () => false });
  // Default: every R2/legacy fetch fails, simulating R2 being unreachable.
  global.fetch = vi.fn(async () => ({
    ok: false,
    status: 503,
    json: async () => ({}),
  })) as unknown as typeof fetch;
});

describe("hydrateCloudPhotos — ref preservation on R2 failure", () => {
  it("keeps photoRefs/audioRefs when the bytes can't be fetched (no silent drop)", async () => {
    const main = appData([cloudEntry("e1", { photoRefs: [HASH_A], audioRefs: [HASH_B] })]);

    const out = await sync.hydrateCloudPhotos("space", main);
    const e = out.journalEntries[0] as JournalEntry & { photoRefs?: string[]; audioRefs?: string[] };

    // No bytes arrived …
    expect(e.photo).toBeUndefined();
    expect(e.photos).toBeUndefined();
    expect(e.audio).toBeUndefined();
    expect(e.audios).toBeUndefined();
    // … but the references survive so the photo isn't orphaned.
    expect(e.photoRefs).toEqual([HASH_A]);
    expect(e.audioRefs).toEqual([HASH_B]);
  });

  it("keeps only the refs that failed when a resolve partially succeeds", async () => {
    // HASH_A is cached locally (resolves), HASH_B is not and R2 is down.
    idbStore.set(MEDIA_CACHE_PREFIX + HASH_A, "data:image/png;base64,AAAA");
    const main = appData([cloudEntry("e1", { photoRefs: [HASH_A, HASH_B] })]);

    const out = await sync.hydrateCloudPhotos("space", main);
    const e = out.journalEntries[0] as JournalEntry & { photoRefs?: string[] };

    expect(e.photos).toEqual(["data:image/png;base64,AAAA"]);
    expect(e.photo).toBe("data:image/png;base64,AAAA");
    // The unresolved HASH_B is retained; the resolved HASH_A is not.
    expect(e.photoRefs).toEqual([HASH_B]);
  });

  it("inlines from the local cache and drops the ref once fully resolved", async () => {
    idbStore.set(MEDIA_CACHE_PREFIX + HASH_A, "data:image/png;base64,AAAA");
    const main = appData([cloudEntry("e1", { photoRefs: [HASH_A] })]);

    const out = await sync.hydrateCloudPhotos("space", main);
    const e = out.journalEntries[0] as JournalEntry & { photoRefs?: string[] };

    expect(e.photos).toEqual(["data:image/png;base64,AAAA"]);
    expect(e.photoRefs).toBeUndefined();
  });

  it("supports the legacy single audioRef field", async () => {
    idbStore.set(MEDIA_CACHE_PREFIX + HASH_B, "data:audio/webm;base64,BBBB");
    const legacy = { id: "e1", date: "2026-01-01", content: "x", audioRef: HASH_B } as unknown as JournalEntry;
    const out = await sync.hydrateCloudPhotos("space", appData([legacy]));
    const e = out.journalEntries[0] as JournalEntry;
    expect(e.audios).toEqual(["data:audio/webm;base64,BBBB"]);
  });
});

describe("hydrateCloudPhotos — bounded concurrency", () => {
  it("never exceeds the pool size even with many refs", async () => {
    let inflight = 0;
    let maxInflight = 0;
    global.fetch = vi.fn(async () => {
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 3));
      inflight--;
      return { ok: false, status: 503, json: async () => ({}) };
    }) as unknown as typeof fetch;

    // 24 distinct refs across 24 entries — all miss the cache, so all hit R2.
    const entries = Array.from({ length: 24 }, (_, i) =>
      cloudEntry(`e${i}`, { photoRefs: [String(i).padStart(2, "0") + "c".repeat(30)] })
    );
    await sync.hydrateCloudPhotos("space", appData(entries));

    expect(maxInflight).toBeGreaterThan(1); // genuinely parallel …
    expect(maxInflight).toBeLessThanOrEqual(6); // … but bounded by the pool.
  });

  it("fetches a hash shared by several entries only once", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const shared = { photoRefs: [HASH_A] };
    await sync.hydrateCloudPhotos("space", appData([
      cloudEntry("e1", shared),
      cloudEntry("e2", shared),
      cloudEntry("e3", shared),
    ]));

    // One download-url call for the single distinct hash, not three.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("hydrateCloudPhotos — photo order is preserved across a partial failure", () => {
  it("stashes the original ref order when a middle photo fails to resolve", async () => {
    const [A, B, C] = [HASH_A, HASH_B, "c".repeat(32)];
    idbStore.set(MEDIA_CACHE_PREFIX + A, "data:image/png;base64,AAAA");
    idbStore.set(MEDIA_CACHE_PREFIX + C, "data:image/png;base64,CCCC");
    // B is not cached and R2 is down → it fails.
    const out = await sync.hydrateCloudPhotos("space", appData([cloudEntry("e1", { photoRefs: [A, B, C] })]));
    const e = out.journalEntries[0] as JournalEntry & { photoRefs?: string[]; photoOrder?: string[] };

    expect(e.photos).toEqual(["data:image/png;base64,AAAA", "data:image/png;base64,CCCC"]);
    expect(e.photoRefs).toEqual([B]); // only the unresolved one survives …
    expect(e.photoOrder).toEqual([A, B, C]); // … but the full order is remembered.
  });
});

describe("saveUserData — the surviving ref keeps its original slot", () => {
  it("splices the survivor back into place instead of appending it", async () => {
    const [A, B, C] = [HASH_A, HASH_B, "c".repeat(32)];
    const workerUrl = (h: string) =>
      `https://worker.example/v1/media/blob?hash=${h}&exp=9999999999999&sig=x`;
    // The entry as it looks right after a partial hydrate: A and C resolved (held
    // as cloud pointers here), B still a bare surviving ref, order remembered.
    const entry = {
      id: "e1",
      date: "2026-01-01",
      content: "x",
      photos: [workerUrl(A), workerUrl(C)],
      photoRefs: [B],
      photoOrder: [A, B, C],
    } as unknown as JournalEntry;

    await sync.saveUserData("space", appData([entry]));

    const shardCall = setDocMock.mock.calls.find(
      (c) => Array.isArray((c[0] as { __doc?: unknown[] })?.__doc) &&
             ((c[0] as { __doc: unknown[] }).__doc as unknown[]).includes("journal")
    );
    const written = (shardCall![1] as { entries: Array<{ id: string; photoRefs?: string[] }> }).entries;
    const saved = written.find((x) => x.id === "e1")!;
    // Without the fix this would be [A, C, B]; the order stash restores [A, B, C].
    expect(saved.photoRefs).toEqual([A, B, C]);
  });
});

describe("saveUserData — revision CAS", () => {
  it("bumps revision from the current cloud value and returns it", async () => {
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ revision: 4 }) });
    const res = await sync.saveUserData("space", appData([]), 4);
    expect(res.revision).toBe(5);
    // The main-doc write carries the bumped revision.
    const mainCall = setDocMock.mock.calls.find(
      (c) => Array.isArray((c[0] as { __doc?: unknown[] })?.__doc) &&
             !((c[0] as { __doc: unknown[] }).__doc as unknown[]).includes("journal")
    );
    expect((mainCall![1] as { revision: number }).revision).toBe(5);
  });

  it("throws RevisionConflictError when the cloud advanced past expectedRevision", async () => {
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ revision: 9 }) });
    await expect(sync.saveUserData("space", appData([]), 3)).rejects.toBeInstanceOf(
      sync.RevisionConflictError
    );
  });

  it("does not CAS-check when no expectedRevision is passed (initial seed)", async () => {
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ revision: 7 }) });
    const res = await sync.saveUserData("space", appData([])); // no expectedRevision
    expect(res.revision).toBe(8); // just bumps, never conflicts
  });
});

describe("inventoryMedia — a pending ref counts as in-cloud, not orphan", () => {
  it("classifies a photoRef that's present in R2 but not downloaded here", async () => {
    global.fetch = vi.fn(async (url: unknown, opts: unknown) => {
      const u = String(url);
      if (u.includes("/v1/media/inventory")) {
        const kind = JSON.parse((opts as { body: string }).body).kind;
        return { ok: true, status: 200, json: async () => ({ hashes: kind === "photos" ? [HASH_A] : [] }) };
      }
      return { ok: false, status: 503, json: async () => ({}) };
    }) as unknown as typeof fetch;

    // An entry that holds ONLY a pending ref (bytes never fetched on this device).
    const inv = await sync.inventoryMedia("space", appData([cloudEntry("e1", { photoRefs: [HASH_A] })]));

    expect(inv.storageReachable).toBe(true);
    expect(inv.photos.referenced).toBe(1); // the ref is counted …
    expect(inv.photos.inCloud).toBe(1); // … and recognized as safe in R2 …
    expect(inv.photos.orphans).toBe(0); // … so it is NOT mislabeled an orphan.
    expect(inv.photos.broken).toBe(0);
  });
});

describe("inlineCachedMedia — drops a tombstoned photo so a delete doesn't resurrect", () => {
  it("removes a deleted data: photo a merge may have filled back", async () => {
    const { photoHash, mediaTombKey } = await import("./mediaHash");
    const p = "data:image/png;base64,ZZZZ";
    const h = await photoHash(p);
    const entry = { id: "e1", date: "2026-01-01", content: "x", photos: [p], photo: p } as JournalEntry;
    const data = { ...appData([entry]), deletedMedia: { [mediaTombKey("e1", "photos", h)]: Date.now() } };

    const out = await sync.inlineCachedMedia("space", data);
    const e = out.journalEntries![0];
    expect(e.photos).toEqual([]);
    expect(e.photo).toBeUndefined();
  });

  it("keeps a shared photo in another entry that did NOT delete it", async () => {
    const { photoHash, mediaTombKey } = await import("./mediaHash");
    const p = "data:image/png;base64,SHARED";
    const h = await photoHash(p);
    const e1 = { id: "e1", date: "2026-01-01", content: "x", photos: [p], photo: p } as JournalEntry;
    const e2 = { id: "e2", date: "2026-01-01", content: "y", photos: [p], photo: p } as JournalEntry;
    const data = { ...appData([e1, e2]), deletedMedia: { [mediaTombKey("e1", "photos", h)]: Date.now() } };

    const out = await sync.inlineCachedMedia("space", data);
    const byId = new Map(out.journalEntries!.map((e) => [e.id, e]));
    expect(byId.get("e1")!.photos).toEqual([]); // dropped from e1
    expect(byId.get("e2")!.photos).toEqual([p]); // kept in e2
  });
});

describe("saveUserData — a tombstoned photo is never pushed back", () => {
  it("drops a deleted media hash from the written refs and manifest", async () => {
    const workerUrl = (h: string) =>
      `https://worker.example/v1/media/blob?hash=${h}&exp=9999999999999&sig=x`;
    // Entry still carries both photos (a merge could have filled B back), but B
    // is tombstoned — the save must not re-reference it.
    const entry = {
      id: "e1", date: "2026-01-01", content: "x",
      photos: [workerUrl(HASH_A), workerUrl(HASH_B)], photo: workerUrl(HASH_A),
    } as unknown as JournalEntry;
    const data = { ...appData([entry]), deletedMedia: { [`e1:photos:${HASH_B}`]: Date.now() } };

    await sync.saveUserData("space", data);

    const shardCall = setDocMock.mock.calls.find(
      (c) => Array.isArray((c[0] as { __doc?: unknown[] })?.__doc) &&
             ((c[0] as { __doc: unknown[] }).__doc as unknown[]).includes("journal")
    );
    const written = (shardCall![1] as { entries: Array<{ id: string; photoRefs?: string[] }> }).entries;
    const saved = written.find((x) => x.id === "e1")!;
    expect(saved.photoRefs).toEqual([HASH_A]); // B dropped, not orphaned-and-kept

    const mainCall = setDocMock.mock.calls.find(
      (c) => Array.isArray((c[0] as { __doc?: unknown[] })?.__doc) &&
             !((c[0] as { __doc: unknown[] }).__doc as unknown[]).includes("journal")
    );
    const mainDoc = mainCall![1] as { photoManifest: string[] };
    expect(mainDoc.photoManifest).not.toContain(HASH_B);
  });
});

describe("saveUserData — a surviving ref is never orphaned", () => {
  it("re-emits refs kept by a failed hydrate into the written shard + manifest", async () => {
    // Mirror production exactly: load the cloud doc (which seeds the manifest and
    // hands back the entry as a photoRef), then hydrate with R2 down, then save.
    getDocMock.mockImplementation(async (ref: { __doc?: unknown[] }) => {
      // The main doc is [db, "userData", space]; a legacy media sub-doc is
      // [db, "userData", space, kind, hash]. Only the main doc exists here.
      const parts = ref?.__doc ?? [];
      if (parts.length <= 3) {
        return {
          exists: () => true,
          data: () => ({
            ...appData([]),
            photoManifest: [HASH_A],
            audioManifest: [],
            mediaProvider: "r2-v1",
            journalEntries: [],
          }),
        };
      }
      return { exists: () => false };
    });
    getDocsMock.mockResolvedValueOnce({
      docs: [],
      forEach: (cb: (d: { id: string; data: () => unknown }) => void) =>
        cb({ id: "2026-01", data: () => ({ entries: [cloudEntry("e1", { photoRefs: [HASH_A] })] }) }),
    });

    const loaded = await sync.loadUserMain("space");
    expect(loaded).not.toBeNull();

    // Simulate the dangerous sequence: cloud entry → hydrate fails → an edit
    // touches the entry (forcing its shard to be rewritten) → save.
    const hydrated = await sync.hydrateCloudPhotos("space", loaded!);
    const e = hydrated.journalEntries[0] as JournalEntry & { photoRefs?: string[] };
    expect(e.photoRefs).toEqual([HASH_A]); // guard: precondition holds
    hydrated.journalEntries[0] = { ...e, content: "edited while R2 was down" };

    await sync.saveUserData("space", hydrated);

    // Find the journal-shard write and confirm the entry still points at HASH_A.
    const shardCall = setDocMock.mock.calls.find(
      (c) => Array.isArray((c[0] as { __doc?: unknown[] })?.__doc) &&
             ((c[0] as { __doc: unknown[] }).__doc as unknown[]).includes("journal")
    );
    expect(shardCall).toBeDefined();
    const written = (shardCall![1] as { entries: Array<{ id: string; photoRefs?: string[] }> }).entries;
    const savedEntry = written.find((x) => x.id === "e1")!;
    expect(savedEntry.photoRefs).toEqual([HASH_A]);

    // And the main-doc manifest carries the hash, so inventory won't call it broken.
    const mainCall = setDocMock.mock.calls.find(
      (c) => Array.isArray((c[0] as { __doc?: unknown[] })?.__doc) &&
             !((c[0] as { __doc: unknown[] }).__doc as unknown[]).includes("journal")
    );
    expect(mainCall).toBeDefined();
    const mainDoc = mainCall![1] as { photoManifest: string[] };
    expect(mainDoc.photoManifest).toContain(HASH_A);
  });
});
