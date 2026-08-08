// Phase 4 (main-document growth) — pure planning/verification layer for
// sharding `transactions` the same way `journalEntries` already is (see
// journalShardId in merge.ts and the journal shard read/write in sync.ts).
// Firebase-free by design (mirrors merge.ts's own reasoning) so the migration
// math is unit-testable without an emulator or a live document.
//
// STATUS: this module is the tested, idempotent PLANNING/dry-run layer asked
// for by the task. It is NOT yet wired into sync.ts's live Firestore
// read/write path — see docs/DOC-GROWTH.md for exactly why (the live wiring
// is a real production-sync change to the app's financial data path, and
// this session could not integration-test it against a real Firestore
// project) and the precise, line-referenced plan to complete that wiring by
// mirroring the journal shard code that already ships and works.
import type { Transaction } from "./types";
import { journalShardId } from "./merge";

/** Which monthly shard a transaction belongs to — the exact same YYYY-MM (or
 *  "misc") rule journalShardId already uses for journal entries. Reusing it
 *  (rather than duplicating the date-parsing) is deliberate: one tested rule
 *  for "which month does this date belong to" across both entity types. */
export const transactionShardId = journalShardId;

export function splitTransactionShards(transactions: Transaction[]): Map<string, Transaction[]> {
  const shards = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const sid = transactionShardId(t.date);
    let arr = shards.get(sid);
    if (!arr) { arr = []; shards.set(sid, arr); }
    arr.push(t);
  }
  return shards;
}

// Deterministic content signature for one shard: sorted keys, sorted-by-id
// entries, `undefined` fields dropped — mirrors sync.ts's own canonicalize/
// shardSig (kept as a separate copy here rather than imported, since sync.ts
// pulls in the Firebase SDK and this module must stay Firebase-free to be
// testable in plain Node without a mock).
function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v && typeof v === "object") {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) {
      if (src[k] === undefined) continue;
      out[k] = canonicalize(src[k]);
    }
    return out;
  }
  return v;
}

// FNV-1a 32-bit — not cryptographic, just a short, stable fingerprint for a
// migration report ("did this shard change between two runs?"), the same way
// a build tag or ETag is used elsewhere in this codebase. Deterministic and
// synchronous (no crypto.subtle round-trip) so report generation stays cheap
// even for hundreds of shards.
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function shardChecksum(items: Transaction[]): string {
  const idOf = (t: Transaction) => t.id ?? "";
  const canonical = [...items]
    .sort((a, b) => (idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0))
    .map(canonicalize);
  return fnv1a(JSON.stringify(canonical));
}

export interface ShardPlan {
  id: string;
  count: number;
  checksum: string;
}

export interface TransactionMigrationReport {
  dryRun: boolean;
  totalTransactions: number;
  shardCount: number;
  shards: ShardPlan[];
  /** True when every transaction in the input is present, unaltered, exactly
   *  once, in the planned shards — the financial-integrity guarantee this
   *  migration must never violate. Content equality (by id, full field
   *  match), NOT array position: every transaction list in the app UI is
   *  already re-sorted by date at render time (src/app/finance/page.tsx and
   *  others), so raw array order was never a contract sharding needs to
   *  preserve — only which transactions exist, and their own fields
   *  (amount/date/category/...), must never change. */
  roundTripOk: boolean;
  /** Populated only when roundTripOk is false — which transaction ids were
   *  lost, duplicated, or had a field change, so a failure is diagnosable
   *  instead of a bare boolean. */
  mismatches: string[];
}

/** Builds the shard plan and verifies it round-trips losslessly. Always a
 *  dry run — this function never writes anywhere, local or cloud; it only
 *  computes what a real migration WOULD write. Calling it twice on the same
 *  input yields byte-identical checksums (idempotent), and calling it on the
 *  concatenation of two prior runs' outputs is a no-op check for "already
 *  migrated" callers to short-circuit on. */
export function planTransactionMigration(transactions: Transaction[]): TransactionMigrationReport {
  const shards = splitTransactionShards(transactions);
  const shardPlans: ShardPlan[] = [...shards.entries()]
    .map(([id, items]) => ({ id, count: items.length, checksum: shardChecksum(items) }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const original = new Map(transactions.map((t) => [t.id, t]));
  const rejoined = new Map([...shards.values()].flat().map((t) => [t.id, t]));
  const mismatches: string[] = [];
  for (const [id, t] of original) {
    const r = rejoined.get(id);
    if (!r) { mismatches.push(id); continue; }
    if (JSON.stringify(canonicalize(t)) !== JSON.stringify(canonicalize(r))) mismatches.push(id);
  }
  for (const id of rejoined.keys()) {
    if (!original.has(id)) mismatches.push(id); // a shard fabricated an id — should be impossible
  }

  return {
    dryRun: true,
    totalTransactions: transactions.length,
    shardCount: shardPlans.length,
    shards: shardPlans,
    roundTripOk: mismatches.length === 0,
    mismatches,
  };
}
