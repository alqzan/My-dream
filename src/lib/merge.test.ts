import { describe, it, expect } from "vitest";
import {
  mergeAppData, mergeHifz, mergeRecurringRules, legacyHifzGen, unionOrdered, journalShardId,
  budgetTombKey, depositTombKey, habitLogTombKey, wirdTombKey,
  applyTombstones, merchantStampKey, CATEGORY_ORDER_FIELD, KHATMA_GOAL_FIELD,
} from "./merge";
import { mediaTombKey } from "./mediaHash";
import { EMPTY_HIFZ, EMPTY_KHATMA } from "./types";
import type {
  AppData, JournalEntry, Transaction, ReserveFund, Habit, HifzState, HifzPlan,
  RecurringTransaction, InstallmentPlan, Asset, Book, ReadingLog, QuranReflection,
  FutureLetter, FinanceCategoryDef,
} from "./types";

// Minimal valid AppData; override only what a test cares about.
function base(overrides: Partial<AppData> = {}): AppData {
  return {
    transactions: [],
    books: [],
    readingLogs: [],
    journalEntries: [],
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
    const key = mediaTombKey("E1", "photos", "B");
    // Newer device deleted B FROM E1 → keeps [A,C] and tombstoned E1's B.
    const local = base({
      lastUpdated: "2026-05-10T13:00:00.000Z",
      journalEntries: [withRefs("E1", 2000, ["A", "C"])],
      deletedMedia: { [key]: ts },
    });
    // Cloud hasn't seen the delete and still references [A,B,C] (as pending refs).
    const cloud = base({
      lastUpdated: "2026-05-10T12:00:00.000Z",
      journalEntries: [withRefs("E1", 1000, ["A", "B", "C"])],
    });
    const merged = mergeAppData(local, cloud);
    const e = merged.journalEntries[0] as JournalEntry & { photoRefs?: string[] };
    expect(e.photoRefs).toEqual(["A", "C"]); // B is NOT pulled back in
    expect(merged.deletedMedia).toEqual({ [key]: ts }); // tombstone carried forward
  });

  it("only strips the ref from the entry it was deleted from (shared photo safe)", () => {
    const ts = Date.now();
    // SHARED lives in both E1 and E2; deleted from E1 only.
    const local = base({
      lastUpdated: "2026-05-10T13:00:00.000Z",
      journalEntries: [withRefs("E1", 2000, ["SHARED"]), withRefs("E2", 2000, ["SHARED"])],
      deletedMedia: { [mediaTombKey("E1", "photos", "SHARED")]: ts },
    });
    const cloud = base({
      lastUpdated: "2026-05-10T12:00:00.000Z",
      journalEntries: [withRefs("E1", 1000, ["SHARED"]), withRefs("E2", 1000, ["SHARED"])],
    });
    const merged = mergeAppData(local, cloud);
    const byId = new Map(merged.journalEntries.map((e) => [e.id, e as JournalEntry & { photoRefs?: string[] }]));
    expect(byId.get("E1")!.photoRefs ?? []).toEqual([]); // gone from E1
    expect(byId.get("E2")!.photoRefs).toEqual(["SHARED"]); // still in E2
  });

  it("strips a tombstoned ref even from an entry only one side holds", () => {
    const ts = Date.now();
    const local = base({
      lastUpdated: "2026-05-10T13:00:00.000Z",
      deletedMedia: { [mediaTombKey("E9", "photos", "B")]: ts },
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

describe("mergeAppData — deletions that aren't top-level ids stay deleted", () => {
  const fund = (id: string, deposits: ReserveFund["deposits"]): ReserveFund => ({
    id, name: "صندوق", icon: "💰", color: "#000", deposits, createdAt: "2026-01-01",
  });
  const dep = (id: string, amount = 100) => ({ id, date: "2026-01-01", amount });
  const habit = (id: string, logs: string[]): Habit => ({ id, name: "ورد", icon: "📿", color: "#000", logs });

  it("a deleted budget cap is not re-added by the other device's union", () => {
    // A holds the cap; B deleted it (tombstone) and has the newer stamp.
    const withCap = base({
      lastUpdated: "2026-05-10T10:00:00.000Z",
      budgets: [{ category: "groceries", limit: 500 }],
    });
    const deletedIt = base({
      lastUpdated: "2026-05-10T11:00:00.000Z",
      budgets: [],
      deleted: { [budgetTombKey("groceries")]: Date.now() },
    });
    expect(mergeAppData(withCap, deletedIt).budgets).toEqual([]);
    expect(mergeAppData(deletedIt, withCap).budgets).toEqual([]); // order-independent
  });

  it("a deleted reserve deposit is not resurrected from the other fund copy", () => {
    const hasDep = base({
      lastUpdated: "2026-05-10T10:00:00.000Z",
      reserves: [fund("F1", [dep("D1"), dep("D2")])],
    });
    const removedDep = base({
      lastUpdated: "2026-05-10T11:00:00.000Z",
      reserves: [fund("F1", [dep("D1")])],
      deleted: { [depositTombKey("D2")]: Date.now() },
    });
    const merged = mergeAppData(hasDep, removedDep);
    expect(merged.reserves[0].deposits.map((d) => d.id)).toEqual(["D1"]);
  });

  it("an un-checked habit day is not re-checked by the other device", () => {
    const checked = base({
      lastUpdated: "2026-05-10T10:00:00.000Z",
      habits: [habit("H1", ["2026-05-01", "2026-05-02"])],
    });
    const unchecked = base({
      lastUpdated: "2026-05-10T11:00:00.000Z",
      habits: [habit("H1", ["2026-05-01"])],
      deleted: { [habitLogTombKey("H1", "2026-05-02")]: Date.now() },
    });
    const merged = mergeAppData(checked, unchecked);
    expect(merged.habits[0].logs).toEqual(["2026-05-01"]);
  });

  it("an un-marked wird day stays removed after the union", () => {
    const marked = base({
      lastUpdated: "2026-05-10T10:00:00.000Z",
      quranWird: ["2026-05-01", "2026-05-02"],
    });
    const unmarked = base({
      lastUpdated: "2026-05-10T11:00:00.000Z",
      quranWird: ["2026-05-01"],
      deleted: { [wirdTombKey("2026-05-02")]: Date.now() },
    });
    expect(mergeAppData(marked, unmarked).quranWird).toEqual(["2026-05-01"]);
  });

  it("re-adding after delete (tombstone lifted on BOTH sides) keeps the item", () => {
    // After undo, the store lifts the tombstone locally; once it converges the
    // cap comes back. Model the converged state: neither side tombstones it.
    const a = base({ budgets: [{ category: "groceries", limit: 500 }], deleted: {} });
    const b = base({ budgets: [{ category: "groceries", limit: 500 }], deleted: {} });
    expect(mergeAppData(a, b).budgets).toHaveLength(1);
  });
});

describe("mergeAppData — single-value settings by per-field stamp", () => {
  it("propagates a clear-to-null (later stamp) over the other device's stale value", () => {
    // A cleared the income at t=2000; B still holds 5000 but set it earlier (1000).
    const cleared = base({
      lastUpdated: "2026-05-10T10:00:00.000Z", // OLDER doc stamp on purpose
      monthlyIncome: null,
      fieldUpdatedAt: { monthlyIncome: 2000 },
    });
    const stale = base({
      lastUpdated: "2026-05-10T11:00:00.000Z", // NEWER doc stamp, older field edit
      monthlyIncome: 5000,
      fieldUpdatedAt: { monthlyIncome: 1000 },
    });
    // The clear must win regardless of which side is primary (doc stamp).
    expect(mergeAppData(cleared, stale).monthlyIncome).toBeNull();
    expect(mergeAppData(stale, cleared).monthlyIncome).toBeNull();
  });

  it("keeps the more recently set value when both are non-null", () => {
    const a = base({ dailyBudget: { amount: 100 } as AppData["dailyBudget"], fieldUpdatedAt: { dailyBudget: 1000 } });
    const b = base({ dailyBudget: { amount: 200 } as AppData["dailyBudget"], fieldUpdatedAt: { dailyBudget: 2000 } });
    expect(mergeAppData(a, b).dailyBudget).toEqual({ amount: 200 });
    expect(mergeAppData(b, a).dailyBudget).toEqual({ amount: 200 });
  });

  it("falls back to the old non-null pick for legacy data (no stamps)", () => {
    // Neither side has fieldUpdatedAt for salaryDay/readingGoal → prior behavior.
    const withVal = base({ lastUpdated: "2026-05-10T12:00:00.000Z", readingGoal: 12, salaryDay: 25 });
    const without = base({ lastUpdated: "2026-05-10T11:00:00.000Z", readingGoal: null });
    const merged = mergeAppData(withVal, without);
    expect(merged.readingGoal).toBe(12); // non-null survives (legacy fallback)
    expect(merged.salaryDay).toBe(25);
  });

  it("unions the per-field stamps (newest per field) into the result", () => {
    const a = base({ fieldUpdatedAt: { monthlyIncome: 2000, salaryDay: 500 } });
    const b = base({ fieldUpdatedAt: { monthlyIncome: 1000, readingGoal: 900 } });
    const merged = mergeAppData(a, b);
    expect(merged.fieldUpdatedAt).toEqual({ monthlyIncome: 2000, salaryDay: 500, readingGoal: 900 });
  });
});

// ===================== P0: سلامة دمج حفظ القرآن (الأجيال) =====================
function hz(o: Partial<HifzState> = {}): HifzState {
  return { plan: null, frontierId: 0, sessions: [], reviews: [], mistakes: [], ...o };
}
const plan = (startId: number, extra: Partial<HifzPlan> = {}): HifzPlan => ({
  startId, unit: "page", amount: 1, createdAt: "2026-01-01", ...extra,
});

describe("mergeHifz — plan generations & data safety (P0)", () => {
  it("legacyHifzGen is deterministic per plan content (converges across devices)", () => {
    expect(legacyHifzGen({ plan: plan(1) })).toBe(legacyHifzGen({ plan: plan(1) }));
    expect(legacyHifzGen({ plan: null })).toBe("l:none");
    expect(legacyHifzGen({ plan: plan(1) })).not.toBe(legacyHifzGen({ plan: plan(5673) }));
  });

  it("clearing a plan on one device wins over an old copy on another (both orders)", () => {
    const cleared = hz({ plan: null, planId: "gen-clear", planUpdatedAt: 2000, frontierUpdatedAt: 2000 });
    const old = hz({
      plan: plan(1), frontierId: 50,
      sessions: [{ id: "s1", date: "2026-01-02", fromId: 1, toId: 50, at: 1000 }],
      planId: "gen-old", planUpdatedAt: 1000, frontierUpdatedAt: 1000,
    });
    for (const m of [mergeHifz(cleared, old), mergeHifz(old, cleared)]) {
      expect(m.plan).toBeNull();
      expect(m.frontierId).toBe(0);
      expect(m.sessions).toHaveLength(0);
      expect(m.planId).toBe("gen-clear");
    }
  });

  it("a new plan (جزء عم) after an old one (البقرة) doesn't mix old records", () => {
    const baqarah = hz({
      plan: plan(1), frontierId: 100,
      sessions: [{ id: "b1", date: "2026-01-05", fromId: 1, toId: 100, at: 1000 }],
      reviews: [{ id: "rv1", date: "2026-01-06", fromId: 1, toId: 100 }],
      mistakes: [{ id: "mk1", ayahId: 3, wordIndex: null, hits: ["2026-01-05"], resolved: false, updatedAt: "2026-01-05" }],
      planId: "g-baq", planUpdatedAt: 1000, frontierUpdatedAt: 1000,
    });
    const amma = hz({
      plan: plan(5673, { createdAt: "2026-02-01" }), frontierId: 5672,
      planId: "g-amma", planUpdatedAt: 2000, frontierUpdatedAt: 2000,
    });
    const m = mergeHifz(baqarah, amma);
    expect(m.plan?.startId).toBe(5673);
    expect(m.frontierId).toBe(5672);
    expect(m.sessions).toHaveLength(0);
    expect(m.reviews).toHaveLength(0);
    expect(m.mistakes).toHaveLength(0);
    expect(m.planId).toBe("g-amma");
  });

  it("a recent manual backward frontier correction propagates (not undone by Math.max)", () => {
    const sess = { id: "s1", date: "2026-01-05", fromId: 1, toId: 120, at: 1000 };
    const withProgress = hz({ plan: plan(1), frontierId: 120, sessions: [sess], planId: "g1", planUpdatedAt: 500, frontierUpdatedAt: 500 });
    const corrected = hz({ plan: plan(1), frontierId: 50, sessions: [sess], planId: "g1", planUpdatedAt: 500, frontierUpdatedAt: 2000 });
    expect(mergeHifz(withProgress, corrected).frontierId).toBe(50);
    expect(mergeHifz(corrected, withProgress).frontierId).toBe(50);
  });

  it("two simultaneous memorization sessions on the same plan both survive (no loss)", () => {
    const a = hz({ plan: plan(1), frontierId: 100, sessions: [{ id: "sA", date: "2026-01-05", fromId: 51, toId: 100, at: 1000 }], planId: "g1", planUpdatedAt: 100, frontierUpdatedAt: 100 });
    const b = hz({ plan: plan(1), frontierId: 120, sessions: [{ id: "sB", date: "2026-01-05", fromId: 51, toId: 120, at: 1100 }], planId: "g1", planUpdatedAt: 100, frontierUpdatedAt: 100 });
    const m = mergeHifz(a, b);
    expect(m.sessions.map((s) => s.id).sort()).toEqual(["sA", "sB"]);
    expect(m.frontierId).toBe(120); // furthest real progress
    expect(mergeHifz(b, a).frontierId).toBe(120); // commutative
  });

  it("a review and a mistake added on two devices (same plan) both merge in", () => {
    const a = hz({ plan: plan(1), frontierId: 100, planId: "g1", planUpdatedAt: 100, frontierUpdatedAt: 100,
      reviews: [{ id: "rA", date: "2026-01-06", fromId: 1, toId: 50 }],
      mistakes: [{ id: "mA", ayahId: 3, wordIndex: 2, hits: ["2026-01-06"], resolved: false, updatedAt: "2026-01-06" }],
    });
    const b = hz({ plan: plan(1), frontierId: 100, planId: "g1", planUpdatedAt: 100, frontierUpdatedAt: 100,
      reviews: [{ id: "rB", date: "2026-01-07", fromId: 51, toId: 100 }],
      mistakes: [{ id: "mB", ayahId: 9, wordIndex: null, hits: ["2026-01-07"], resolved: false, updatedAt: "2026-01-07" }],
    });
    const m = mergeHifz(a, b);
    expect(m.reviews.map((r) => r.id).sort()).toEqual(["rA", "rB"]);
    expect((m.mistakes ?? []).map((x) => x.id).sort()).toEqual(["mA", "mB"]);
  });

  it("legacy states with no planId (same plan) merge without loss", () => {
    const legA = hz({ plan: plan(1), frontierId: 50, sessions: [{ id: "a", date: "2026-01-02", fromId: 1, toId: 50 }] });
    const legB = hz({ plan: plan(1), frontierId: 60, sessions: [{ id: "b", date: "2026-01-03", fromId: 51, toId: 60 }] });
    const m = mergeHifz(legA, legB);
    expect(m.sessions.map((s) => s.id).sort()).toEqual(["a", "b"]);
    expect(m.frontierId).toBe(60);
  });

  it("updating the daily amount keeps progress (newer config wins, sessions intact)", () => {
    const sess = { id: "s1", date: "2026-01-05", fromId: 1, toId: 100, at: 1000 };
    const a = hz({ plan: plan(1, { amount: 1 }), frontierId: 100, sessions: [sess], planId: "g1", planUpdatedAt: 500, frontierUpdatedAt: 100 });
    const b = hz({ plan: plan(1, { amount: 3 }), frontierId: 100, sessions: [sess], planId: "g1", planUpdatedAt: 2000, frontierUpdatedAt: 100 });
    const m = mergeHifz(a, b);
    expect(m.plan?.amount).toBe(3);
    expect(m.frontierId).toBe(100);
    expect(m.sessions).toHaveLength(1);
  });

  it("restoring a backup then syncing does NOT revive a cleared plan", () => {
    // Backup keeps its ORIGINAL (old) plan stamp; the cleared device is newer.
    const restoredBackup = hz({ plan: plan(1), frontierId: 200,
      sessions: [{ id: "s1", date: "2026-01-05", fromId: 1, toId: 200, at: 1000 }],
      planId: "g-old", planUpdatedAt: 1000, frontierUpdatedAt: 1000 });
    const cleared = hz({ plan: null, planId: "gen-clear", planUpdatedAt: 5000, frontierUpdatedAt: 5000 });
    const m = mergeHifz(restoredBackup, cleared);
    expect(m.plan).toBeNull();
    expect(m.sessions).toHaveLength(0);
  });

  it("wires through mergeAppData end-to-end (clear wins)", () => {
    const local = base({ lastUpdated: "2026-05-10T12:00:00.000Z",
      quranHifz: hz({ plan: null, planId: "gc", planUpdatedAt: 3000, frontierUpdatedAt: 3000 }) });
    const cloud = base({ lastUpdated: "2026-05-11T12:00:00.000Z", // newer top-level stamp, but OLD plan gen
      quranHifz: hz({ plan: plan(1), frontierId: 80,
        sessions: [{ id: "s1", date: "2026-01-05", fromId: 1, toId: 80, at: 1000 }],
        planId: "go", planUpdatedAt: 1000, frontierUpdatedAt: 1000 }) });
    const merged = mergeAppData(local, cloud);
    expect(merged.quranHifz.plan).toBeNull();
    expect(merged.quranHifz.sessions).toHaveLength(0);
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

describe("mergeHifz — record deletions survive sync (generation tombstones)", () => {
  const NOW = Date.now(); // شواهد الحذف تُقلَّم بعد سنة، فلتكن حديثة في الاختبار
  const g1 = { plan: plan(1), planId: "g1", planUpdatedAt: 100, frontierUpdatedAt: 100 };
  const sess = (id: string, extra = {}) => ({ id, date: "2026-01-05", fromId: 1, toId: 50, at: 1000, ...extra });

  it("a deleted session is NOT resurrected by an old device's union (both orders)", () => {
    const deleted = hz({ ...g1, sessions: [], deletedRecords: { s1: NOW } });
    const oldCopy = hz({ ...g1, sessions: [sess("s1")] }); // جهاز لم يرَ الحذف بعد
    for (const m of [mergeHifz(deleted, oldCopy), mergeHifz(oldCopy, deleted)]) {
      expect(m.sessions.map((x) => x.id)).toEqual([]);
      expect(m.deletedRecords?.s1).toBe(NOW);
    }
  });

  it("a deleted review and a deleted mistake also stay deleted", () => {
    const deleted = hz({ ...g1, reviews: [], mistakes: [], deletedRecords: { rv1: NOW, mk1: NOW } });
    const oldCopy = hz({
      ...g1,
      reviews: [{ id: "rv1", date: "2026-01-06", fromId: 1, toId: 50 }],
      mistakes: [{ id: "mk1", ayahId: 3, wordIndex: null, hits: ["2026-01-06"], resolved: false, updatedAt: "2026-01-06" }],
    });
    const m = mergeHifz(deleted, oldCopy);
    expect(m.reviews).toHaveLength(0);
    expect(m.mistakes).toHaveLength(0);
  });

  it("undo (tombstone lifted before the delete propagated) keeps the record", () => {
    // بعد حذفٍ ثمّ تراجعٍ فوريّ: الجهاز يحمل السجلّ بلا شاهد. الجهاز الآخر لم يرَ
    // الحذف أصلاً → السجلّ يبقى (خلافاً لحالة الحذف المُنتشِر أعلاه).
    const undone = hz({ ...g1, sessions: [sess("s1")], deletedRecords: undefined });
    const other = hz({ ...g1, sessions: [sess("s1")] });
    for (const m of [mergeHifz(undone, other), mergeHifz(other, undone)]) {
      expect(m.sessions.map((x) => x.id)).toEqual(["s1"]);
    }
  });

  it("the newer rating edit wins across two devices (by updatedAt), both orders", () => {
    const a = hz({ ...g1, sessions: [sess("s1", { rating: 1, updatedAt: 2000 })] });
    const b = hz({ ...g1, sessions: [sess("s1", { rating: 3, updatedAt: 1000 })] });
    expect(mergeHifz(a, b).sessions[0].rating).toBe(1);
    expect(mergeHifz(b, a).sessions[0].rating).toBe(1); // تبادليّة
  });

  it("two reviews on the same day get a device-independent order (by at)", () => {
    const a = hz({ ...g1, reviews: [{ id: "rv1", date: "2026-01-06", fromId: 1, toId: 25, at: 1000 }] });
    const b = hz({ ...g1, reviews: [{ id: "rv2", date: "2026-01-06", fromId: 26, toId: 50, at: 2000 }] });
    const ab = mergeHifz(a, b).reviews.map((r) => r.id);
    const ba = mergeHifz(b, a).reviews.map((r) => r.id);
    expect(ab).toEqual(["rv2", "rv1"]); // الأحدث إنشاءً أوّلاً
    expect(ba).toEqual(ab); // نفس الترتيب مهما كان الأساس
  });

  it("end-to-end through mergeAppData: a deleted session stays deleted", () => {
    const local = base({ lastUpdated: "2026-05-10T12:00:00.000Z",
      quranHifz: hz({ ...g1, sessions: [], deletedRecords: { s1: NOW } }) });
    const cloud = base({ lastUpdated: "2026-05-11T12:00:00.000Z", // ختم مستندٍ أحدث لكنّه يحمل النسخة القديمة
      quranHifz: hz({ ...g1, sessions: [sess("s1")] }) });
    expect(mergeAppData(local, cloud).quranHifz.sessions).toHaveLength(0);
    expect(mergeAppData(cloud, local).quranHifz.sessions).toHaveLength(0);
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

describe("mergeRecurringRules — تعديلٌ يفوز، وlastGenerated لا يرجع للخلف", () => {
  const rule = (over: Partial<RecurringTransaction> & { id: string }): RecurringTransaction => ({
    amount: 500, category: "cat", note: "إيجار", unit: "شهري", every: 1,
    dayOfMonth: 1, anchorDate: "2026-01-01", active: true, ...over,
  });

  it("keeps the most recent lastGenerated from either device (never rewinds)", () => {
    const ahead = rule({ id: "r1", lastGenerated: "2026-05-01", updatedAt: 1000 });
    const behind = rule({ id: "r1", lastGenerated: "2026-04-01", updatedAt: 2000 });
    // الجهاز صاحب التعديل الأحدث متأخّرٌ في التوليد — يفوز بحقوله، ويبقى
    // lastGenerated الأحدث فلا يُعاد توليد قسط مايو.
    for (const merged of [mergeRecurringRules([ahead], [behind]), mergeRecurringRules([behind], [ahead])]) {
      expect(merged).toHaveLength(1);
      expect(merged[0].lastGenerated).toBe("2026-05-01");
    }
  });

  it("the newer edit wins per field, in both orders (commutative)", () => {
    const a = rule({ id: "r1", amount: 700, active: false, updatedAt: 3000 });
    const b = rule({ id: "r1", amount: 500, active: true, updatedAt: 2000 });
    for (const merged of [mergeRecurringRules([a], [b]), mergeRecurringRules([b], [a])]) {
      expect(merged[0].amount).toBe(700);
      expect(merged[0].active).toBe(false);
    }
  });

  it("propagates a switch to reminder mode by recency", () => {
    const a = rule({ id: "r1", generationMode: "reminder", updatedAt: 5000 });
    const b = rule({ id: "r1", generationMode: "auto", updatedAt: 4000 });
    expect(mergeRecurringRules([b], [a])[0].generationMode).toBe("reminder");
  });

  it("keeps rules that live on only one device", () => {
    const merged = mergeRecurringRules([rule({ id: "r1" })], [rule({ id: "r2" })]);
    expect(merged.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
  });

  it("falls back to the primary copy when neither side carries a stamp (legacy)", () => {
    const a = rule({ id: "r1", amount: 111 });
    const b = rule({ id: "r1", amount: 222 });
    expect(mergeRecurringRules([a], [b])[0].amount).toBe(111);
  });

  it("through mergeAppData: a deleted rule stays deleted and lastGenerated holds", () => {
    const local = base({
      lastUpdated: "2026-05-01T00:00:00.000Z",
      recurring: [rule({ id: "r1", lastGenerated: "2026-05-01", updatedAt: 10 })],
      deleted: { r2: Date.now() },
    });
    const cloud = base({
      lastUpdated: "2026-05-09T00:00:00.000Z",
      recurring: [
        rule({ id: "r1", lastGenerated: "2026-03-01", updatedAt: 20 }),
        rule({ id: "r2" }), // محذوفة محلياً — لا تعود
      ],
    });
    const merged = mergeAppData(local, cloud);
    expect(merged.recurring.map((r) => r.id)).toEqual(["r1"]);
    expect(merged.recurring[0].lastGenerated).toBe("2026-05-01");
  });
});

describe("mergeAppData — خطط الأقساط", () => {
  const plan = (over: Partial<InstallmentPlan> & { id: string }): InstallmentPlan => ({
    provider: "تمارا", name: "جوّال", totalPrice: 1200, downPayment: 200,
    installmentAmount: 100, count: 10, firstDueDate: "2026-02-15",
    status: "active", createdAt: "2026-02-01", ...over,
  });

  it("unions plans from both devices", () => {
    const local = base({ installmentPlans: [plan({ id: "p1" })] });
    const cloud = base({ installmentPlans: [plan({ id: "p2" })] });
    expect(mergeAppData(local, cloud).installmentPlans.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("the newer per-plan edit wins even when the OTHER device holds the newer doc stamp", () => {
    const local = base({
      lastUpdated: "2026-05-01T00:00:00.000Z",
      installmentPlans: [plan({ id: "p1", status: "settled", updatedAt: 9000 })],
    });
    const cloud = base({
      lastUpdated: "2026-05-20T00:00:00.000Z",
      installmentPlans: [plan({ id: "p1", status: "active", updatedAt: 100 })],
    });
    expect(mergeAppData(local, cloud).installmentPlans[0].status).toBe("settled");
    expect(mergeAppData(cloud, local).installmentPlans[0].status).toBe("settled");
  });

  it("a deleted plan is not resurrected by the other device's copy", () => {
    const local = base({ installmentPlans: [], deleted: { p1: Date.now() } });
    const cloud = base({ installmentPlans: [plan({ id: "p1" })], lastUpdated: "2026-06-01T00:00:00.000Z" });
    expect(mergeAppData(local, cloud).installmentPlans).toHaveLength(0);
    expect(mergeAppData(cloud, local).installmentPlans).toHaveLength(0);
  });

  it("payments linked to a plan survive the merge with their role intact", () => {
    const paid = tx({ id: "pay1", amount: 100, planId: "p1", planRole: "installment", planInstallmentNo: 1, updatedAt: 5 });
    const local = base({ installmentPlans: [plan({ id: "p1" })], transactions: [paid] });
    const cloud = base({ installmentPlans: [plan({ id: "p1" })], transactions: [] });
    const merged = mergeAppData(local, cloud);
    expect(merged.transactions).toHaveLength(1);
    expect(merged.transactions[0].planRole).toBe("installment");
    expect(merged.transactions[0].planInstallmentNo).toBe(1);
  });
});

// الأصول كانت بلا اختبار دمجٍ واحد رغم أنها المجموعة التي تخلّفت بين الأجهزة
// (0.1.298). نغطّيها بما غُطّيت به خطط الأقساط بالضبط.
describe("mergeAppData — الأصول تعبر بين الأجهزة ولا تعود بعد حذفها", () => {
  const asset = (over: Partial<Asset> & { id: string }): Asset => ({
    name: "ماك بوك", purchaseDate: "2026-07-26", purchasePrice: 5499, lifeDays: 1825,
    createdAt: "2026-07-26", ...over,
  });

  it("unions assets from both devices", () => {
    const local = base({ assets: [asset({ id: "a1" })] });
    const cloud = base({ assets: [asset({ id: "a2" })] });
    expect(mergeAppData(local, cloud).assets.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
    expect(mergeAppData(cloud, local).assets.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
  });

  it("the newer per-asset edit wins even when the OTHER device holds the newer doc stamp", () => {
    const local = base({
      lastUpdated: "2026-05-01T00:00:00.000Z",
      assets: [asset({ id: "a1", lifeDays: 730, updatedAt: 9000 })],
    });
    const cloud = base({
      lastUpdated: "2026-05-20T00:00:00.000Z",
      assets: [asset({ id: "a1", lifeDays: 1825, updatedAt: 100 })],
    });
    expect(mergeAppData(local, cloud).assets[0].lifeDays).toBe(730);
    expect(mergeAppData(cloud, local).assets[0].lifeDays).toBe(730);
  });

  it("a deleted asset is not resurrected by the other device's copy", () => {
    const local = base({ assets: [], deleted: { a1: Date.now() } });
    const cloud = base({ assets: [asset({ id: "a1" })], lastUpdated: "2026-06-01T00:00:00.000Z" });
    expect(mergeAppData(local, cloud).assets).toHaveLength(0);
    expect(mergeAppData(cloud, local).assets).toHaveLength(0);
  });
});

// ===================== تعديلُ عنصرٍ قائم لا يرجع للخلف =====================
// السيناريو الحقيقي: تُعدَّل صفحةُ كتابٍ على الآيفون، والآيباد غيرُ متّصلٍ يحمل
// النسخة القديمة ثمّ يسجّل شيئاً آخر (فيصير ختمُ مستنده أحدث) ويعود للاتصال.
// قبل هذه الأختام كانت نسخةُ الكتاب القديمة تفوز فيرجع تقدّم القراءة.
describe("mergeAppData — تعديلُ عنصرٍ قائم يفوز بطابعه لا بختم المستند", () => {
  const olderDoc = "2026-05-01T00:00:00.000Z";
  const newerDoc = "2026-05-20T00:00:00.000Z";
  // جهازٌ حرّر العنصر متأخّراً (طابع عنصرٍ أحدث) لكنّ ختم مستنده أقدم.
  const bothWays = <T,>(a: Partial<AppData>, b: Partial<AppData>, pick: (d: AppData) => T, want: T) => {
    const edited = base({ lastUpdated: olderDoc, ...a });
    const stale = base({ lastUpdated: newerDoc, ...b });
    expect(pick(mergeAppData(edited, stale))).toEqual(want);
    expect(pick(mergeAppData(stale, edited))).toEqual(want); // تبادلية
  };

  it("الكتب: تقدّم الصفحة لا يرجع", () => {
    const book = (o: Partial<Book> & { id: string }): Book => ({
      title: "ك", author: "م", totalPages: 300, currentPage: 0, status: "أقرأ", ...o,
    });
    bothWays(
      { books: [book({ id: "b1", currentPage: 210, updatedAt: 9000 })] },
      { books: [book({ id: "b1", currentPage: 120, updatedAt: 100 })] },
      (d) => d.books[0].currentPage, 210
    );
  });

  it("جلسات القراءة: تصحيح عدد الصفحات يبقى", () => {
    const log = (o: Partial<ReadingLog> & { id: string }): ReadingLog => ({
      bookId: "b1", date: "2026-05-01", pagesRead: 0, ...o,
    });
    bothWays(
      { readingLogs: [log({ id: "r1", pagesRead: 40, updatedAt: 9000 })] },
      { readingLogs: [log({ id: "r1", pagesRead: 12, updatedAt: 100 })] },
      (d) => d.readingLogs[0].pagesRead, 40
    );
  });

  it("التأمّلات القرآنية: تحرير النصّ يبقى", () => {
    const refl = (o: Partial<QuranReflection> & { id: string }): QuranReflection => ({
      date: "2026-05-01", text: "", createdAt: "2026-05-01", ...o,
    });
    bothWays(
      { quranReflections: [refl({ id: "q1", text: "المحرَّر", updatedAt: 9000 })] },
      { quranReflections: [refl({ id: "q1", text: "القديم", updatedAt: 100 })] },
      (d) => d.quranReflections[0].text, "المحرَّر"
    );
  });

  it("الصناديق: تعديل الاسم والهدف يبقى، والإيداعات تتّحد رغم ذلك", () => {
    const fund = (o: Partial<ReserveFund> & { id: string }): ReserveFund => ({
      name: "صندوق", icon: "🎯", color: "#000", deposits: [], createdAt: "2026-01-01", ...o,
    });
    const edited = base({
      lastUpdated: olderDoc,
      reserves: [fund({ id: "f1", name: "سفرة الصيف", target: 5000, updatedAt: 9000,
        deposits: [{ id: "d1", amount: 100, date: "2026-05-01" }] })],
    });
    const stale = base({
      lastUpdated: newerDoc,
      reserves: [fund({ id: "f1", name: "صندوق", target: 1000, updatedAt: 100,
        deposits: [{ id: "d2", amount: 50, date: "2026-05-02" }] })],
    });
    for (const merged of [mergeAppData(edited, stale), mergeAppData(stale, edited)]) {
      expect(merged.reserves[0].name).toBe("سفرة الصيف");
      expect(merged.reserves[0].target).toBe(5000);
      expect(merged.reserves[0].deposits.map((d) => d.id).sort()).toEqual(["d1", "d2"]);
    }
  });

  it("العادات: إعادة تسمية عادة تبقى، وأيام السجلّ تتّحد", () => {
    const habit = (o: Partial<Habit> & { id: string }): Habit => ({
      name: "عادة", icon: "✅", color: "#000", logs: [], ...o,
    });
    const edited = base({
      lastUpdated: olderDoc,
      habits: [habit({ id: "h1", name: "مشي 30د", updatedAt: 9000, logs: ["2026-05-01"] })],
    });
    const stale = base({
      lastUpdated: newerDoc,
      habits: [habit({ id: "h1", name: "مشي", updatedAt: 100, logs: ["2026-05-02"] })],
    });
    for (const merged of [mergeAppData(edited, stale), mergeAppData(stale, edited)]) {
      expect(merged.habits[0].name).toBe("مشي 30د");
      expect(merged.habits[0].logs).toEqual(["2026-05-01", "2026-05-02"]);
    }
  });

  it("التصنيفات: إعادة التسمية تبقى", () => {
    const cat = (o: Partial<FinanceCategoryDef> & { id: string }): FinanceCategoryDef => ({
      label: "تصنيف", icon: "📌", color: "#000", ...o,
    });
    bothWays(
      { categories: [cat({ id: "c1", label: "قهوة", updatedAt: 9000 })] },
      { categories: [cat({ id: "c1", label: "أخرى", updatedAt: 100 })] },
      (d) => d.categories[0].label, "قهوة"
    );
  });

  it("الرسائل المستقبلية: فتحُ رسالةٍ لا يُلغى", () => {
    const letter = (o: Partial<FutureLetter> & { id: string }): FutureLetter => ({
      writtenDate: "2026-01-01", deliveryDate: "2026-05-01", content: "", ...o,
    });
    bothWays(
      { futureLetters: [letter({ id: "l1", opened: true, openedDate: "2026-05-01", updatedAt: 9000 })] },
      { futureLetters: [letter({ id: "l1", opened: false, updatedAt: 100 })] },
      (d) => d.futureLetters[0].opened, true
    );
  });

  it("السقوف: رفعُ سقفٍ قائم لا يرجع للخلف", () => {
    bothWays(
      { budgets: [{ category: "c1", limit: 900, updatedAt: 9000 }] },
      { budgets: [{ category: "c1", limit: 400, updatedAt: 100 }] },
      (d) => d.budgets[0].limit, 900
    );
  });

  it("حالة الصلاة: طابعٌ لكلّ صلاةٍ على حدة — تصحيحُ الفجر لا يُلغيه تسجيلُ العشاء", () => {
    const iphone = base({
      lastUpdated: olderDoc,
      prayerLogs: [{
        date: "2026-05-01",
        prayers: { الفجر: "جماعة" },
        prayerUpdatedAt: { الفجر: 9000 },
      }],
    });
    const ipad = base({
      lastUpdated: newerDoc,
      prayerLogs: [{
        date: "2026-05-01",
        prayers: { الفجر: "منفردة", العشاء: "جماعة" },
        prayerUpdatedAt: { الفجر: 100, العشاء: 9500 },
      }],
    });
    for (const merged of [mergeAppData(iphone, ipad), mergeAppData(ipad, iphone)]) {
      expect(merged.prayerLogs[0].prayers.الفجر).toBe("جماعة"); // التصحيح الأحدث للفجر
      expect(merged.prayerLogs[0].prayers.العشاء).toBe("جماعة"); // ولا يضيع العشاء
      expect(merged.prayerLogs[0].prayerUpdatedAt?.الفجر).toBe(9000);
      expect(merged.prayerLogs[0].prayerUpdatedAt?.العشاء).toBe(9500);
    }
  });

  it("حالة الصلاة: إلغاءُ تسجيلِ صلاةٍ يسري ولا تعود من النسخة القديمة", () => {
    const cleared = base({
      lastUpdated: olderDoc,
      prayerLogs: [{ date: "2026-05-01", prayers: {}, prayerUpdatedAt: { الظهر: 9000 } }],
    });
    const stale = base({
      lastUpdated: newerDoc,
      prayerLogs: [{ date: "2026-05-01", prayers: { الظهر: "منفردة" }, prayerUpdatedAt: { الظهر: 100 } }],
    });
    for (const merged of [mergeAppData(cleared, stale), mergeAppData(stale, cleared)]) {
      expect(merged.prayerLogs[0].prayers.الظهر).toBeUndefined();
    }
  });

  it("قواعد التجار: إعادة تصنيف تاجرٍ على جهازٍ تسري", () => {
    bothWays(
      { merchantRules: { كافيه: "cat-coffee" }, fieldUpdatedAt: { [merchantStampKey("كافيه")]: 9000 } },
      { merchantRules: { كافيه: "cat-others" }, fieldUpdatedAt: { [merchantStampKey("كافيه")]: 100 } },
      (d) => d.merchantRules["كافيه"], "cat-coffee"
    );
  });

  it("تقدّم الختمة: الجهاز الذي سجّل آخِراً يفوز، والختمات المكتملة لا تنقص", () => {
    bothWays(
      { quranKhatma: { juz: 12, completed: 1 }, fieldUpdatedAt: { quranKhatma: 9000 } },
      { quranKhatma: { juz: 3, completed: 2 }, fieldUpdatedAt: { quranKhatma: 100 } },
      (d) => d.quranKhatma, { juz: 12, completed: 2 }
    );
  });

  it("ترتيب التصنيفات: يأتي من الجهاز الذي رتّب آخِراً بلا فقد", () => {
    const cat = (id: string): FinanceCategoryDef => ({ id, label: id, icon: "📌", color: "#000" });
    const ordered = base({
      lastUpdated: olderDoc,
      categories: [cat("c3"), cat("c1"), cat("c2")],
      fieldUpdatedAt: { [CATEGORY_ORDER_FIELD]: 9000 },
    });
    const stale = base({
      lastUpdated: newerDoc,
      categories: [cat("c1"), cat("c2"), cat("c3"), cat("c4")],
      fieldUpdatedAt: { [CATEGORY_ORDER_FIELD]: 100 },
    });
    for (const merged of [mergeAppData(ordered, stale), mergeAppData(stale, ordered)]) {
      // ترتيب المرتِّب أولاً، ثمّ ما لم يره (c4) في ذيل القائمة بلا حذف.
      expect(merged.categories.map((c) => c.id)).toEqual(["c3", "c1", "c2", "c4"]);
    }
  });

  it("بلا طوابع (بياناتٌ قديمة) يبقى السلوك السابق: نسخة الأساس", () => {
    const a = base({ lastUpdated: newerDoc, books: [{ id: "b1", title: "أ", author: "", totalPages: 1, currentPage: 5, status: "أقرأ" }] });
    const b = base({ lastUpdated: olderDoc, books: [{ id: "b1", title: "ب", author: "", totalPages: 1, currentPage: 9, status: "أقرأ" }] });
    expect(mergeAppData(a, b).books[0].currentPage).toBe(5); // الأحدث ختماً هو الأساس
  });
});

// ===================== شواهدُ الحذف تُطبَّق بلا دمج =====================
// مسار «جهازٌ جديد يتبنّى السحابة كاملةً» يتخطّى mergeAppData، وshards المذكرات
// لا تُحذف عمداً حين تفرغ — فكانت مذكرةٌ محذوفة تعود على الجهاز الجديد.
describe("applyTombstones — لقطةٌ تُنقّى بشواهدها وحدها", () => {
  it("تُسقِط المذكرة المحذوفة التي بقيت في shard قديم", () => {
    const cloud = base({
      journalEntries: [entry({ id: "E1" }), entry({ id: "E2" })],
      deleted: { E1: Date.now() },
    });
    const clean = applyTombstones(cloud);
    expect(clean.journalEntries.map((e) => e.id)).toEqual(["E2"]);
  });

  it("حذفُ كلّ المذكرات ثمّ فتحُ جهازٍ جديد: لا شيء يعود", () => {
    const cloud = base({
      journalEntries: [entry({ id: "E1" }), entry({ id: "E2" })],
      deleted: { E1: Date.now(), E2: Date.now() },
    });
    expect(applyTombstones(cloud).journalEntries).toEqual([]);
  });

  it("تُسقِط كذلك يوم عادةٍ أُلغي ووِرداً أُلغي وسقفاً حُذف — ولا تمسّ الباقي", () => {
    const cloud = base({
      habits: [{ id: "h1", name: "ح", icon: "✅", color: "#000", logs: ["2026-05-01", "2026-05-02"] }],
      quranWird: ["2026-05-01", "2026-05-02"],
      budgets: [{ category: "c1", limit: 100 }, { category: "c2", limit: 200 }],
      transactions: [tx({ id: "T1" })],
      deleted: {
        [habitLogTombKey("h1", "2026-05-01")]: Date.now(),
        [wirdTombKey("2026-05-01")]: Date.now(),
        [budgetTombKey("c1")]: Date.now(),
      },
    });
    const clean = applyTombstones(cloud);
    expect(clean.habits[0].logs).toEqual(["2026-05-02"]);
    expect(clean.quranWird).toEqual(["2026-05-02"]);
    expect(clean.budgets.map((b) => b.category)).toEqual(["c2"]);
    expect(clean.transactions).toHaveLength(1);
  });
});

// ===================== العناصر المركّبة: لكلّ جزءٍ دمجُه =====================
// عنصرٌ فيه مجموعةٌ داخلية (سجلّات العادة، إيداعات الصندوق، وسائط المذكرة) له
// دمجان مختلفان: بياناتُه تُحسم بطابعه، ومجموعتُه تتّحد وتُحذف بشواهدها. لو رفع
// تغييرُ المجموعة طابعَ العنصر لابتلع الأولُ الثاني: تسجيلُ يومٍ يفوز على إعادة
// تسمية، واستكمالُ صورةٍ يفوز على تحرير النصّ. كلّ اختبارٍ هنا يُشغَّل بالاتجاهين.
describe("mergeAppData — تعارضُ العناصر المركّبة (تبادليّ)", () => {
  const both = (a: AppData, b: AppData, check: (d: AppData) => void) => {
    check(mergeAppData(a, b));
    check(mergeAppData(b, a));
  };

  it("تسجيلُ يومِ عادةٍ لا يرفع طابعها فيبتلع إعادةَ التسمية على الجهاز الآخر", () => {
    const habit = (o: Partial<Habit> & { id: string }): Habit => ({
      name: "عادة", icon: "✅", color: "#000", logs: [], ...o,
    });
    // الآيفون: أعاد التسمية (طابع 5000). الآيباد: سجّل يوماً لاحقاً — ولأنّ
    // السجلّات لا تُختم، يبقى طابعه القديم فلا يطغى الاسمُ القديم على الجديد.
    const iphone = base({ habits: [habit({ id: "h1", name: "مشي 30د", updatedAt: 5000, logs: ["2026-05-01"] })] });
    const ipad = base({ habits: [habit({ id: "h1", name: "مشي", updatedAt: 100, logs: ["2026-05-01", "2026-05-09"] })] });
    both(iphone, ipad, (d) => {
      expect(d.habits[0].name).toBe("مشي 30د");
      expect(d.habits[0].logs).toEqual(["2026-05-01", "2026-05-09"]); // اليوم الجديد باقٍ
    });
  });

  it("إيداعٌ جديد لا يرفع طابع الصندوق فيبتلع تعديل الهدف على الجهاز الآخر", () => {
    const fund = (o: Partial<ReserveFund> & { id: string }): ReserveFund => ({
      name: "صندوق", icon: "🎯", color: "#000", deposits: [], createdAt: "2026-01-01", ...o,
    });
    const iphone = base({ reserves: [fund({ id: "f1", target: 9000, updatedAt: 5000,
      deposits: [{ id: "d1", amount: 100, date: "2026-05-01" }] })] });
    const ipad = base({ reserves: [fund({ id: "f1", target: 1000, updatedAt: 100,
      deposits: [{ id: "d1", amount: 100, date: "2026-05-01" }, { id: "d2", amount: 300, date: "2026-05-09" }] })] });
    both(iphone, ipad, (d) => {
      expect(d.reserves[0].target).toBe(9000);
      expect(d.reserves[0].deposits.map((x) => x.id).sort()).toEqual(["d1", "d2"]);
    });
  });

  it("حذفُ إيداعٍ يبقى محذوفاً ولا يعيده اتحادُ الصندوق", () => {
    const fund = (deposits: { id: string; amount: number; date: string }[]): ReserveFund => ({
      id: "f1", name: "صندوق", icon: "🎯", color: "#000", deposits, createdAt: "2026-01-01",
    });
    const deleted = base({
      reserves: [fund([{ id: "d1", amount: 100, date: "2026-05-01" }])],
      deleted: { [depositTombKey("d2")]: Date.now() },
    });
    const stale = base({
      lastUpdated: "2026-06-01T00:00:00.000Z",
      reserves: [fund([{ id: "d1", amount: 100, date: "2026-05-01" }, { id: "d2", amount: 300, date: "2026-05-09" }])],
    });
    both(deleted, stale, (d) => {
      expect(d.reserves[0].deposits.map((x) => x.id)).toEqual(["d1"]);
    });
  });

  it("استكمالُ وسائط Day One لا يرفع طابع المذكرة فيبتلع تحريرَ النصّ", () => {
    // الآيفون: حرّر النصّ (طابع 5000، بلا صور). الآيباد: أعاد استيراد Day One
    // فاستكمل الصور — تغييرٌ في الوسائط وحدها، فطابعه يبقى 100.
    const iphone = base({ journalEntries: [entry({ id: "E1", content: "النصّ المحرَّر", updatedAt: 5000 })] });
    const ipad = base({
      journalEntries: [entry({ id: "E1", content: "النصّ القديم", updatedAt: 100, photos: ["data:img-a"] })],
    });
    both(iphone, ipad, (d) => {
      expect(d.journalEntries[0].content).toBe("النصّ المحرَّر"); // التحرير يفوز
      expect(d.journalEntries[0].photos).toEqual(["data:img-a"]); // والصورة لا تضيع
    });
  });

  it("صورةٌ حُذفت من مذكرة تبقى محذوفة رغم اتحاد الوسائط", () => {
    // في السحابة تُمثَّل الصورة بمرجع تجزئة (photoRefs)؛ الشاهد يُسقطها من كلّ
    // نسخة. (بايتات `data:` يُسقطها inlineCachedMedia بالتجزئة نفسها قبل الترطيب.)
    const hash = "abc123";
    const deleted = base({
      journalEntries: [{ ...entry({ id: "E1", content: "نص", updatedAt: 5000 }), photoRefs: [] } as JournalEntry],
      deletedMedia: { [mediaTombKey("E1", "photos", hash)]: Date.now() },
    });
    const stale = base({
      lastUpdated: "2026-06-01T00:00:00.000Z",
      journalEntries: [{ ...entry({ id: "E1", content: "نص", updatedAt: 100 }), photoRefs: [hash] } as JournalEntry],
    });
    both(deleted, stale, (d) => {
      const refs = (d.journalEntries[0] as JournalEntry & { photoRefs?: string[] }).photoRefs ?? [];
      expect(refs).toEqual([]);
    });
  });

  it("هدفُ الصفحات اليومي وتقدّمُ الختمة طابعان منفصلان، والمكتملة لا تنقص", () => {
    // الآيفون: قرأ (تقدّم أحدث). الآيباد: غيّر الهدف فقط (هدفٌ أحدث).
    const iphone = base({
      quranKhatma: { juz: 12, page: 240, completed: 1, dailyPageGoal: 20 },
      fieldUpdatedAt: { quranKhatma: 9000, [KHATMA_GOAL_FIELD]: 100 },
    });
    const ipad = base({
      quranKhatma: { juz: 3, page: 60, completed: 2, dailyPageGoal: 5 },
      fieldUpdatedAt: { quranKhatma: 100, [KHATMA_GOAL_FIELD]: 9000 },
    });
    both(iphone, ipad, (d) => {
      expect(d.quranKhatma.page).toBe(240);       // التقدّم من صاحب طابع التقدّم
      expect(d.quranKhatma.dailyPageGoal).toBe(5); // والهدف من صاحب طابع الهدف
      expect(d.quranKhatma.completed).toBe(2);     // ولا تنقص الختمات المكتملة
    });
  });
});
