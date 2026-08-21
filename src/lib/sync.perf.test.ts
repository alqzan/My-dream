// ===================== حراسُ تكلفة المزامنة =====================
// هذه ليست اختباراتِ صحّةٍ بل اختباراتُ **تكلفة**: كم رحلةَ شبكةٍ يكلّف حفظٌ لا
// جديد فيه؟ كانت الإجابة قبل هذا الملف: تنزيلُ كامل مذكرات السحابة مرّتين، وإعادةُ
// كتابة كلّ شهور المذكرات، وإعادةُ رفع كلّ صورةٍ يحملها الجهاز — على تعديلٍ نصّيٍّ
// واحد. كلُّ واحدةٍ من الثلاث سقطت بصمت لأنّ النتيجة كانت **صحيحة**، والبطء وحده
// هو العَرَض. فالحارس هنا يعدّ النداءات لا يفحص المخرجات.

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { AppData, JournalEntry } from "./types";
import { EMPTY_HIFZ, EMPTY_KHATMA } from "./types";

const setDocMock = vi.fn(async () => {});
const getDocMock = vi.fn(async () => ({ exists: () => false }));
const getDocsMock = vi.fn(async () => ({ docs: [], forEach: () => {} }));
const deleteDocMock = vi.fn(async () => {});
// المستمع الحيّ: نحتفظ بردّ النداء لنُطلقه يدوياً في الاختبار.
let onSnapshotNext: ((snap: unknown) => void) | null = null;

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) => ({ __doc: args }),
  collection: (...args: unknown[]) => ({ __col: args }),
  getDoc: (...a: unknown[]) => getDocMock(...(a as [])),
  setDoc: (...a: unknown[]) => setDocMock(...(a as [])),
  getDocs: (...a: unknown[]) => getDocsMock(...(a as [])),
  deleteDoc: (...a: unknown[]) => deleteDocMock(...(a as [])),
  onSnapshot: (_ref: unknown, next: (snap: unknown) => void) => {
    onSnapshotNext = next;
    return () => { onSnapshotNext = null; };
  },
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
  set: async (k: string, v: unknown) => { idbStore.set(k, v); },
}));

vi.mock("@/components/ui/UndoToast", () => ({ showToast: vi.fn() }));

let sync: typeof import("./sync");
let photoHash: typeof import("./mediaHash").photoHash;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_R2_WORKER_URL = "https://worker.example";
  sync = await import("./sync");
  ({ photoHash } = await import("./mediaHash"));
});

function appData(journalEntries: JournalEntry[]): AppData {
  return {
    transactions: [],
    books: [],
    readingLogs: [],
    journalEntries,
    habits: [],
    recurring: [],
    installmentPlans: [],
    assets: [],
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

/** استجابةُ المستند الرئيس (كلّ ما ليس shard مذكرات). */
function mainDoc(extra: Record<string, unknown> = {}) {
  return {
    exists: () => true,
    data: () => ({ ...appData([]), journalEntries: [], mediaProvider: "r2-v1", ...extra }),
  };
}

/** استجابةُ مجموعة الshards: شهرٌ واحد بمذكراتٍ كما تعود من Firestore. */
function shardCollection(shards: Record<string, unknown[]>) {
  const docs = Object.entries(shards).map(([id, entries]) => ({ id, data: () => ({ entries }) }));
  return { docs, forEach: (cb: (d: { id: string; data: () => unknown }) => void) => docs.forEach(cb) };
}

const journalWrites = () =>
  setDocMock.mock.calls.filter((c) => {
    const parts = (c[0] as { __doc?: unknown[] })?.__doc ?? [];
    return parts.includes("journal");
  });

const mediaManifestWrites = () =>
  setDocMock.mock.calls.filter((c) => {
    const parts = (c[0] as { __doc?: unknown[] })?.__doc ?? [];
    return parts.includes("mediaManifest");
  });

const putUploads = () =>
  (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
    (c) => typeof c[0] === "string" && (c[0] as string).includes("/v1/media/put")
  );

beforeEach(() => {
  idbStore.clear();
  setDocMock.mockClear();
  getDocMock.mockClear();
  getDocsMock.mockClear();
  deleteDocMock.mockClear();
  getDocMock.mockResolvedValue({ exists: () => false });
  getDocsMock.mockResolvedValue({ docs: [], forEach: () => {} });
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ url: "https://r2.example/x", expiresAt: Date.now() + 60_000 }),
    blob: async () => new Blob(["x"], { type: "image/png" }),
  })) as unknown as typeof fetch;
});

describe("readCloudMain — القراءة على مرحلتين", () => {
  it("لا تنزّل shards المذكرات أصلاً: مستندٌ واحد فقط", async () => {
    getDocMock.mockResolvedValue(mainDoc({ revision: 7 }));

    const read = await sync.readCloudMain("space");

    expect(read).not.toBeNull();
    expect(read!.main.revision).toBe(7);
    expect(getDocMock).toHaveBeenCalledTimes(1);
    expect(getDocsMock).not.toHaveBeenCalled(); // ← بيت القصيد
  });

  it("`full()` تنزّل الshards مرّةً واحدة مهما تكرّر النداء", async () => {
    getDocMock.mockResolvedValue(mainDoc());
    getDocsMock.mockResolvedValue(
      shardCollection({ "2026-01": [{ date: "2026-01-01", id: "e1", content: "a" }] })
    );

    const read = await sync.readCloudMain("space");
    const first = await read!.full();
    const second = await read!.full();

    expect(getDocsMock).toHaveBeenCalledTimes(1);
    expect(first.journalEntries).toHaveLength(1);
    expect(second.journalEntries).toHaveLength(1);
  });

  it("المستمع الحيّ يسلّم المستند الرئيس بلا تنزيل الshards", async () => {
    const received: Array<Awaited<ReturnType<typeof sync.readCloudMain>>> = [];
    const unsub = sync.subscribeUserMain("space", (read) => { received.push(read); });

    onSnapshotNext!(mainDoc({ revision: 3 }));

    expect(received).toHaveLength(1);
    expect(received[0]!.main.revision).toBe(3);
    // صدى كتابتنا نحن يمرّ من هنا في كلّ حفظ — فلو نزّل الshards لصار كلُّ حفظٍ
    // تنزيلاً كاملاً للمكتبة يُرمى فور اتّخاذ القرار.
    expect(getDocsMock).not.toHaveBeenCalled();
    unsub();
  });
});

describe("writeJournalShards — الشهر الذي لم يتغيّر لا يُعاد كتابته", () => {
  // مفاتيحُ المذكرة تعود من Firestore مرتّبةً أبجدياً، وترتيبُ المصفوفة يقلبه
  // الدمج — فالتوقيع النصّيّ الساذج لا يتطابق أبداً، وكانت كلُّ الشهور تُكتب.
  const cloudShard = [
    { content: "b", date: "2026-01-20", id: "e2" },
    { content: "a", date: "2026-01-10", id: "e1" },
  ];
  const localSame: JournalEntry[] = [
    { id: "e1", date: "2026-01-10", content: "a" },
    { id: "e2", date: "2026-01-20", content: "b" },
  ] as unknown as JournalEntry[];

  beforeEach(() => {
    getDocMock.mockResolvedValue(mainDoc());
    getDocsMock.mockResolvedValue(shardCollection({ "2026-01": cloudShard }));
  });

  it("محتوىً واحد بترتيبٍ مختلف للمفاتيح والمصفوفة → صفرُ كتابات للshards", async () => {
    await sync.loadUserMain("space"); // يزرع تواقيع الشهور
    setDocMock.mockClear();

    await sync.saveUserData("space", appData(localSame));

    expect(journalWrites()).toHaveLength(0);
    // المستند الرئيس يُكتب دائماً (ختمُه ومراجعتُه) — الفرق أنّ المذكرات لا.
    expect(setDocMock).toHaveBeenCalledTimes(1);
  });

  it("تعديلٌ حقيقيّ في الشهر → يُكتب الشهر", async () => {
    await sync.loadUserMain("space");
    setDocMock.mockClear();

    const edited = localSame.map((e) =>
      e.id === "e1" ? ({ ...e, content: "a محرَّرة" } as JournalEntry) : e
    );
    await sync.saveUserData("space", appData(edited));

    const writes = journalWrites();
    expect(writes).toHaveLength(1);
    // حارس قواعد الإنتاج: النسخ القديمة لا تحمل هذه العلامة فتُرفض قبل
    // استبدال شهرٍ كامل من لقطة ناقصة.
    expect((writes[0][1] as { writerVersion?: number }).writerVersion).toBe(2);
  });

  it("شهرٌ جديد لا يجرّ معه إعادةَ كتابة الشهر القديم", async () => {
    await sync.loadUserMain("space");
    setDocMock.mockClear();

    const added = [
      ...localSame,
      { id: "e3", date: "2026-02-01", content: "c" } as unknown as JournalEntry,
    ];
    await sync.saveUserData("space", appData(added));

    const writes = journalWrites();
    expect(writes).toHaveLength(1);
    expect(((writes[0][0] as { __doc: unknown[] }).__doc).at(-1)).toBe("2026-02");
  });

  it("لقطة جهاز قديمة لا تختصر شهراً سحابياً كاملاً", async () => {
    const remote = [
      { id: "e1", date: "2026-01-10", content: "a", updatedAt: 100 },
      { id: "e2", date: "2026-01-20", content: "b", updatedAt: 100 },
    ];
    getDocsMock.mockResolvedValue(shardCollection({ "2026-01": remote }));
    getDocMock.mockImplementation(async (ref: { __doc?: unknown[] }) => {
      const parts = ref.__doc ?? [];
      return parts.includes("journal")
        ? { exists: () => true, data: () => ({ entries: remote }) }
        : mainDoc({ revision: 0 });
    });
    await sync.loadUserMain("space");
    setDocMock.mockClear();

    // The stale device knows only e1. Its save must union e2 back in before the
    // transaction writes the shard, never replace the cloud month with [e1].
    const editedE1 = { ...remote[0], content: "edited", updatedAt: 200 } as JournalEntry;
    await sync.saveUserData("space", appData([editedE1]));

    const write = journalWrites()[0][1] as { entries: JournalEntry[] };
    expect(write.entries.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
    expect(write.entries.find((e) => e.id === "e1")?.content).toBe("edited");
  });

  it("شهراً لا يعرفه الجهاز القديم لا يُحذف", async () => {
    const jan = [{ id: "e1", date: "2026-01-10", content: "a" }];
    const feb = [{ id: "e2", date: "2026-02-10", content: "b" }];
    getDocsMock.mockResolvedValue(shardCollection({ "2026-01": jan, "2026-02": feb }));
    await sync.loadUserMain("space");
    setDocMock.mockClear();
    deleteDocMock.mockClear();

    await sync.saveUserData("space", appData(jan as JournalEntry[]));

    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it("الحذف الصريح فقط يستطيع إزالة مذكرة سحابية", async () => {
    const remote = [
      { id: "e1", date: "2026-01-10", content: "a", updatedAt: 100 },
      { id: "e2", date: "2026-01-20", content: "b", updatedAt: 100 },
    ];
    getDocsMock.mockResolvedValue(shardCollection({ "2026-01": remote }));
    getDocMock.mockImplementation(async (ref: { __doc?: unknown[] }) => {
      const parts = ref.__doc ?? [];
      return parts.includes("journal")
        ? { exists: () => true, data: () => ({ entries: remote }) }
        : mainDoc({ revision: 0 });
    });
    await sync.loadUserMain("space");
    setDocMock.mockClear();

    const local = { ...appData([remote[0] as JournalEntry]), deleted: { e2: 5000 } };
    await sync.saveUserData("space", local);

    const write = journalWrites()[0][1] as { entries: JournalEntry[] };
    expect(write.entries.map((e) => e.id)).toEqual(["e1"]);
  });
});

describe("saveUserData — الوسيط الذي في R2 لا يُرفع ثانيةً", () => {
  const dataUrl = "data:image/png;base64,iVBORw0KGgo=";

  it("هاشٌ في المانيفست → صفرُ عمليات رفع، والمرجع باقٍ", async () => {
    const h = await photoHash(dataUrl);
    const main = mainDoc({ photoManifest: [h], audioManifest: [] });
    getDocMock.mockImplementation(async (ref: { __doc?: unknown[] }) =>
      (ref.__doc ?? []).includes("mediaManifest")
        ? { exists: () => false }
        : main
    );
    await sync.readCloudMain("space"); // يزرع knownCloudHashes من المانيفست

    const entry = { id: "e1", date: "2026-01-10", content: "a", photos: [dataUrl] };
    const res = await sync.saveUserData("space", appData([entry as unknown as JournalEntry]));

    // بعد الترطيب تصير كلّ صورةٍ في المتجر `data:`، فبلا حارس المانيفست كان كلُّ
    // حفظٍ يعيد رفع كامل وسائط الجهاز — وهذا أثقل ما في المزامنة.
    expect(putUploads()).toHaveLength(0);
    expect(res.mediaComplete).toBe(true);
    const written = journalWrites()[0][1] as { entries: Array<{ photoRefs?: string[] }> };
    expect(written.entries[0].photoRefs).toEqual([h]);
  });

  it("هاشٌ ليس في المانيفست → يُرفع مرّةً واحدة", async () => {
    const main = mainDoc({ photoManifest: [], audioManifest: [] });
    getDocMock.mockImplementation(async (ref: { __doc?: unknown[] }) =>
      (ref.__doc ?? []).includes("mediaManifest")
        ? { exists: () => false }
        : main
    );
    await sync.readCloudMain("space");

    const entry = { id: "e1", date: "2026-01-10", content: "a", photos: [dataUrl] };
    await sync.saveUserData("space", appData([entry as unknown as JournalEntry]));

    expect(putUploads()).toHaveLength(1);
  });

  it("ينقل manifest قديمًا كبيرًا إلى 256 shard ولا يعيده إلى المستند الرئيسي", async () => {
    const hashes = Array.from({ length: 5000 }, (_, i) => {
      const prefix = (i % 256).toString(16).padStart(2, "0");
      return `${prefix}${i.toString(16).padStart(30, "0")}`;
    });
    const main = mainDoc({ photoManifest: hashes, audioManifest: [] });
    getDocMock.mockImplementation(async (ref: { __doc?: unknown[] }) =>
      (ref.__doc ?? []).includes("mediaManifest")
        ? { exists: () => false }
        : main
    );

    await sync.readCloudMain("space");
    await sync.saveUserData("space", appData([]));

    expect(mediaManifestWrites()).toHaveLength(256);
    for (const call of mediaManifestWrites()) {
      const payload = call[1] as { kind: string; hashes: string[]; writerVersion: number };
      expect(payload.kind).toBe("photos");
      expect(payload.writerVersion).toBe(1);
      expect(payload.hashes.length).toBeGreaterThan(0);
    }
    const mainWrite = setDocMock.mock.calls.find((c) => {
      const parts = (c[0] as { __doc?: unknown[] })?.__doc ?? [];
      return parts.length === 3;
    });
    const payload = mainWrite![1] as { photoManifest?: string[]; mediaManifestVersion: number };
    expect(payload.photoManifest).toBeUndefined();
    expect(payload.mediaManifestVersion).toBe(2);
  });
});
