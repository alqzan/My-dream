import { GENERAL_FUND_NAME, SURPLUS_FUND_NAME, type ReserveFund, type ReserveSplit } from "./types";

/** Stable roles for the two system envelopes. Names are display text only. */
export type ReserveFundRole = "general" | "surplus" | "custom";

// New installations use deterministic ids. Existing ids are kept when unique;
// duplicate role copies are collapsed only with an explicit alias rewrite.
export const GENERAL_FUND_ID = "fund-general";
export const SURPLUS_FUND_ID = "fund-surplus";

/** Stable pair of deposit ids for one retriable reserve-to-reserve operation. */
export function reserveTransferDepositId(operationId: string, side: "out" | "in"): string {
  return `transfer:${operationId}:${side}`;
}

export function reserveFundRole(fund: Pick<ReserveFund, "name" | "role">): ReserveFundRole | undefined {
  if (fund.role === "general" || fund.role === "surplus") return fund.role;
  if (fund.role === "custom") return undefined;
  const name = typeof fund.name === "string" ? fund.name.trim() : "";
  if (name === GENERAL_FUND_NAME) return "general";
  if (name === SURPLUS_FUND_NAME) return "surplus";
  return undefined;
}

export function isGeneralFund(fund: Pick<ReserveFund, "name" | "role">): boolean {
  return reserveFundRole(fund) === "general";
}

export function isSurplusFund(fund: Pick<ReserveFund, "name" | "role">): boolean {
  return reserveFundRole(fund) === "surplus";
}

export function isSystemReserveFund(fund: Pick<ReserveFund, "name" | "role">): boolean {
  return reserveFundRole(fund) !== undefined;
}

export function findReserveByRole(
  reserves: ReserveFund[],
  role: "general" | "surplus",
): ReserveFund | undefined {
  return reserves.find((fund) => reserveFundRole(fund) === role);
}

function canonicalName(role: "general" | "surplus"): string {
  return role === "general" ? GENERAL_FUND_NAME : SURPLUS_FUND_NAME;
}

/**
 * Adds the role to legacy records without changing their ids or balances.
 * If an old export contains two copies of a reserved name, only the first
 * deterministic occurrence keeps the system role; the other is explicitly
 * custom so it cannot accidentally control salary rollover or trip logic.
 * Explicit role metadata is kept on every copy until the merge canonicalizer
 * can union those copies and rewrite their references safely.
 */
export function normalizeReserveFunds(reserves: ReserveFund[]): ReserveFund[] {
  const seen = new Set<"general" | "surplus">();
  return reserves.map((fund) => {
    const inferred = reserveFundRole(fund);
    const explicit = fund.role === "general" || fund.role === "surplus";
    const role: ReserveFundRole = inferred === "general" || inferred === "surplus"
      ? (explicit || !seen.has(inferred) ? inferred : "custom")
      : "custom";
    if (role === "general" || role === "surplus") seen.add(role);
    if (role === "general" || role === "surplus") {
      return { ...fund, role, name: canonicalName(role) };
    }
    // Ordinary user envelopes did not need a role in legacy snapshots. Keep
    // the field absent so a hydrate/backup round-trip does not rewrite every
    // custom record; only a reserved-name duplicate gets an explicit custom
    // marker to prevent it from being mistaken for system infrastructure.
    return inferred ? { ...fund, role: "custom" } : fund;
  });
}

export interface CanonicalReserveFunds {
  reserves: ReserveFund[];
  /** Old system-fund ids that must be redirected to the chosen canonical id. */
  aliases: Record<string, string>;
}

type SystemRole = "general" | "surplus";

function systemRoleCandidate(fund: ReserveFund): SystemRole | undefined {
  // An explicit custom role is a user decision. A custom envelope named
  // "عام"/"الفوائض" must therefore never be folded into infrastructure.
  if (fund.role === "custom") return undefined;
  if (fund.role === "general" || fund.role === "surplus") return fund.role;
  const name = typeof fund.name === "string" ? fund.name.trim() : "";
  if (name === GENERAL_FUND_NAME) return "general";
  if (name === SURPLUS_FUND_NAME) return "surplus";
  return undefined;
}

function systemId(role: SystemRole): string {
  return role === "general" ? GENERAL_FUND_ID : SURPLUS_FUND_ID;
}

function candidateRank(fund: ReserveFund, role: SystemRole): [number, number, string] {
  // Explicit role metadata is stronger than a legacy name inference. The
  // fixed ids win next; the lexical tie-break makes two legacy devices
  // converge without depending on merge argument/array order.
  return [
    fund.role === role ? 0 : 1,
    fund.id === systemId(role) ? 0 : 1,
    fund.id,
  ];
}

function compareRank(a: [number, number, string], b: [number, number, string]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]);
}

function mergeRoleFunds(role: SystemRole, candidates: ReserveFund[]): ReserveFund {
  const ranked = [...candidates].sort((a, b) => compareRank(candidateRank(a, role), candidateRank(b, role)));
  const metadata = [...ranked].sort((a, b) =>
    (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    || compareRank(candidateRank(a, role), candidateRank(b, role))
  )[0];
  const deposits = new Map<string, ReserveFund["deposits"][number]>();
  const trips = new Map<string, NonNullable<ReserveFund["trips"]>[number]>();
  for (const fund of ranked) {
    for (const deposit of fund.deposits ?? []) {
      // Same deposit id is one event. The deterministic candidate order keeps
      // equal-id conflicts stable while retaining every distinct deposit.
      if (!deposits.has(deposit.id)) deposits.set(deposit.id, deposit);
    }
    for (const trip of fund.trips ?? []) {
      const previous = trips.get(trip.id);
      if (!previous) trips.set(trip.id, trip);
      else {
        const endedAt = [previous.endedAt, trip.endedAt]
          .filter((value): value is string => !!value)
          .sort()
          .at(-1);
        trips.set(trip.id, endedAt ? { ...previous, endedAt } : previous);
      }
    }
  }
  const merged: ReserveFund = {
    ...metadata,
    id: ranked[0].id,
    role,
    name: canonicalName(role),
    deposits: [...deposits.values()].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
  };
  if (trips.size) {
    merged.trips = [...trips.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id));
  } else {
    delete merged.trips;
  }
  return merged;
}

/**
 * Collapse copies of the two system envelopes after a multi-device union.
 * Different devices can legitimately have different legacy ids for the same
 * role; unioning by id alone would leave two "general"/"surplus" funds and
 * make whichever one happens to be first control salary and reconciliation.
 *
 * Explicit custom envelopes remain separate, even when their display name is
 * the same as a system envelope. Every collapsed id is returned in `aliases`
 * so callers can rewrite transaction splits and settings before persisting.
 */
export function canonicalizeReserveFunds(reserves: ReserveFund[]): CanonicalReserveFunds {
  const groups = new Map<SystemRole, ReserveFund[]>();
  const indexes = new Map<string, number>();
  reserves.forEach((fund, index) => indexes.set(fund.id, index));
  for (const fund of reserves) {
    const role = systemRoleCandidate(fund);
    if (!role) continue;
    const group = groups.get(role) ?? [];
    group.push(fund);
    groups.set(role, group);
  }

  const aliases: Record<string, string> = {};
  const replacements = new Map<number, ReserveFund>();
  const removed = new Set<string>();
  for (const [role, candidates] of groups) {
    if (candidates.length === 0) continue;
    const canonical = mergeRoleFunds(role, candidates);
    const firstIndex = Math.min(...candidates.map((fund) => indexes.get(fund.id) ?? Infinity));
    replacements.set(firstIndex, canonical);
    for (const fund of candidates) {
      removed.add(fund.id);
      if (fund.id !== canonical.id) {
        aliases[fund.id] = canonical.id;
      }
    }
  }

  return {
    reserves: reserves.flatMap((fund, index) => {
      const replacement = replacements.get(index);
      if (replacement) return [replacement];
      if (removed.has(fund.id)) return [];
      return [fund];
    }),
    aliases,
  };
}

/** Merge duplicate ids and keep the reserve allocation within the 100% cap. */
export function normalizeReserveSplits(splits: ReserveSplit[] | undefined): ReserveSplit[] | undefined {
  if (!splits?.length) return undefined;
  const merged = new Map<string, number>();
  for (const split of splits) {
    if (!split || typeof split.fundId !== "string" || !split.fundId || !Number.isFinite(split.pct)) continue;
    const pct = Math.max(0, split.pct);
    if (pct <= 0) continue;
    merged.set(split.fundId, (merged.get(split.fundId) ?? 0) + pct);
  }
  const entries = [...merged.entries()];
  if (!entries.length) return undefined;
  const total = entries.reduce((sum, [, pct]) => sum + pct, 0);
  if (total <= 100) {
    const rounded = entries.map(([fundId, pct]) => ({ fundId, pct: round2(pct) }));
    const roundedTotal = rounded.reduce((sum, split) => sum + split.pct, 0);
    if (roundedTotal <= 100) return rounded;
    const head = rounded.slice(0, -1);
    const tailPct = round2(Math.max(0, 100 - head.reduce((sum, split) => sum + split.pct, 0)));
    return [...head, { ...rounded[rounded.length - 1], pct: tailPct }].filter((split) => split.pct > 0);
  }

  // Preserve each fund's relative claim while making the total exactly 100.
  const scaled = entries.map(([fundId, pct]) => ({ fundId, pct: round2((pct / total) * 100) }));
  const diff = round2(100 - scaled.reduce((sum, split) => sum + split.pct, 0));
  const last = scaled.length - 1;
  scaled[last] = { ...scaled[last], pct: round2(Math.max(0, scaled[last].pct + diff)) };
  return scaled.filter((split) => split.pct > 0);
}

export function normalizeTransactionReserveSplits<T extends { reserveSplits?: ReserveSplit[] }>(transaction: T): T {
  if (!transaction.reserveSplits?.length) return transaction;
  const reserveSplits = normalizeReserveSplits(transaction.reserveSplits);
  return reserveSplits ? { ...transaction, reserveSplits } : { ...transaction, reserveSplits: undefined };
}

/** Normalize split shape, rewrite collapsed-fund ids, and drop missing funds. */
export function normalizeTransactionReserveSplitsForFunds<T extends { reserveSplits?: ReserveSplit[] }>(
  transaction: T,
  aliases: Readonly<Record<string, string>> = {},
  liveFundIds?: ReadonlySet<string>,
): T {
  if (!transaction.reserveSplits?.length) return transaction;
  const rewritten = transaction.reserveSplits
    .filter((split) => Boolean(split) && typeof split.fundId === "string")
    .map((split) => ({
      ...split,
      fundId: aliases[split.fundId] ?? split.fundId,
    })).filter((split) => !liveFundIds || liveFundIds.has(split.fundId));
  return normalizeTransactionReserveSplits({ ...transaction, reserveSplits: rewritten });
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
