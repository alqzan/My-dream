import { describe, expect, it } from "vitest";
import type { Account, InboxEventRecord, ObservedBalance, Transaction } from "./types";
import {
  detectRecurringMerchants,
  findSelfTransferCandidates,
  financeSignals,
  proposeSalary,
  type SalaryEventInput,
  type TransferEventInput,
} from "./bankIntelligence";

function transaction(id: string, date: string, amount: number, note: string, extra: Partial<Transaction> = {}): Transaction {
  return { id, date, amount, category: "cat-essentials", note, ...extra };
}

function account(id: string, bank: string, last4: string, kind: Account["kind"], isOwn: boolean): Account {
  return { id, bank, last4, kind, fundingKind: kind === "card" ? "credit" : "debit", isOwn, firstSeen: "2026-01-01", lastSeen: "2026-09-20" };
}

function salaryEvent(id: string, date: string, amount: number, extra: Partial<SalaryEventInput> = {}): SalaryEventInput {
  return { id, date, amount, direction: "in", payer: "Employer Prime", ...extra };
}

function declinedInbox(id: string, date: string, sourceReceivedAt?: string): InboxEventRecord {
  return { id, eventId: `${id}-event`, rawText: "declined", kind: "declined", direction: "neutral", amount: 0, category: "cat-essentials", note: "declined", date, sourceReceivedAt };
}

describe("findSelfTransferCandidates", () => {
  it("pairs owner-evidenced legs once and exposes the fee as cents-safe currency", () => {
    const events: TransferEventInput[] = [
      { id: "out-1", amount: 600, at: 1_000_000, direction: "out", counterparty: "Reserve Wallet" },
      { id: "in-1", amount: 600.006, at: 1_000_000 + 60_000, direction: "in", counterparty: "Reserve Wallet", fee: 1.25 },
      { id: "orphan", amount: 200, at: 2_000_000, direction: "out", counterparty: "Unknown merchant" },
    ];
    const result = findSelfTransferCandidates(events, { wallets: ["Reserve Wallet"] });

    expect(result.pairs).toEqual([["out-1", "in-1"]]);
    expect(result.unmatched).toEqual(["orphan"]);
    expect(result.fees).toEqual([{ id: "in-1", amount: 1.25 }]);
  });

  it("keeps amount/time-only legs unmatched and ambiguous one-to-many matches in review", () => {
    const events: TransferEventInput[] = [
      { id: "owner-out", amount: 90, at: 3_000_000, direction: "out", counterparty: "Reserve Wallet" },
      { id: "unowned-in", amount: 90, at: 3_000_010, direction: "in", counterparty: "Other Person" },
      { id: "local-out", amount: 50, at: 3_100_000, direction: "out", accountId: "own-a", counterparty: "External Person" },
      { id: "local-in", amount: 50, at: 3_100_010, direction: "in", accountId: "own-b", counterparty: "External Company" },
      { id: "ambiguous-out", amount: 300, at: 4_000_000, direction: "out", counterparty: "Reserve Wallet" },
      { id: "ambiguous-in-1", amount: 300, at: 4_000_010, direction: "in", counterparty: "Reserve Wallet" },
      { id: "ambiguous-in-2", amount: 300, at: 4_000_020, direction: "in", counterparty: "Reserve Wallet" },
    ];
    const result = findSelfTransferCandidates(events, { wallets: ["Reserve Wallet"], accounts: ["own-a", "own-b"] });

    expect(result.pairs).toEqual([]);
    expect(result.unmatched).toEqual(["owner-out", "unowned-in", "local-out", "local-in"]);
    expect(new Set(result.ambiguous)).toEqual(new Set(["ambiguous-out", "ambiguous-in-1", "ambiguous-in-2"]));
  });
});

describe("proposeSalary", () => {
  it("matches an alias only after three confirmed account/day/amount entries", () => {
    const candidate = salaryEvent("candidate", "2026-09-26", 1810, { payer: "6677656", accountId: "cash-main" });
    const uncertain = salaryEvent("uncertain", "2026-09-10", 5000, { payer: "EMP-ALIAS", accountId: "other-account" });
    const events: SalaryEventInput[] = [
      salaryEvent("h-1", "2026-06-26", 1800, { payer: "6677656", accountId: "cash-main", confirmedSalary: true }),
      salaryEvent("h-2", "2026-07-25", 1815, { accountId: "cash-main", confirmedSalary: true }),
      salaryEvent("h-3", "2026-08-26", 1790, { payer: "6677656", accountId: "cash-main", confirmedSalary: true }),
      salaryEvent("future", "2026-10-26", 9000, { payer: "6677656", accountId: "cash-main", confirmedSalary: true }),
      candidate,
      uncertain,
      salaryEvent("unknown", "2026-09-25", 1800, { payer: "Unlisted sender", accountId: "cash-main" }),
    ];
    const proposals = proposeSalary({
      events,
      salaryPayers: ["6677656", "Employer Prime"],
      payerAliases: { "EMP-ALIAS": "Employer Prime", "6677656": "Employer Prime" },
      salaryDay: 25,
      ownerAccountIds: ["cash-main"],
    });

    expect(proposals).toHaveLength(2);
    expect(proposals.find((proposal) => proposal.eventId === "candidate")).toMatchObject({
      status: "matched",
      kind: "salary",
      confidence: "template",
      canonicalPayer: "Employer Prime",
      accountId: "cash-main",
    });
    expect(proposals.find((proposal) => proposal.eventId === "uncertain")).toMatchObject({ status: "needs_choice", kind: "needs_choice", confidence: "generic" });
    expect(candidate.kind).toBeUndefined();
  });
});

describe("detectRecurringMerchants", () => {
  it("requires three similar cash-out amounts and two monthly intervals", () => {
    const rows = [
      ...["03", "04", "05", "06", "07", "08", "09"].map((month, index) => transaction(`cloud-${month}`, `2026-${month}-19`, 30 + (index % 2 ? 0.5 : -0.5), "Cloud Box", { kind: "purchase", direction: "out" })),
      transaction("two-1", "2026-06-03", 12, "Only Two", { kind: "purchase", direction: "out" }),
      transaction("two-2", "2026-07-03", 12, "Only Two", { kind: "purchase", direction: "out" }),
      transaction("random-1", "2026-06-04", 10, "Variable Box", { kind: "purchase", direction: "out" }),
      transaction("random-2", "2026-07-04", 13, "Variable Box", { kind: "purchase", direction: "out" }),
      transaction("random-3", "2026-08-04", 17, "Variable Box", { kind: "purchase", direction: "out" }),
    ];
    const guesses = detectRecurringMerchants(rows);

    expect(guesses).toHaveLength(1);
    expect(guesses[0]).toMatchObject({ merchant: "cloud box", avgAmount: 29.93, everyDays: 30.67, occurrences: 7, lastSeen: "2026-09-19", nextExpected: "2026-10-19", confidence: "high" });
  });
});

describe("financeSignals", () => {
  it("counts current-cycle declines, ranks cash-out merchants, and sums only latest own cash", () => {
    const transactions = [
      transaction("coffee-1", "2026-09-03", 12, "Coffee", { kind: "purchase", direction: "out" }),
      transaction("coffee-2", "2026-09-05", 18, "Coffee", { kind: "purchase", direction: "out" }),
      transaction("latest", "2026-09-20", 20, "Late Shop", { kind: "purchase", direction: "out", time: "18:00" }),
      transaction("old", "2026-08-31", 500, "Old Shop", { kind: "purchase", direction: "out" }),
      transaction("declined", "2026-09-10", 99, "Declined", { kind: "declined", direction: "out" }),
      transaction("incoming", "2026-09-11", 400, "Coffee", { kind: "transfer_in", direction: "in" }),
      transaction("salary", "2026-09-15", 3000, "Employer", { kind: "salary", direction: "in" }),
      transaction("old-statement", "2026-08-01", 0, "Statement", { kind: "statement", direction: "neutral", sourceReceivedAt: "2026-09-21T10:00:00.000Z" }),
    ];
    const accounts = [
      account("cash-main", "Main Bank", "1111", "account", true),
      account("cash-secondary", "Second Bank", "1111", "account", true),
      account("credit-card", "Main Bank", "2222", "card", true),
      account("owner-wallet", "Wallet Bank", "3333", "wallet", true),
      account("other-account", "Other Bank", "4444", "account", false),
    ];
    const observedBalances: ObservedBalance[] = [
      { id: "old-main", account: "cash-main", balance: 900, balanceKind: "cash", observedAt: "2026-09-19T08:00:00Z" },
      { id: "new-main", account: "cash-main", balance: 1000, balanceKind: "cash", observedAt: "2026-09-20T08:00:00Z" },
      { id: "credit", cardLast4: "2222", balance: 7000, balanceKind: "credit_available", observedAt: "2026-09-20T08:00:00Z" },
      { id: "wallet", account: "owner-wallet", balance: 500, balanceKind: "cash", observedAt: "2026-09-20T08:00:00Z" },
      { id: "foreign", account: "other-account", balance: 800, balanceKind: "cash", observedAt: "2026-09-20T08:00:00Z" },
      { id: "ambiguous-last4", account: "1111", balance: 700, balanceKind: "cash", observedAt: "2026-09-22T08:00:00Z" },
      { id: "unknown", account: "cash-main", balance: 700, balanceKind: "unknown", observedAt: "2026-09-21T08:00:00Z" },
    ];
    const result = financeSignals({
      transactions,
      inboxEvents: [declinedInbox("declined-inbox", "2026-09-12", "2026-09-22T10:00:00.000Z")],
      observedBalances,
      accounts,
      cycleStart: "2026-09-01",
      today: "2026-09-23",
      freshnessDays: 2,
    });

    expect(result.declinedCount).toBe(2);
    expect(result.lastReceiptDate).toBe("2026-09-22");
    expect(result.lastReceiptAt).toBe("2026-09-22T10:00:00.000Z");
    expect(result.daysSinceLastReceipt).toBe(1);
    expect(result.receiptFresh).toBe(true);
    expect(result.merchantFrequency).toEqual([
      { merchant: "coffee", count: 2, totalAmount: 30 },
      { merchant: "late shop", count: 1, totalAmount: 20 },
    ]);
    expect(result.observedCashByAccount).toEqual({ "cash-main": 1000 });
    expect(result.observedCashSum).toBe(1000);

    expect(financeSignals({ transactions, inboxEvents: [declinedInbox("declined-inbox", "2026-09-12", "2026-09-22T10:00:00.000Z")], cycleStart: "2026-09-01", today: "2026-09-30", freshnessDays: 7 }).receiptFresh).toBe(false);
  });
});
