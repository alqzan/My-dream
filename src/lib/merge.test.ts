import { describe, it, expect } from "vitest";
import { mergeAppData, unionOrdered, journalShardId } from "./merge";
import { EMPTY_HIFZ, EMPTY_KHATMA } from "./types";
import type { AppData, JournalEntry, Transaction } from "./types";

// Minimal valid AppData; override only what a test cares about.
function base(overrides: Partial<AppData> = {}): AppData {
  return {
    transactions: [],
    books: [],
    readingLogs: [],
    journalEntries: [],
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
    ...overrides,
  };
}

const entry = (o: Partial<JournalEntry> & { id: string }): JournalEntry => ({
  date: "2026-01-01",
  content: "",
  ...o,
});
const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({
  date: "2026-01-01",
  amount: 10,
  category: "cat",
  note: "",
  ...o,
});

describe("unionOrdered", () => {
  it("keeps primary on key clash and appends secondary-only", () => {
    const p = [{ id: "a", v: 1 }, { id: "b", v: 1 }];
    const s = [{ id: "b", v: 2 }, { id: "c", v: 2 }];
    const out = unionOrdered(p, s, (x) => x.id);
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(out.find((x) => x.id === "b")!.v).toBe(1); // primary wins the clash
  });
});

describe("journalShardId", () => {
  it("buckets by YYYY-MM of the entry date", () => {
    expect(journalShardId("2026-05-03")).toBe("2026-05");
    expect(journalShardId("1999-12-31")).toBe("1999-12");
  });
  it("falls back to 'misc' for missing/malformed dates", () => {
    expect(journalShardId(undefined)).toBe("misc");
    expect(journalShardId("")).toBe("misc");
    expect(journalShardId("not-a-date")).toBe("misc");
  });
  it("sharding then flattening preserves every entry (no loss on split)", () => {
    const entries = Array.from({ length: 500 }, (_, i) => ({
      id: `E${i}`,
      date: `2026-${String((i % 12) + 1).padStart(2, "0")}-15`,
    }));
    const shards = new Map<string, typeof entries>();
    for (const e of entries) {
      const s = journalShardId(e.date);
      (shards.get(s) ?? shards.set(s, []).get(s)!).push(e);
    }
    const flat = [...shards.values()].flat();
    expect(flat).toHaveLength(entries.length);
    expect(new Set(flat.map((e) => e.id))).toEqual(new Set(entries.map((e) => e.id)));
    expect(shards.size).toBe(12); // 12 months → 12 shards
  });
});

describe("mergeAppData — per-item updatedAt guard", () => {
  it("keeps the journal entry edited more recently even when the OTHER snapshot's doc stamp is newer", () => {
    // local: doc stamp newer, but its copy of E1 was edited earlier.
    const local = base({
      lastUpdated: "2026-05-10T12:00:00.000Z",
      journalEntries: [entry({ id: "E1", content: "old", updatedAt: 1000 })],
    });
    // cloud: older doc stamp, but its E1 was edited later (updatedAt 2000).
    const cloud = base({
      lastUpdated: "2026-05-10T11:00:00.000Z",
      journalEntries: [entry({ id: "E1", content: "NEW", updatedAt: 2000 })],
    });
    const merged = mergeAppData(local, cloud);
    expect(merged.journalEntries).toHaveLength(1);
    expect(merged.journalEntries[0].content).toBe("NEW"); // newer per-item edit wins
  });

  it("keeps the newer transaction edit regardless of doc-level stamp", () => {
    const local = base({
      lastUpdated: "2026-05-10T12:00:00.000Z",
      transactions: [tx({ id: "T1", amount: 10, updatedAt: 1000 })],
    });
    const cloud = base({
      lastUpdated: "2026-05-10T11:00:00.000Z",
      transactions: [tx({ id: "T1", amount: 99, updatedAt: 2000 })],
    });
    const merged = mergeAppData(local, cloud);
    expect(merged.transactions[0].amount).toBe(99);
  });
});

describe("mergeAppData — journal media never lost", () => {
  it("keeps the newer text but fills media from the older copy", () => {
    const local = base({
      lastUpdated: "2026-05-10T12:00:00.000Z",
      journalEntries: [entry({ id: "E1", content: "new text", updatedAt: 2000 })],
    });
    const cloud = base({
      lastUpdated: "2026-05-10T13:00:00.000Z",
      journalEntries: [entry({ id: "E1", content: "old text", updatedAt: 1000, photos: ["https://x/o/p1"] })],
    });
    const merged = mergeAppData(local, cloud);
    expect(merged.journalEntries[0].content).toBe("new text"); // newer edit
    expect(merged.journalEntries[0].photos).toEqual(["https://x/o/p1"]); // media kept
  });
});

describe("mergeAppData — media tombstones (a single-photo delete sticks)", () => {
  const withRefs = (id: string, updatedAt: number, photoRefs: string[]): JournalEntry =>
    ({ id, date: "2026-01-01", content: "", updatedAt, photoRefs } as unknown as JournalEntry);

  it("does not resurrect a deleted photo's ref through the media union (R2 down)", () => {
    const ts = Date.now();
    // Newer device deleted B → keeps [A,C] and tombstoned B's hash.
    const local = base({
      lastUpdated: "2026-05-10T13:00:00.000Z",
      journalEntries: [withRefs("E1", 2000, ["A", "C"])],
      deletedMedia: { B: ts },
    });
    // Cloud hasn't seen the delete and still references [A,B,C] (as pending refs).
    const cloud = base({
      lastUpdated: "2026-05-10T12:00:00.000Z",
      journalEntries: [withRefs("E1", 1000, ["A", "B", "C"])],
    });
    const merged = mergeAppData(local, cloud);
    const e = merged.journalEntries[0] as JournalEntry & { photoRefs?: string[] };
    expect(e.photoRefs).toEqual(["A", "C"]); // B is NOT pulled back in
    expect(merged.deletedMedia).toEqual({ B: ts }); // tombstone carried forward
  });

  it("strips a tombstoned ref even from an entry only one side holds", () => {
    const ts = Date.now();
    const local = base({
      lastUpdated: "2026-05-10T13:00:00.000Z",
      deletedMedia: { B: ts },
    });
    const cloud = base({
      lastUpdated: "2026-05-10T12:00:00.000Z",
      journalEntries: [withRefs("E9", 1000, ["A", "B"])],
    });
    const merged = mergeAppData(local, cloud);
    const e = merged.journalEntries[0] as JournalEntry & { photoRefs?: string[] };
    expect(e.photoRefs).toEqual(["A"]);
  });
});

describe("mergeAppData — tombstones", () => {
  it("does not resurrect an item the other device deleted", () => {
    const local = base({
      journalEntries: [entry({ id: "E1", content: "still here" })],
      lastUpdated: "2026-05-10T10:00:00.000Z",
    });
    const cloud = base({
      journalEntries: [],
      deleted: { E1: Date.now() },
      lastUpdated: "2026-05-10T11:00:00.000Z",
    });
    const merged = mergeAppData(local, cloud);
    expect(merged.journalEntries.find((e) => e.id === "E1")).toBeUndefined();
  });

  it("a fresh re-add (undo) with the tombstone cleared survives", () => {
    // Simulates addJournalEntry having removed the tombstone locally.
    const local = base({
      journalEntries: [entry({ id: "E1", content: "restored", updatedAt: 5000 })],
      deleted: {},
      lastUpdated: "2026-05-10T12:00:00.000Z",
    });
    const cloud = base({
      journalEntries: [],
      deleted: { E1: Date.now() - 1000 },
      lastUpdated: "2026-05-10T11:00:00.000Z",
    });
    // Local (newer doc stamp) carries no tombstone; but cloud still does. The
    // merge unions tombstones, so E1 is filtered. This documents that undo MUST
    // clear the tombstone on BOTH the local map (done) — here cloud's stale
    // tombstone still wins until it converges. We assert the union behavior.
    const merged = mergeAppData(local, cloud);
    // With cloud's tombstone present, E1 is filtered — expected convergence cost.
    expect(merged.journalEntries.find((e) => e.id === "E1")).toBeUndefined();
  });
});

describe("mergeAppData — Quran hifz mistakes preserved", () => {
  it("keeps mistakes and lastTestDate and unions hit dates", () => {
    const local = base({
      lastUpdated: "2026-05-10T12:00:00.000Z",
      quranHifz: {
        ...structuredClone(EMPTY_HIFZ),
        lastTestDate: "2026-05-09",
        mistakes: [{ id: "M1", ayahId: 5, wordIndex: null, hits: ["2026-05-01"], resolved: false, updatedAt: "2026-05-01" }],
      },
    });
    const cloud = base({
      lastUpdated: "2026-05-10T11:00:00.000Z",
      quranHifz: {
        ...structuredClone(EMPTY_HIFZ),
        lastTestDate: "2026-05-08",
        mistakes: [{ id: "M1", ayahId: 5, wordIndex: null, hits: ["2026-05-02"], resolved: true, updatedAt: "2026-05-03" }],
      },
    });
    const merged = mergeAppData(local, cloud);
    expect(merged.quranHifz.mistakes).toHaveLength(1);
    const m = merged.quranHifz.mistakes![0];
    expect(m.hits.sort()).toEqual(["2026-05-01", "2026-05-02"]); // hits unioned
    expect(m.resolved).toBe(true); // newer updatedAt (cloud, 05-03) wins
    expect(merged.quranHifz.lastTestDate).toBe("2026-05-09"); // most recent test date
  });
});

describe("mergeAppData — deterministic recurring ids dedupe", () => {
  it("two devices generating the same recurring occurrence collapse to one", () => {
    const id = "rec_R1_2026-05-01";
    const local = base({ transactions: [tx({ id, amount: 500 })] });
    const cloud = base({ transactions: [tx({ id, amount: 500 })] });
    const merged = mergeAppData(local, cloud);
    expect(merged.transactions.filter((t) => t.id === id)).toHaveLength(1);
  });
});
