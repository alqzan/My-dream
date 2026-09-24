import { describe, it, expect } from "vitest";
import { appendQuickLine, removeQuickLine, mergeQuickLines } from "./journalQuickLine";
import { mergeAppData } from "./merge";
import { EMPTY_HIFZ, EMPTY_KHATMA } from "./types";
import type { AppData, JournalEntry } from "./types";

const note = (o: Partial<JournalEntry> = {}): JournalEntry => ({ id: "N", date: "2026-09-24", content: "صباح", ...o });

describe("appendQuickLine / removeQuickLine", () => {
  it("يلحق الفقرة ويسجّل معرّفها، والتراجع يزيلها وحدها ويُبقي المعرّف", () => {
    const a = appendQuickLine(note(), { id: "q1", text: "09:00 — أولى" });
    expect(a.content).toBe("صباح\n\n09:00 — أولى");
    const b = appendQuickLine({ ...note(), ...a }, { id: "q2", text: "10:00 — ثانية" });
    // تعديلٌ وصل بعد الإلحاق (من الجهاز الآخر) لا يمحوه التراجع
    const edited = { ...b, content: `مساء\n\n${b.content}` };
    expect(removeQuickLine(edited, "q1").content).toBe("مساء\n\nصباح\n\n10:00 — ثانية");
  });

  it("يبدأ النصَّ بالسطر حين تكون المذكرة فارغة", () => {
    expect(appendQuickLine(note({ content: "  " }), { id: "q", text: "x" }).content).toBe("x");
  });
});

describe("mergeQuickLines", () => {
  it("سطرٌ لم يره الفائز يُلحق بنصّه", () => {
    const base = note();
    const phone = { ...note(), ...appendQuickLine(base, { id: "p", text: "09:00 — جوال" }) };
    const ipad = { ...note(), ...appendQuickLine(base, { id: "i", text: "09:05 — آيباد" }) };
    const out = mergeQuickLines(ipad, phone);
    expect(out.content).toBe("صباح\n\n09:05 — آيباد\n\n09:00 — جوال");
    expect(out.quickLines?.map((q) => q.id)).toEqual(["i", "p"]);
  });

  it("سطرٌ يعرفه الطرفان وحذفه الفائز لا يعود", () => {
    const withLine = { ...note(), ...appendQuickLine(note(), { id: "p", text: "09:00 — جوال" }) };
    const deleted = { ...withLine, content: "صباح" };
    expect(mergeQuickLines(deleted, withLine)).toBe(deleted);
  });
});

function data(entries: JournalEntry[], lastUpdated: string): AppData {
  return {
    transactions: [], books: [], readingLogs: [], journalEntries: entries, habits: [], budgets: [],
    categories: [], reserves: [], prayerLogs: [], quranReflections: [],
    quranHifz: structuredClone(EMPTY_HIFZ), quranWird: [], quranKhatma: structuredClone(EMPTY_KHATMA),
    dailyBudget: null, monthlyIncome: null, futureLetters: [], salaryDay: 27, lastSalaryConfirm: null,
    readingGoal: null, merchantRules: {}, deleted: {}, fieldUpdatedAt: {}, lastUpdated,
  };
}

describe("mergeAppData — سطران سريعان على جهازين لا يضيع أحدهما", () => {
  it("يُبقي السطرين في مذكرة اليوم", () => {
    const base = note({ updatedAt: 1 });
    const phone = { ...base, ...appendQuickLine(base, { id: "p", text: "09:00 — جوال" }), updatedAt: 10 };
    const ipad = { ...base, ...appendQuickLine(base, { id: "i", text: "09:05 — آيباد" }), updatedAt: 20 };
    const merged = mergeAppData(data([phone], "2026-09-24T09:00:00.000Z"), data([ipad], "2026-09-24T09:05:00.000Z"));
    const e = merged.journalEntries.find((x) => x.id === "N")!;
    expect(e.content).toContain("09:00 — جوال");
    expect(e.content).toContain("09:05 — آيباد");
  });
});
