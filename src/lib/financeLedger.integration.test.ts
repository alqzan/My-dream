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

  it("keeps an unowned settlement as a blocking review issue", () => {
    useAppStore.setState({ reserves: [reserve(10000)] });
    useAppStore.getState().addCardSettlement({
      id: "unowned-settlement", cardId: "other-bank:card:7777", amount: 500, date: "2026-01-02",
    });
    const ledger = creditLedgerForState(useAppStore.getState());
    expect(ledger.issues.some((issue) => issue.code === "unknown_card")).toBe(true);
    expect(holdings({ ...useAppStore.getState(), dailyBudget: null, creditLedger: ledger }).blockedByExcess).toBe(true);
    expect(useAppStore.getState().recordReconcile(10000)).toBeNull();
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

  it("deposits an opted-in cashback source once and keeps bank cash unchanged", () => {
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
    expect(holdings({ ...state, dailyBudget: null, creditLedger: ledger, cashbackEnabled: true, cashbackEnvelopeId: "surplus" }).expected).toBe(10000);
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
});
