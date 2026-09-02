import { describe, expect, it } from "vitest";
import {
  describeBackupRejection,
  findBackupRejection,
  isSyncReadableJournalEntry,
  isSyncReadableTransaction,
  isValidBackupPayload,
  isValidJournalEntry,
  isValidTransaction,
} from "./backupValidation";

const valid = {
  transactions: [{ id: "t1", date: "2026-08-01", amount: 10, category: "food", note: "قهوة" }],
  journalEntries: [{ id: "j1", date: "2026-08-01", content: "نص" }],
};

describe("backup validation", () => {
  it("accepts current payloads and legacy payloads with optional fields absent", () => {
    expect(isValidBackupPayload(valid)).toBe(true);
    expect(isValidBackupPayload({ transactions: valid.transactions })).toBe(true);
  });

  it("rejects a present collection with the wrong shape instead of coercing it to empty", () => {
    expect(isValidBackupPayload({ ...valid, books: "not-an-array" })).toBe(false);
    expect(isValidBackupPayload({ ...valid, transactions: [{ amount: 10 }] })).toBe(false);
    expect(isValidBackupPayload({ ...valid, transactions: [{ id: "t1", date: "2026-08-01", amount: "10", category: "food", note: "قهوة" }] })).toBe(false);
    expect(isValidBackupPayload({ ...valid, journalEntries: [{ id: "j1", date: "2026-08-01", content: 123 }] })).toBe(false);
  });

  it("rejects malformed scalar and nested values", () => {
    expect(isValidBackupPayload({ ...valid, qadaBacklog: -1 })).toBe(false);
    expect(isValidBackupPayload({ ...valid, merchantRules: { coffee: 42 } })).toBe(false);
    expect(isValidBackupPayload({ ...valid, __meta: { app: "other" } })).toBe(false);
  });

  it("rejects id-only records that would be unsafe after restore", () => {
    for (const [field, item] of [
      ["books", { id: "b1" }],
      ["habits", { id: "h1" }],
      ["reserves", { id: "r1" }],
    ] as const) {
      expect(isValidBackupPayload({ ...valid, [field]: [item] })).toBe(false);
    }
  });

  it("validates the same record boundaries used by cloud shards", () => {
    expect(isValidTransaction({
      id: "t1", date: "2026-08-01", amount: 10, category: "food", note: "قهوة",
      reserveSplits: [{ fundId: "r1", pct: 50 }], deferred: false,
    })).toBe(true);
    expect(isValidTransaction({ id: "t1", date: "2026-08-01", amount: 10 })).toBe(false);
    expect(isValidJournalEntry({
      id: "j1", date: "2026-08-01", content: "نص",
      photoRefs: ["abc"], photoEdits: { abc: { rotation: 90, scale: 1 } },
    })).toBe(true);
    expect(isValidJournalEntry({ id: "j1", date: "2026-08-01", content: "نص", photoRefs: [42] })).toBe(false);
  });

  it("keeps the cloud read boundary compatible with legacy optional fields", () => {
    const legacyJournal = {
      id: "j-legacy",
      date: "2026-08-01",
      content: "نص قديم",
      photoEdits: { abc: { rotation: "90" } },
    };
    const legacyTransaction = {
      id: "t-legacy",
      date: "2026-08-01",
      amount: 10,
      category: "food",
      note: "قهوة",
      legacyStamp: "old-client",
    };

    expect(isSyncReadableJournalEntry(legacyJournal)).toBe(true);
    expect(isSyncReadableTransaction(legacyTransaction)).toBe(true);
    expect(isValidJournalEntry(legacyJournal)).toBe(false);
    expect(isValidTransaction(legacyTransaction)).toBe(true);
  });
});

// «الملف غير صالح» وحدها تركت المالك بلا سبيل: أالنسخة تالفةٌ فعلاً أم أنّ
// سجلاً واحداً من أرشيفٍ قديم شذّ عن شكلٍ تشدّد فيه مدقّق؟ الرفض نفسه لم
// يتغيّر — تغيّر أنّه صار يسمّي المجموعة وموضع السجلّ ومعرّفه.
describe("سببُ رفض النسخة الاحتياطية", () => {
  it("يسمّي المجموعة وموضع السجلّ ومعرّفه", () => {
    const rejection = findBackupRejection({
      ...valid,
      books: [
        { id: "b1", title: "ك", author: "م", totalPages: 10, currentPage: 1, status: "أقرأ" },
        { id: "b2", title: "ك٢", author: "م", totalPages: "كثير", currentPage: 1, status: "أقرأ" },
      ],
    });
    expect(rejection).toEqual({ field: "books", label: "الكتب", index: 1, id: "b2" });
    expect(describeBackupRejection(rejection!)).toContain("الكتب");
    expect(describeBackupRejection(rejection!)).toContain("b2");
  });

  it("يسمّي الحقل غير المجموعة كذلك، ولا يسمّي شيئاً لملفٍّ سليم", () => {
    expect(findBackupRejection({ ...valid, merchantRules: { coffee: 42 } }))
      .toEqual({ field: "merchantRules", label: "قواعد التجّار" });
    expect(findBackupRejection("ليس ملفاً")).toEqual({ field: "__root", label: "الملف نفسه" });
    expect(findBackupRejection(valid)).toBeNull();
  });
});
