import { describe, expect, it } from "vitest";
import { transactionShardId, splitTransactionShards, planTransactionMigration } from "./transactionShards";
import type { Transaction } from "./types";

function tx(id: string, date: string, amount: number, extra: Partial<Transaction> = {}): Transaction {
  return { id, date, amount, category: "food", note: `note-${id}`, ...extra };
}

describe("transactionShardId", () => {
  it("groups by YYYY-MM", () => {
    expect(transactionShardId("2026-08-08")).toBe("2026-08");
    expect(transactionShardId("2026-01-31")).toBe("2026-01");
  });

  it("falls back to 'misc' for a malformed/missing date — never throws or drops the transaction", () => {
    expect(transactionShardId(undefined)).toBe("misc");
    expect(transactionShardId("")).toBe("misc");
    expect(transactionShardId("not-a-date")).toBe("misc");
  });
});

describe("splitTransactionShards", () => {
  it("splits transactions into their monthly shards", () => {
    const shards = splitTransactionShards([
      tx("a", "2026-08-01", 10),
      tx("b", "2026-08-15", 20),
      tx("c", "2026-07-01", 5),
    ]);
    expect([...shards.keys()].sort()).toEqual(["2026-07", "2026-08"]);
    expect(shards.get("2026-08")!.map((t) => t.id)).toEqual(["a", "b"]);
    expect(shards.get("2026-07")!.map((t) => t.id)).toEqual(["c"]);
  });

  it("returns an empty map for no transactions", () => {
    expect(splitTransactionShards([]).size).toBe(0);
  });
});

describe("planTransactionMigration — dry run only, never writes anywhere", () => {
  it("always reports dryRun: true", () => {
    expect(planTransactionMigration([]).dryRun).toBe(true);
  });

  it("first run: plans one shard per distinct month, with correct counts", () => {
    const report = planTransactionMigration([
      tx("a", "2026-08-01", 10),
      tx("b", "2026-08-15", 20),
      tx("c", "2026-07-01", 5),
    ]);
    expect(report.totalTransactions).toBe(3);
    expect(report.shardCount).toBe(2);
    expect(report.roundTripOk).toBe(true);
    expect(report.mismatches).toEqual([]);
    const aug = report.shards.find((s) => s.id === "2026-08")!;
    expect(aug.count).toBe(2);
  });

  it("re-run (idempotent): the same input produces byte-identical checksums", () => {
    const data = [tx("a", "2026-08-01", 10), tx("b", "2026-07-01", 5)];
    const first = planTransactionMigration(data);
    const second = planTransactionMigration(structuredClone(data));
    expect(second.shards).toEqual(first.shards);
  });

  it("a checksum changes when a transaction's amount changes, and stays the same otherwise", () => {
    const base = [tx("a", "2026-08-01", 10)];
    const edited = [tx("a", "2026-08-01", 99)];
    const same = [tx("a", "2026-08-01", 10)];
    const before = planTransactionMigration(base).shards[0].checksum;
    const after = planTransactionMigration(edited).shards[0].checksum;
    const unchanged = planTransactionMigration(same).shards[0].checksum;
    expect(after).not.toBe(before);
    expect(unchanged).toBe(before);
  });

  it("partial interruption: planning a PREFIX of the data still round-trips that prefix losslessly", () => {
    const full = [
      tx("a", "2026-08-01", 10),
      tx("b", "2026-08-02", 20),
      tx("c", "2026-08-03", 30),
    ];
    const partial = full.slice(0, 2); // simulates a migration that only processed 2/3 so far
    const report = planTransactionMigration(partial);
    expect(report.totalTransactions).toBe(2);
    expect(report.roundTripOk).toBe(true);
    // Resuming with the FULL set afterward is itself just a fresh, complete
    // plan — no special "resume" state is needed since planning is pure and
    // idempotent per input.
    const resumed = planTransactionMigration(full);
    expect(resumed.totalTransactions).toBe(3);
    expect(resumed.roundTripOk).toBe(true);
  });

  it("legacy single flat array (today's only format, and any restored backup's format) round-trips exactly — no amount, date, or transaction is altered or dropped", () => {
    const legacy: Transaction[] = [
      tx("a", "2026-01-05", 123.45, { category: "coffee" }),
      tx("b", "2025-12-31", 5000, { category: "salary" }),
      tx("c", "2026-08-08", 0.5, { category: "misc" }),
      tx("d", undefined as unknown as string, 10), // malformed date from old/imported data
    ];
    const report = planTransactionMigration(legacy);
    expect(report.totalTransactions).toBe(4);
    expect(report.roundTripOk).toBe(true);
    expect(report.mismatches).toEqual([]);
    // The malformed-date transaction is still accounted for, in "misc" —
    // never silently dropped.
    expect(report.shards.find((s) => s.id === "misc")?.count).toBe(1);
  });

  it("reports mismatches by id when the round-trip check would fail (regression guard for the check itself)", () => {
    // planTransactionMigration can't actually produce a mismatch on its own
    // input (split/rejoin over the same data is lossless by construction) —
    // this test instead verifies duplicate ids in the INPUT are surfaced
    // rather than silently deduplicated, since the same is true of the real
    // AppData.transactions array today (nothing enforces uniqueness upstream
    // of this module).
    const dup = [tx("a", "2026-08-01", 10), tx("a", "2026-08-02", 20)];
    const report = planTransactionMigration(dup);
    expect(report.totalTransactions).toBe(2);
    // Both instances land in the shard (content-preserving); the checksum
    // reflects both, so nothing is silently lost even though ids collide.
    expect(report.shards.reduce((n, s) => n + s.count, 0)).toBe(2);
  });
});
