// تكامل جسر «مستورد الذكريات» مع بقية مدار: يتحقّق أنّ ما يُنتجه
// parseMadarImportFile يمرّ بلا كودٍ إضافي عبر آليتَي عدم التكرار والدمج
// القائمتين أصلاً لـDay One (store.ts#importDayOneEntries وmerge.ts#mergeAppData)،
// وأنّ بوابة sync.ts#verifyMediaHashesPresent توقف الاستيراد كاملاً قبل إضافة
// أي مذكرة حين ينقص هاشٌ واحد في R2. البنية JSON مطابقةٌ حرفياً لِما يُصدره
// MadarManifest.swift — راجع التعليق أعلى madarBridge.ts.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// المتجر المحفوظ يمرّ بـidb-keyval — نزيّفه كي يُقلَع في Node صرفاً (كما في
// dayOneImport.store.test.ts). sync.ts يحتاج تزييف Firebase/idb-keyval معاً
// (كما في sync.photos.test.ts) لأنّ verifyMediaHashesPresent يستدعيه أحد
// اختبارات هذا الملف.
const idb = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => { idb.set(k, v); },
  del: async (k: string) => { idb.delete(k); },
}));

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
vi.mock("@/components/ui/UndoToast", () => ({ showToast: vi.fn() }));

import { useAppStore } from "./store";
import { mergeAppData } from "./merge";
import {
  parseMadarImportFile,
  buildMemoryImporterConnection,
  type MadarBridgeRecord,
  type MadarBridgeMedia,
  type MadarBridgeSummary,
  type MadarBridgeManifest,
} from "./madarBridge";
import { EMPTY_HIFZ, EMPTY_KHATMA } from "./types";
import type { AppData, JournalEntry } from "./types";

let sync: typeof import("./sync");
beforeAll(async () => {
  process.env.NEXT_PUBLIC_R2_WORKER_URL = "https://worker.example";
  sync = await import("./sync");
});

const HASH_A = "a".repeat(32);
const HASH_B = "b".repeat(32);

function record(o: Partial<MadarBridgeRecord> & { id: string; dayOneUUID: string }): MadarBridgeRecord {
  return { createdAt: "2026-01-01T09:00:00Z", text: "نص", tags: [], starred: false, mediaIDs: [], ...o };
}
// إيصالٌ كاملٌ افتراضياً (uploadedByteCount/contentType) — لا يختبر هذا الملف
// النقص عمداً (ذاك في madarBridge.test.ts)، فالوسيط هنا يجب أن يكون صالحاً
// بالكامل كي يمرّ التحقّق الصارم في assertMediaIntegrity.
function media(o: Partial<MadarBridgeMedia> & { id: string; recordID: string }): MadarBridgeMedia {
  return { kind: "photo", status: "uploaded", uploadedByteCount: 1024, contentType: "image/jpeg", ...o };
}
function summaryOf(records: MadarBridgeRecord[], media_: MadarBridgeMedia[]): MadarBridgeSummary {
  const recordIds = new Set(records.map((r) => r.id));
  const referenced = media_.filter((m) => recordIds.has(m.recordID)).length;
  const tally = (s: MadarBridgeMedia["status"]) => media_.filter((m) => m.status === s).length;
  return {
    recordCount: records.length,
    referencedMediaCount: referenced,
    uploadedMediaCount: tally("uploaded"),
    metadataOnlyCount: tally("metadataOnly"),
    missingMediaCount: tally("missing"),
    failedMediaCount: tally("failed"),
    originalByteCount: 0,
    uploadedByteCount: 0,
    sourceReferencedMediaCount: media_.length,
    skippedByPolicyCount: 0,
  };
}
function manifestOf(records: MadarBridgeRecord[], media_: MadarBridgeMedia[]): MadarBridgeManifest {
  return {
    schemaVersion: 1,
    importID: "imp-1",
    createdAt: "2026-01-01T00:00:00Z",
    sourceFingerprint: "fp-1",
    sourceArchiveName: "Day One.zip",
    policy: "balanced",
    records,
    media: media_,
    summary: summaryOf(records, media_),
  };
}
function madarFile(records: MadarBridgeRecord[], media_: MadarBridgeMedia[] = []): Blob {
  return new Blob([JSON.stringify(manifestOf(records, media_))], { type: "application/json" });
}

beforeEach(() => {
  useAppStore.setState({ journalEntries: [], deleted: {} });
});

describe("استيراد .madarimport مرتين — بلا تكرار UUIDs", () => {
  it("الاستيراد الثاني لنفس الملف لا يضيف شيئاً", async () => {
    const records = [record({ id: "r1", dayOneUUID: "M1", text: "ذكرى", mediaIDs: ["p1"] })];
    const mediaItems = [media({ id: "p1", recordID: "r1", cloudHash: HASH_A, cloudKind: "photos" })];
    const file = madarFile(records, mediaItems);

    const first = await parseMadarImportFile(file);
    const r1 = useAppStore.getState().importDayOneEntries(first.entries);
    expect(r1.added).toBe(1);

    const second = await parseMadarImportFile(file);
    const r2 = useAppStore.getState().importDayOneEntries(second.entries);
    expect(r2.added).toBe(0);
    expect(useAppStore.getState().journalEntries).toHaveLength(1);
  });
});

describe("عدم الكتابة فوق نص عدّله المستخدم", () => {
  it("إعادة استيراد نفس dayOneUUID بنصٍّ مختلف لا يمسّ تعديل المستخدم المحلي", async () => {
    const file = madarFile([record({ id: "r1", dayOneUUID: "M2", text: "النص الأصلي من مستورد الذكريات" })]);
    const first = await parseMadarImportFile(file);
    useAppStore.getState().importDayOneEntries(first.entries);
    expect(useAppStore.getState().journalEntries[0].id).toBe("do-M2");

    // المستخدم يعدّل النص محلياً.
    useAppStore.getState().updateJournalEntry("do-M2", { content: "عدّلته أنا بنفسي" });
    expect(useAppStore.getState().journalEntries[0].content).toBe("عدّلته أنا بنفسي");

    // إعادة استيراد الملف نفسه — نصّه القديم لا يجب أن يطغى على تعديل المستخدم.
    const second = await parseMadarImportFile(file);
    const r = useAppStore.getState().importDayOneEntries(second.entries);
    expect(r.added).toBe(0);
    expect(useAppStore.getState().journalEntries[0].content).toBe("عدّلته أنا بنفسي");
  });
});

describe("hash ناقص في R2 يوقف الاستيراد كاملاً قبل إضافة أي مذكرة", () => {
  it("لا تُضاف أي مذكرة إن كان أحد الهاشات المرجعية غائباً عن R2", async () => {
    const records = [record({ id: "r1", dayOneUUID: "M4", mediaIDs: ["p1"] })];
    const mediaItems = [media({ id: "p1", recordID: "r1", cloudHash: HASH_A, cloudKind: "photos" })];
    const file = madarFile(records, mediaItems);
    const parsed = await parseMadarImportFile(file);
    expect(parsed.photoHashes).toEqual([HASH_A]);

    // R2 لا يملك HASH_A فعلياً (قائمة فارغة).
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ hashes: [] }) })) as unknown as typeof fetch;
    const check = await sync.verifyMediaHashesPresent("media-key", parsed.photoHashes, parsed.audioHashes);
    expect(check.ok).toBe(false);
    expect(check.missingPhotos).toEqual([HASH_A]);

    // البوابة كما تُستخدَم فعلياً في DayOneImport.tsx: لا نستدعي
    // importDayOneEntries إطلاقاً إن لم تنجح verifyMediaHashesPresent.
    if (check.ok) useAppStore.getState().importDayOneEntries(parsed.entries);
    expect(useAppStore.getState().journalEntries).toHaveLength(0);
  });

  it("حين تكون كل الهاشات موجودة، الاستيراد يمرّ ويضيف المذكرة", async () => {
    const records = [record({ id: "r1", dayOneUUID: "M5", mediaIDs: ["p1"] })];
    const mediaItems = [media({ id: "p1", recordID: "r1", cloudHash: HASH_B, cloudKind: "photos" })];
    const file = madarFile(records, mediaItems);
    const parsed = await parseMadarImportFile(file);

    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ hashes: [HASH_B] }) })) as unknown as typeof fetch;
    const check = await sync.verifyMediaHashesPresent("media-key", parsed.photoHashes, parsed.audioHashes);
    expect(check.ok).toBe(true);

    if (check.ok) useAppStore.getState().importDayOneEntries(parsed.entries);
    expect(useAppStore.getState().journalEntries).toHaveLength(1);
  });
});

// نفس بادئة idb-keyval المحلّية في sync.ts (خاصّة، غير مُصدَّرة — يعيد
// sync.photos.test.ts نفس الثابت هنا بدل استيراده لنفس السبب).
const MEDIA_CACHE_PREFIX = "madar-media:";

describe("معاينات الفيديو/PDF تظهر فعلياً داخل مدار بعد hydration — لا رفعٌ صامت", () => {
  // رفع معاينةٍ إلى R2 لا يُعدّ نجاحاً ما لم يستطع المالك رؤيتها داخل مدار.
  // الحل المعتمد: posterHash/previewHash يُدرجان أيضاً في photoRefs (راجع
  // madarBridge.ts)، فتمرّان بمسار العرض القائم فعلياً بلا كودٍ جديد:
  // hydrateCloudPhotos (sync.ts) يُرطّبهما إلى photos، وJournalEntryCard
  // يعرض photos[0] كما يفعل لأي صورة عادية.
  it("معاينة فيديو (posterHash) تصل إلى photos بعد hydrateCloudPhotos", async () => {
    const records = [record({ id: "r1", dayOneUUID: "V1", mediaIDs: ["vid"] })];
    const mediaItems = [
      media({ id: "vid", recordID: "r1", kind: "video", cloudKind: "photos", cloudHash: HASH_A, durationSeconds: 9 }),
    ];
    const parsed = await parseMadarImportFile(madarFile(records, mediaItems));
    // dual-write تحقّق: الهاش في photoRefs، لا في videoRefs.posterHash فقط.
    expect(parsed.entries[0].photoRefs).toEqual([HASH_A]);
    expect(parsed.entries[0].videoRefs).toEqual([{ type: "image/jpeg", posterHash: HASH_A, duration: 9 }]);

    // نحاكي أنّ البايتات وصلت محلياً (كما تفعل fetchInlineMedia بعد أول تنزيل
    // من R2) — نفس أسلوب sync.photos.test.ts، فلا حاجة لتزييف fetch/Blob كاملةً.
    idb.set(MEDIA_CACHE_PREFIX + HASH_A, "data:image/jpeg;base64,POSTERBYTES");
    const hydrated = await sync.hydrateCloudPhotos("space", baseAppData(parsed.entries));
    const e = hydrated.journalEntries.find((x) => x.id === "do-V1")!;

    // الاختبار الحاسم: المعاينة تظهر في photos — ما يعرضه JournalEntryCard
    // فعلياً (entryPhotos()/AppImage) — لا في حقلٍ لا تعرضه أي واجهة اليوم.
    expect(e.photos).toEqual(["data:image/jpeg;base64,POSTERBYTES"]);
    expect(e.photo).toBe("data:image/jpeg;base64,POSTERBYTES");
  });

  it("معاينة PDF (previewHash) تصل إلى photos بعد hydrateCloudPhotos", async () => {
    const records = [record({ id: "r1", dayOneUUID: "P1", mediaIDs: ["pdf"] })];
    const mediaItems = [
      media({ id: "pdf", recordID: "r1", kind: "pdf", cloudKind: "photos", cloudHash: HASH_B, originalFilename: "عقد.pdf" }),
    ];
    const parsed = await parseMadarImportFile(madarFile(records, mediaItems));
    expect(parsed.entries[0].photoRefs).toEqual([HASH_B]);
    expect(parsed.entries[0].attachmentRefs).toEqual([
      { kind: "pdf", filename: "عقد.pdf", previewHash: HASH_B, status: "uploaded" },
    ]);

    idb.set(MEDIA_CACHE_PREFIX + HASH_B, "data:image/jpeg;base64,PREVIEWBYTES");
    const hydrated = await sync.hydrateCloudPhotos("space", baseAppData(parsed.entries));
    const e = hydrated.journalEntries.find((x) => x.id === "do-P1")!;

    expect(e.photos).toEqual(["data:image/jpeg;base64,PREVIEWBYTES"]);
  });
});

describe("إعادة الاستيراد تُكمّل الوسائط الناقصة", () => {
  it("مذكرةٌ استُوردت بصورةٍ واحدة تكتسب مرجع صوتٍ اكتشفه مستورد الذكريات لاحقاً", async () => {
    // الملف الأول: صورةٌ واحدة فقط.
    const v1 = madarFile(
      [record({ id: "r1", dayOneUUID: "M6", mediaIDs: ["p1"] })],
      [media({ id: "p1", recordID: "r1", cloudHash: HASH_A, cloudKind: "photos" })]
    );
    const first = await parseMadarImportFile(v1);
    useAppStore.getState().importDayOneEntries(first.entries);
    expect(useAppStore.getState().journalEntries[0].photoRefs).toEqual([HASH_A]);
    expect(useAppStore.getState().journalEntries[0].audioRefs).toBeUndefined();

    // الملف الثاني (إعادة معالجة الأرشيف نفسه): نفس dayOneUUID، الآن مع
    // مرجع صوتٍ اكتُشف/رُفع لاحقاً — لا يجب أن يُسقط الصورة الموجودة.
    const v2 = madarFile(
      [record({ id: "r1", dayOneUUID: "M6", mediaIDs: ["p1", "a1"] })],
      [
        media({ id: "p1", recordID: "r1", cloudHash: HASH_A, cloudKind: "photos" }),
        media({ id: "a1", recordID: "r1", kind: "audio", cloudHash: HASH_B, cloudKind: "audios" }),
      ]
    );
    const second = await parseMadarImportFile(v2);
    const r = useAppStore.getState().importDayOneEntries(second.entries);

    const e = useAppStore.getState().journalEntries.find((x) => x.id === "do-M6")!;
    expect(r.added).toBe(0);
    expect(r.completed).toBe(1);
    expect(e.photoRefs).toEqual([HASH_A]); // الصورة القديمة بقيت
    expect(e.audioRefs).toEqual([HASH_B]); // والصوت الجديد أُضيف
  });
});

describe("إعداد الاتصال المنسوخ من مدار — يقرأه تطبيق الماك", () => {
  it("الحمولة قابلة لإعادة التفكيك بنفس المفاتيح الثلاثة التي يتوقّعها JSONDecoder", () => {
    const payload = buildMemoryImporterConnection("https://worker.example", "media-secret");
    const roundtrip = JSON.parse(JSON.stringify(payload)) as { version: number; workerURL: string; mediaKey: string };
    expect(roundtrip.version).toBe(1);
    expect(roundtrip.workerURL).toBe("https://worker.example");
    expect(roundtrip.mediaKey).toBe("media-secret");
  });
});

// AppData دنيا صالحة — راجع merge.test.ts لنفس النمط.
function baseAppData(journalEntries: JournalEntry[]): AppData {
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
    fieldUpdatedAt: {},
    lastUpdated: "2026-01-01T00:00:00.000Z",
  };
}

describe("دمج metadata لمذكرة مستوردة من جهازين", () => {
  it("يوحّد photoRefs/audioRefs بلا فقد، ويحتفظ بحقول مستورد الذكريات الجديدة", async () => {
    const records = [
      record({
        id: "r1", dayOneUUID: "M3", text: "نصٌّ من الجهاز أ", mediaIDs: ["p1"],
        timeZoneIdentifier: "Asia/Riyadh",
        location: { latitude: 24.1, longitude: 46.2, placeName: "الرياض" },
      }),
    ];
    const mediaItems = [media({ id: "p1", recordID: "r1", cloudHash: HASH_A, cloudKind: "photos" })];
    const parsed = await parseMadarImportFile(madarFile(records, mediaItems));
    const deviceA: JournalEntry = { ...parsed.entries[0], updatedAt: 1000 };
    // الجهاز ب استورد نفس المذكرة لاحقاً (نفس dayOneUUID) لكن بمرجع صوتٍ
    // إضافي اكتشفه مستورد الذكريات على ذلك الجهاز، ونصٍّ أحدث زمنياً.
    const deviceB: JournalEntry = {
      ...parsed.entries[0],
      content: "نصٌّ حرّره المالك على الجهاز ب",
      audioRefs: [HASH_B],
      updatedAt: 2000,
    };

    const merged = mergeAppData(baseAppData([deviceA]), baseAppData([deviceB]));
    const e = merged.journalEntries.find((x) => x.id === "do-M3")!;

    // النص الأحدث (ب) هو الفائز…
    expect(e.content).toBe("نصٌّ حرّره المالك على الجهاز ب");
    // …لكن لا مرجع وسائط يضيع من أيّ جهاز (اتحادٌ لا استبدال).
    expect((e as { photoRefs?: string[] }).photoRefs).toEqual([HASH_A]);
    expect((e as { audioRefs?: string[] }).audioRefs).toEqual([HASH_B]);
    // حقول مستورد الذكريات الجديدة تُرافق النسخة الفائزة.
    expect(e.location).toEqual({ lat: 24.1, lng: 46.2, place: "الرياض" });
    expect(e.timeZone).toBe("Asia/Riyadh");
  });
});
