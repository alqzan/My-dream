import { describe, expect, it } from "vitest";
import { isValidBackupPayload } from "./backupValidation";

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
});
