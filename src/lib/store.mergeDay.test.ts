import { describe, it, expect, vi, beforeEach } from "vitest";

// المتجر المحفوظ يخاطب IndexedDB عبر idb-keyval — نُبدّله ليقلع في Node.
const idb = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => { idb.set(k, v); },
  del: async (k: string) => { idb.delete(k); },
}));

import { useAppStore } from "./store";
import type { JournalEntry } from "./types";

const D = "2025-08-10";
const DAY: JournalEntry[] = [
  { id: "noon", date: D, time: "12:05", content: "الظهر", photos: ["p2"] },
  { id: "morning", date: D, time: "07:10", content: "الصباح", photos: ["p1"], dayOneUUID: "U-morning" },
  { id: "night", date: D, time: "21:40", content: "الليل" },
];
const OTHER: JournalEntry = { id: "other", date: "2025-08-09", content: "يومٌ آخر" };

function seed() {
  useAppStore.setState({ journalEntries: [...DAY, OTHER], deleted: {} });
}

beforeEach(seed);

describe("mergeJournalDay", () => {
  it("يُبقي مذكرةً واحدة بمعرّف أبكرها ويحذف الباقي", () => {
    useAppStore.getState().mergeJournalDay(DAY.map((e) => e.id));
    const { journalEntries } = useAppStore.getState();
    const day = journalEntries.filter((e) => e.date === D);
    expect(day).toHaveLength(1);
    expect(day[0].id).toBe("morning");
    expect(journalEntries.some((e) => e.id === "other")).toBe(true); // لم يُمسّ يومٌ آخر
  });

  it("يشهد على حذف المصادر فلا تعود من السحابة، ولا يشهد على الناجية", () => {
    useAppStore.getState().mergeJournalDay(DAY.map((e) => e.id));
    const { deleted } = useAppStore.getState();
    expect(deleted).toHaveProperty("noon");
    expect(deleted).toHaveProperty("night");
    expect(deleted).not.toHaveProperty("morning");
  });

  it("يضع بصمةَ كلّ مصدرٍ في المذكرة الناتجة", () => {
    useAppStore.getState().mergeJournalDay(DAY.map((e) => e.id));
    const merged = useAppStore.getState().journalEntries.find((e) => e.id === "morning")!;
    expect(merged.mergedFrom?.map((s) => s.id)).toEqual(["morning", "noon", "night"]);
    expect(merged.content).toContain("الصباح");
    expect(merged.content).toContain("الظهر");
    expect(merged.content).toContain("الليل");
  });

  it("لا يشهد على وسائط المصادر — الدمج نقلٌ لا حذف", () => {
    useAppStore.getState().mergeJournalDay(DAY.map((e) => e.id));
    // شواهد الوسائط مفتاحُها «معرّف المذكرة + هاش»؛ أيّ شاهدٍ هنا يعني أنّ صورةً
    // ستختفي عند أوّل مزامنة رغم أنّها انتقلت إلى المدموجة سليمة.
    expect(Object.keys(useAppStore.getState().deletedMedia ?? {})).toHaveLength(0);
  });

  it("لا يدمج مذكراتٍ من يومين", () => {
    const before = useAppStore.getState().journalEntries.length;
    expect(useAppStore.getState().mergeJournalDay(["morning", "other"])).toBeUndefined();
    expect(useAppStore.getState().journalEntries).toHaveLength(before);
  });
});

describe("restoreJournalEntries — التراجع يعيد اليوم كما كان", () => {
  it("يعيد المصادر الثلاثة بنصوصها ويرفع شواهد حذفها", () => {
    const originals = useAppStore.getState().mergeJournalDay(DAY.map((e) => e.id))!;
    useAppStore.getState().restoreJournalEntries(originals);

    const { journalEntries, deleted } = useAppStore.getState();
    const day = journalEntries.filter((e) => e.date === D);
    expect(day).toHaveLength(3);
    expect(new Set(day.map((e) => e.id))).toEqual(new Set(["morning", "noon", "night"]));
    // الناجية عادت إلى نصّها الأصلي بلا أثرٍ للدمج.
    const morning = day.find((e) => e.id === "morning")!;
    expect(morning.content).toBe("الصباح");
    expect(morning.mergedFrom).toBeUndefined();
    // ولا شاهدَ حذفٍ باقياً، وإلّا حذفتها المزامنة التالية فوراً.
    for (const id of ["noon", "night"]) expect(deleted).not.toHaveProperty(id);
  });
});

describe("importDayOneEntries — لا يُفكّك ما دُمج", () => {
  it("يتخطّى تدوينةً ابتلعها الدمج بدل إضافتها من جديد", () => {
    useAppStore.getState().mergeJournalDay(DAY.map((e) => e.id));
    const before = useAppStore.getState().journalEntries.length;
    const result = useAppStore.getState().importDayOneEntries([
      { id: "new-id", date: D, time: "07:10", content: "الصباح", dayOneUUID: "U-morning" },
    ]);
    expect(result.added).toBe(0);
    expect(useAppStore.getState().journalEntries).toHaveLength(before);
  });
});
