import { GENERAL_FUND_NAME, SURPLUS_FUND_NAME, type ReserveFund, type ReserveSplit } from "./types";

/** Stable roles for the two system envelopes. Names are display text only. */
export type ReserveFundRole = "general" | "surplus" | "custom";

// New installations use deterministic ids. Existing ids are deliberately kept
// during migration because transactions point at them.
export const GENERAL_FUND_ID = "fund-general";
export const SURPLUS_FUND_ID = "fund-surplus";

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
 */
export function normalizeReserveFunds(reserves: ReserveFund[]): ReserveFund[] {
  const seen = new Set<"general" | "surplus">();
  return reserves.map((fund) => {
    const inferred = reserveFundRole(fund);
    const role: ReserveFundRole = inferred === "general" || inferred === "surplus"
      ? (seen.has(inferred) ? "custom" : inferred)
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

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
