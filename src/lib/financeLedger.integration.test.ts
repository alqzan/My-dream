import { beforeEach, describe, expect, it, vi } from "vitest";

const idb = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (key: string) => idb.get(key),
  set: async (key: string, value: unknown) => { idb.set(key, value); },
  del: async (key: string) => { idb.delete(key); },
}));

import { useAppStore } from "./store";
import { creditLedgerForState } from "./financeLedger";
import { holdings } from "./reconcile";
import type { Account, CardSettlement, Transaction } from "./types";

const initial = useAppStore.getState().snapshot();
const card: Account = {
  id: "bank:card:1234", bank: "bank", last4: "1234", kind: "card", fundingKind: "credit",
  isOwn: true, firstSeen: "2026-01-01", lastSeen: "2026-01-01",
};
const purchase = (amount: number, date = "2026-01-01"): Transaction => ({
  id: "charge-1", eventId: "charge-1", date, amount, category: "cat-essentials", note: "شراء",
  kind: "purchase", direction: "out", accountId: card.id, reserveSplits: [{ fundId: "surplus", pct: 100 }],
});
const payment = (amount: number, date = "2026-01-02"): CardSettlement => ({
  id: `settle-${amount}`, eventId: `settle-${amount}`, cardId: card.id, amount, date,
});
const reserve = (amount: number) => ({
  id: "surplus", name: "الفوائض", icon: "✨", color: "#c9852a", createdAt: "2026-01-01",
  deposits: [{ id: "opening", date: "2026-01-01", amount }],
});

beforeEach(() => {
  useAppStore.getState().hydrate({
    ...initial,
    transactions: [], reserves: [], dailyBudget: null, reconciles: [], deleted: {},
    accounts: [card], settlements: [], settlementResolutions: [],
  });
});

describe("credit ledger integration", () => {
  it("keeps a partial payment in chronological unpaid charges and expected cash", () => {
    const tx = purchase(1000);
    useAppStore.setState({ transactions: [tx], reserves: [reserve(10000)] });
    useAppStore.getState().addCardSettlement(payment(400));

    const ledger = creditLedgerForState(useAppStore.getState());
    expect(ledger.unsettledRecordedCharges).toBe(600);
    expect(ledger.excessSettlement).toBe(0);
    expect(holdings({ ...useAppStore.getState(), dailyBudget: null, creditLedger: ledger }).expected).toBe(9600);
    expect(useAppStore.getState().recordReconcile(9600)?.delta).toBe(0);
  });

  it("blocks reconciliation while an unexplained payment remains excess", () => {
    useAppStore.setState({ reserves: [reserve(10000)] });
    useAppStore.getState().addCardSettlement(payment(500));
    const before = useAppStore.getState().snapshot();

    expect(useAppStore.getState().recordReconcile(9500)).toBeNull();
    expect(useAppStore.getState().reserves[0].deposits).toHaveLength(1);
    expect(useAppStore.getState().reconciles).toHaveLength(0);
    expect(useAppStore.getState().snapshot().lastUpdated).toBe(before.lastUpdated);
  });

  it("posts an opening-debt debit once and keeps later purchases unpaid", () => {
    useAppStore.setState({ reserves: [reserve(10000)] });
    useAppStore.getState().addCardSettlement(payment(2000));
    const settlementId = useAppStore.getState().settlements[0].id;
    useAppStore.getState().resolveSettlement({
      id: "opening-debt-1", cardId: card.id, kind: "opening_debt", amount: 2000,
      date: "2026-01-03", settlementIds: [settlementId], note: "دين قبل التسجيل",
    });
    useAppStore.getState().resolveSettlement({
      id: "opening-debt-1", cardId: card.id, kind: "opening_debt", amount: 2000,
      date: "2026-01-03", settlementIds: [settlementId], note: "دين قبل التسجيل",
    });
    useAppStore.setState({ transactions: [purchase(500, "2026-01-04"), ...useAppStore.getState().transactions] });

    const state = useAppStore.getState();
    const ledger = creditLedgerForState(state);
    expect(state.transactions.filter((tx) => tx.kind === "opening_debt")).toHaveLength(1);
    expect(ledger.unsettledRecordedCharges).toBe(500);
    expect(ledger.excessSettlement).toBe(0);
    expect(holdings({ ...state, dailyBudget: null, creditLedger: ledger }).expected).toBe(8000);
  });

  it("does not let an old excess payment fund a later new purchase", () => {
    useAppStore.setState({ reserves: [reserve(10000)] });
    useAppStore.getState().addCardSettlement(payment(500, "2026-01-02"));
    useAppStore.setState({ transactions: [purchase(300, "2026-01-03")] });
    const ledger = creditLedgerForState(useAppStore.getState());
    expect(ledger.unsettledRecordedCharges).toBe(300);
    expect(ledger.excessSettlement).toBe(500);
  });

  it("keeps a settlement on a card not proven credit as a non-blocking review warning", () => {
    // Outside the proven credit catalogue the ledger owns nothing: the
    // payment is ordinary cash out, and the typed number absorbs it. It stays
    // visible as a warning; it must not lock the reconciliation.
    useAppStore.setState({ reserves: [reserve(10000)] });
    useAppStore.getState().addCardSettlement({
      id: "unowned-settlement", cardId: "other-bank:card:7777", amount: 500, date: "2026-01-02",
    });
    const ledger = creditLedgerForState(useAppStore.getState());
    expect(ledger.issues.find((issue) => issue.code === "unknown_card")?.severity).toBe("warning");
    expect(ledger.blockingIssues).toEqual([]);
    expect(holdings({ ...useAppStore.getState(), dailyBudget: null, creditLedger: ledger }).blockedByExcess).toBe(false);
    expect(useAppStore.getState().recordReconcile(9500)?.delta).toBe(-500);
  });

  it("rejects an overallocated resolution before writing its debit", () => {
    useAppStore.getState().addCardSettlement(payment(100));
    const settlementId = useAppStore.getState().settlements[0].id;
    useAppStore.getState().resolveSettlement({
      id: "too-large", cardId: card.id, kind: "opening_debt", amount: 101,
      date: "2026-01-03", settlementIds: [settlementId],
    });
    expect(useAppStore.getState().settlementResolutions).toHaveLength(0);
    expect(useAppStore.getState().transactions).toHaveLength(0);
  });

  it("links a missed expense to an existing charge without a second debit", () => {
    useAppStore.setState({ transactions: [purchase(500)], reserves: [reserve(10000)] });
    useAppStore.getState().addCardSettlement(payment(500));
    const settlementId = useAppStore.getState().settlements[0].id;
    useAppStore.getState().resolveSettlement({
      id: "missed-linked", cardId: card.id, kind: "missed_expense", amount: 500,
      date: "2026-01-03", settlementIds: [settlementId], appliedToEventIds: ["charge-1"],
    });
    const state = useAppStore.getState();
    expect(state.transactions.filter((tx) => tx.kind === "missed_expense")).toHaveLength(0);
    expect(creditLedgerForState(state).unsettledRecordedCharges).toBe(0);
  });

  it("deposits an opted-in wallet cashback once and counts it once (wallets are in the typed number)", () => {
    useAppStore.setState({
      reserves: [reserve(10000)],
      cashbackEnabled: true,
      cashbackEnvelopeId: "surplus",
    });
    const cashback = {
      id: "cashback-event", eventId: "cashback-event", rawText: "استرداد نقدي إلى المحفظة 100", amount: 100,
      expenseAmount: 0, kind: "cashback" as const, direction: "in" as const, category: "cat-essentials",
      note: "استرداد نقدي", date: "2026-01-04", confidence: "template" as const,
      bank: "bank", account: "0001", accountId: "bank:wallet:0001",
    };
    useAppStore.getState().confirmInboxEvent(cashback);
    useAppStore.getState().confirmInboxEvent(cashback);
    const state = useAppStore.getState();
    expect(state.reserves[0].deposits.filter((deposit) => deposit.id === "cashback-event:cashback")).toHaveLength(1);
    const ledger = creditLedgerForState(state);
    const view = holdings({ ...state, dailyBudget: null, creditLedger: ledger, cashbackEnabled: true, cashbackEnvelopeId: "surplus" });
    // Bank 10000 + wallet 100: the envelope already holds the 100, and the
    // screen asks for wallets in the number — subtracting it again was a
    // second count. A wallet cashback never touched a card either, so it
    // raises no ledger issue at all.
    expect(view.expected).toBe(10100);
    expect(ledger.issues).toEqual([]);
    expect(view.blockedByExcess).toBe(false);
    expect(useAppStore.getState().recordReconcile(10100)?.delta).toBe(0);
  });

  it("keeps a person-bank reimbursement in current holdings without settling card debt", () => {
    const refund: Transaction = {
      id: "person-refund", eventId: "person-refund", date: "2026-01-03", amount: 300,
      category: "cat-essentials", note: "تعويض", kind: "refund", direction: "in",
      accountId: "bank:account:9999", refundDestination: "person_bank",
    };
    const charge = purchase(1000);
    useAppStore.setState({ transactions: [refund, charge], reserves: [reserve(10000)] });
    const state = useAppStore.getState();
    const ledger = creditLedgerForState(state);
    const view = holdings({ ...state, dailyBudget: null, creditLedger: ledger });
    expect(ledger.unsettledRecordedCharges).toBe(1000);
    expect(view.bankReimbursements).toBe(300);
    expect(view.expected).toBe(10300);
  });

  it("returns a merchant refund to cash while reducing unpaid credit", () => {
    const refund: Transaction = {
      id: "merchant-refund", eventId: "merchant-refund", date: "2026-01-03", amount: 300,
      category: "cat-essentials", note: "استرجاع", kind: "refund", direction: "in",
      accountId: card.id, refundDestination: "merchant_card",
    };
    useAppStore.setState({ transactions: [refund, purchase(1000)], reserves: [reserve(10000)] });
    const state = useAppStore.getState();
    const ledger = creditLedgerForState(state);
    const view = holdings({ ...state, dailyBudget: null, creditLedger: ledger });
    expect(ledger.unsettledRecordedCharges).toBe(700);
    expect(view.merchantCardRefunds).toBe(300);
    expect(view.expected).toBe(10000);
  });

  it("keeps unused merchant-card refund as prepaid credit after a fully paid charge", () => {
    const refund: Transaction = {
      id: "paid-refund", eventId: "paid-refund", date: "2026-01-04", amount: 300,
      category: "cat-essentials", note: "استرجاع", kind: "refund", direction: "in",
      accountId: card.id, refundDestination: "merchant_card",
    };
    useAppStore.setState({ transactions: [refund, purchase(1000)], reserves: [reserve(10000)] });
    useAppStore.getState().addCardSettlement(payment(1000, "2026-01-02"));
    const state = useAppStore.getState();
    const ledger = creditLedgerForState(state);
    const view = holdings({ ...state, dailyBudget: null, creditLedger: ledger });
    expect(ledger.unsettledRecordedCharges).toBe(0);
    expect(ledger.prepaidCredit).toBe(300);
    expect(view.expected).toBe(9000);
  });

  it("blocks an unclassified refund before it changes holdings", () => {
    const refund: Transaction = {
      id: "unknown-refund", eventId: "unknown-refund", date: "2026-01-03", amount: 300,
      category: "cat-essentials", note: "استرجاع", kind: "refund", direction: "in",
      accountId: card.id,
    };
    useAppStore.setState({ transactions: [refund, purchase(1000)], reserves: [reserve(10000)] });
    const state = useAppStore.getState();
    const ledger = creditLedgerForState(state);
    expect(ledger.issues.some((issue) => issue.code === "refund_destination_required" || issue.code === "refund_destination_unknown")).toBe(true);
    expect(holdings({ ...state, dailyBudget: null, creditLedger: ledger }).blockedByExcess).toBe(true);
    expect(state.recordReconcile(10000)).toBeNull();
  });

  it("counts a refund routed back to its envelope once: 1000 → 1000 → 1000", () => {
    // Envelope 1000; a 300 card purchase routed 100% to it; a linked 300
    // merchant-card refund carrying the same split. `reserveShare` already
    // returns the refund to the envelope — adding it again read 1300.
    useAppStore.setState({ reserves: [reserve(1000)] });
    const view = () => {
      const state = useAppStore.getState();
      return holdings({ ...state, dailyBudget: null, creditLedger: creditLedgerForState(state) });
    };
    expect(view().expected).toBe(1000);

    useAppStore.setState({ transactions: [purchase(300)] });
    expect(view().envelopesTotal).toBe(700);
    expect(view().creditUnpaid).toBe(300);
    expect(view().expected).toBe(1000);

    const refund: Transaction = {
      id: "routed-refund", eventId: "routed-refund", date: "2026-01-03", amount: 300,
      category: "cat-essentials", note: "استرجاع", kind: "refund", direction: "in",
      accountId: card.id, refundDestination: "merchant_card", linkedTransactionId: "charge-1",
      reserveSplits: [{ fundId: "surplus", pct: 100 }],
    };
    useAppStore.setState({ transactions: [refund, ...useAppStore.getState().transactions] });
    const after = view();
    expect(after.envelopesTotal).toBe(1000);
    expect(after.creditUnpaid).toBe(0);
    expect(after.merchantCardRefunds).toBe(0);
    expect(after.expected).toBe(1000);
    expect(after.blockedByExcess).toBe(false);
    expect(useAppStore.getState().recordReconcile(1000)?.delta).toBe(0);
  });

  it("does not count a merchant-card refund the ledger rejected", () => {
    // A refund dated before its charge reduced no liability: counting it as
    // restored cash would invent money. It blocks, and shows why.
    const refund: Transaction = {
      id: "early-refund", eventId: "early-refund", date: "2025-12-31", amount: 300,
      category: "cat-essentials", note: "استرجاع", kind: "refund", direction: "in",
      accountId: card.id, refundDestination: "merchant_card", linkedTransactionId: "charge-1",
    };
    useAppStore.setState({ transactions: [refund, purchase(1000)], reserves: [reserve(10000)] });
    const state = useAppStore.getState();
    const ledger = creditLedgerForState(state);
    const view = holdings({ ...state, dailyBudget: null, creditLedger: ledger });
    expect(ledger.rejectedCardRefundIds).toEqual(["early-refund"]);
    expect(ledger.unsettledRecordedCharges).toBe(1000);
    expect(view.merchantCardRefunds).toBe(0);
    expect(view.expected).toBe(10000);
    expect(view.blockingIssues.map((issue) => issue.code)).toEqual(["refund_before_charge"]);
    expect(view.blockedByExcess).toBe(true);
  });

  it("counts a refund to a debit card as cash without a ledger issue", () => {
    const debit: Account = { ...card, id: "bank:card:5555", last4: "5555", fundingKind: "debit" };
    const refund: Transaction = {
      id: "debit-refund", eventId: "debit-refund", date: "2026-01-03", amount: 50,
      category: "cat-essentials", note: "استرجاع", kind: "refund", direction: "in",
      accountId: debit.id, refundDestination: "merchant_card",
    };
    useAppStore.setState({ accounts: [card, debit], transactions: [refund], reserves: [reserve(10000)] });
    const state = useAppStore.getState();
    const ledger = creditLedgerForState(state);
    const view = holdings({ ...state, dailyBudget: null, creditLedger: ledger });
    expect(ledger.issues).toEqual([]);
    expect(view.merchantCardRefunds).toBe(50);
    expect(view.expected).toBe(10050);
    expect(view.blockedByExcess).toBe(false);
  });

  it("does not stay locked by a same-day order once both charges are fully paid", () => {
    // Charge A (Jan 1) and charge B on the settlement's own day with no time.
    // The Jan 2 payment covers A exactly; B is paid on Jan 3. Nothing is
    // unexplained, so no warning survives and nothing blocks.
    const chargeA = { ...purchase(500, "2026-01-01"), id: "charge-a", eventId: "charge-a" };
    const chargeB = { ...purchase(300, "2026-01-02"), id: "charge-b", eventId: "charge-b" };
    useAppStore.setState({ transactions: [chargeA, chargeB], reserves: [reserve(10000)] });
    useAppStore.getState().addCardSettlement(payment(500, "2026-01-02"));
    useAppStore.getState().addCardSettlement(payment(300, "2026-01-03"));
    const state = useAppStore.getState();
    const ledger = creditLedgerForState(state);
    expect(ledger.unsettledRecordedCharges).toBe(0);
    expect(ledger.excessSettlement).toBe(0);
    expect(ledger.issues.some((issue) => issue.code === "ambiguous_chronology")).toBe(false);
    expect(holdings({ ...state, dailyBudget: null, creditLedger: ledger }).blockedByExcess).toBe(false);
    expect(useAppStore.getState().recordReconcile(9200)?.delta).toBe(0);
  });

  it("never blocks on purchases outside the proven credit catalogue", () => {
    // An auto-discovered card whose funding is still unknown, and a purchase
    // with no card digits at all: both are reviewable warnings, not errors.
    const unknownFunding: Account = { ...card, id: "bank:card:8888", last4: "8888", fundingKind: "unknown" };
    const onUnknownCard: Transaction = {
      id: "unknown-card-buy", eventId: "unknown-card-buy", date: "2026-01-02", amount: 120,
      category: "cat-essentials", note: "شراء", kind: "purchase", direction: "out", accountId: unknownFunding.id,
    };
    const noCard: Transaction = {
      id: "no-card-buy", eventId: "no-card-buy", date: "2026-01-02", amount: 80,
      category: "cat-essentials", note: "شراء", kind: "purchase", direction: "out",
    };
    useAppStore.setState({ accounts: [card, unknownFunding], transactions: [onUnknownCard, noCard], reserves: [reserve(10000)] });
    const state = useAppStore.getState();
    const ledger = creditLedgerForState(state);
    expect(ledger.issues.length).toBeGreaterThan(0);
    expect(ledger.issues.every((issue) => issue.severity === "warning")).toBe(true);
    expect(ledger.blockingIssues).toEqual([]);
    expect(holdings({ ...state, dailyBudget: null, creditLedger: ledger }).blockedByExcess).toBe(false);
    expect(useAppStore.getState().recordReconcile(10000)).not.toBeNull();
  });

  it("shows every term of the total as its own row, so the rows add up", () => {
    const personRefund: Transaction = {
      id: "person-refund", eventId: "person-refund", date: "2026-01-03", amount: 40,
      category: "cat-essentials", note: "تعويض", kind: "refund", direction: "in",
      accountId: "bank:account:9999", refundDestination: "person_bank",
    };
    const cardRefund: Transaction = {
      id: "card-refund", eventId: "card-refund", date: "2026-01-04", amount: 300,
      category: "cat-essentials", note: "استرجاع", kind: "refund", direction: "in",
      accountId: card.id, refundDestination: "merchant_card", linkedTransactionId: "charge-1",
    };
    // charge-1 is paid in full before its refund, so the refund becomes card
    // credit; charge-2 predates that credit and stays unpaid.
    const unrouted = { ...purchase(1000), reserveSplits: undefined };
    const later = { ...purchase(200, "2026-01-03"), id: "charge-2", eventId: "charge-2", reserveSplits: undefined };
    useAppStore.setState({ transactions: [personRefund, cardRefund, unrouted, later], reserves: [reserve(10000)] });
    useAppStore.getState().addCardSettlement(payment(1000, "2026-01-02"));
    const state = useAppStore.getState();
    const view = holdings({ ...state, dailyBudget: null, creditLedger: creditLedgerForState(state) });
    expect(view.adjustments.map((row) => row.key).sort()).toEqual(
      ["bankReimbursements", "creditUnpaid", "merchantCardRefunds", "prepaidCredit"].sort(),
    );
    const rows = view.envelopesTotal + view.cycleBalance + view.adjustments.reduce((sum, row) => sum + row.amount, 0);
    expect(rows).toBeCloseTo(view.expected, 2);
    expect(view.adjustments.every((row) => row.amount !== 0)).toBe(true);
  });
});
