// تكامل جسر «مستورد الذكريات» مع بقية مدار: يتحقّق أنّ ما يُنتجه
// parseMadarImportFile يمرّ بلا كودٍ إضافي عبر آليتَي عدم التكرار والدمج
// القائمتين أصلاً لـDay One (store.ts#importDayOneEntries وmerge.ts#mergeAppData)
// — راجع التعليق أعلى madarBridge.ts لسبب هذا القرار المعماري.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { zipSync, strToU8 } from "fflate";

// المتجر المحفوظ يمرّ بـidb-keyval — نزيّفه كي يُقلَع في Node صرفاً (كما في
// dayOneImport.store.test.ts).
const idb = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => { idb.set(k, v); },
  del: async (k: string) => { idb.delete(k); },
}));

import { useAppStore } from "./store";
import { mergeAppData } from "./merge";
import {
  parseMadarImportFile,
  checksumOfEntries,
  MADAR_IMPORT_MAGIC,
  MADAR_IMPORT_FORMAT_VERSION,
  type MadarImportEntry,
} from "./madarBridge";
import { EMPTY_HIFZ, EMPTY_KHATMA } from "./types";
import type { AppData, JournalEntry } from "./types";

const HASH_A = "a".repeat(32);

async function madarFile(entries: MadarImportEntry[]): Promise<Blob> {
  const manifest = {
    magic: MADAR_IMPORT_MAGIC,
    formatVersion: MADAR_IMPORT_FORMAT_VERSION,
    summary: {
      entryCount: entries.length,
      photoCount: entries.reduce((n, e) => n + (e.photoRefs?.length ?? 0), 0),
      audioCount: entries.reduce((n, e) => n + (e.audioRefs?.length ?? 0), 0),
      videoCount: 0,
      pdfCount: 0,
    },
    entriesChecksum: await checksumOfEntries(entries),
    entries,
  };
  return new Blob([zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)) })]);
}

beforeEach(() => {
  useAppStore.setState({ journalEntries: [], deleted: {} });
});

describe("استيراد .madarimport مرتين — بلا تكرار UUIDs", () => {
  it("الاستيراد الثاني لنفس الملف لا يضيف شيئاً", async () => {
    const file = await madarFile([
      { uuid: "M1", date: "2026-01-01", content: "ذكرى", photoRefs: [HASH_A] },
    ]);
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
  it("إعادة استيراد نفس uuid بنصٍّ مختلف لا يمسّ تعديل المستخدم المحلي", async () => {
    const file = await madarFile([{ uuid: "M2", date: "2026-01-01", content: "النص الأصلي من مستورد الذكريات" }]);
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
    const HASH_B = "b".repeat(32);
    const file = await madarFile([
      {
        uuid: "M3",
        date: "2026-02-10",
        content: "نصٌّ من الجهاز أ",
        photoRefs: [HASH_A],
        location: { lat: 24.1, lng: 46.2, place: "الرياض" },
        timeZone: "Asia/Riyadh",
      },
    ]);
    const parsed = await parseMadarImportFile(file);
    const deviceA: JournalEntry = { ...parsed.entries[0], updatedAt: 1000 };
    // الجهاز ب استورد نفس المذكرة لاحقاً (نفس uuid) لكن برقم مرجع صوتٍ إضافي
    // اكتشفه مستورد الذكريات على ذلك الجهاز، ونصٍّ أحدث زمنياً.
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
