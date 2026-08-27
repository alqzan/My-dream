import { describe, expect, it } from "vitest";
import { isValidBackupPayload, isValidJournalEntry, isValidTransaction } from "./backupValidation";

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
      ["assets", { id: "a1" }],
      ["recurring", { id: "r1" }],
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
});
