import { beforeEach, describe, expect, it, vi } from "vitest";

const idb = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (key: string) => idb.get(key),
  set: async (key: string, value: unknown) => { idb.set(key, value); },
  del: async (key: string) => { idb.delete(key); },
}));

import { parseBankSmsBulk, type SmsParseEventResult } from "./bankParser";
import { useAppStore } from "./store";
import { mergeAppData } from "./merge";
import { cashOut, computeDailyBudgetStatus, today } from "./utils";

const initial = useAppStore.getState().snapshot();
const text = "شراء عبر نقاط البيع\nبطاقة: 7312\nمبلغ: SAR 37.50\nلدى: TEST GROCER";
const event = (id: string, receivedAt = "2026-08-15T09:00:00+03:00"): SmsParseEventResult => ({
  ...parseBankSmsBulk(text, "2026-09-20", {
    sourceInboxId: id, sender: "AlRajhiBank", receivedAt,
  }).events[0],
  confidence: "template",
});

beforeEach(() => {
  useAppStore.getState().hydrate({
    ...initial,
    transactions: [], deleted: {}, reserves: [], dailyBudget: null,
    obligations: [], observedBalances: [], settlements: [], settlementResolutions: [],
    inboxDecisions: [],
    accounts: [{
      id: "rajhi:card:7312", bank: "rajhi", last4: "7312", kind: "card",
      fundingKind: "debit", isOwn: true, firstSeen: "2026-08-01", lastSeen: "2026-08-01",
    }],
  });
});

describe("independent acceptance through the bank import boundary", () => {
  it("preserves one source event across retries, merchant correction, and device merge", () => {
    const receipt = event("same-inbox-document");
    const beforeImport = useAppStore.getState().snapshot();
    useAppStore.getState().importInboxEvents([receipt]);
    useAppStore.getState().updateTransaction("same-inbox-document:0", { note: "Corrected merchant" });
    useAppStore.getState().importInboxEvents([receipt]);
    expect(useAppStore.getState().transactions).toHaveLength(1);
    const deviceA = useAppStore.getState().snapshot();
    expect(deviceA.transactions[0].id).toBe("same-inbox-document:0");
    expect(deviceA.transactions[0].note).toBe("Corrected merchant");
    useAppStore.getState().hydrate(beforeImport);
    useAppStore.getState().importInboxEvents([receipt]);
    expect(mergeAppData(deviceA, useAppStore.getState().snapshot()).transactions).toHaveLength(1);
  });

  it("does not apply a suspected shortcut resend before its review decision", () => {
    useAppStore.getState().importInboxEvents([event("first")]);
    useAppStore.getState().importInboxEvents([event("retry", "2026-08-15T09:00:30+03:00")]);
    expect(useAppStore.getState().transactions).toHaveLength(1);
    expect(useAppStore.getState().inboxDecisions?.find((d) => d.eventId === "retry:0")?.decision).toBe("review");
  });

  it("leaves both ambiguous same-time source documents pending when they arrive together", () => {
    useAppStore.getState().importInboxEvents([event("ambiguous-a"), event("ambiguous-b")]);
    expect(useAppStore.getState().transactions).toHaveLength(0);
    expect(useAppStore.getState().inboxDecisions?.filter((decision) => decision.decision === "review")).toHaveLength(2);
  });

  it("keeps identical text on different days as two independent real purchases", () => {
    useAppStore.getState().importInboxEvents([
      event("yesterday", "2026-08-14T09:00:00+03:00"),
      event("today", "2026-08-15T09:00:00+03:00"),
    ]);
    const state = useAppStore.getState();
    expect(state.transactions).toHaveLength(2);
    expect(state.transactions.map((t) => t.id).sort()).toEqual(["today:0", "yesterday:0"]);
    expect(state.transactions.some((t) => t.suspectedDuplicate)).toBe(false);
  });

  it("keeps two identical purchases hours apart on the same day independent", () => {
    useAppStore.getState().importInboxEvents([
      event("morning", "2026-08-15T07:00:00+03:00"),
      event("evening", "2026-08-15T19:00:00+03:00"),
    ]);
    expect(useAppStore.getState().transactions).toHaveLength(2);
    expect(useAppStore.getState().inboxDecisions?.filter((d) => d.decision === "review")).toHaveLength(0);
  });

  it("merges yesterday plus today on one device with today alone on the other", () => {
    const beforeImport = useAppStore.getState().snapshot();
    useAppStore.getState().importInboxEvents([
      event("yesterday", "2026-08-14T09:00:00+03:00"),
      event("today", "2026-08-15T09:00:00+03:00"),
    ]);
    const deviceA = useAppStore.getState().snapshot();
    useAppStore.getState().hydrate(beforeImport);
    useAppStore.getState().importInboxEvents([event("today", "2026-08-15T09:00:00+03:00")]);
    const combined = mergeAppData(deviceA, useAppStore.getState().snapshot());
    expect(combined.transactions.map((t) => t.id).sort()).toEqual(["today:0", "yesterday:0"]);
    expect(combined.transactions.find((t) => t.id === "today:0")?.date).toBe("2026-08-15");
  });

  it("keeps a generic expense pending without changing recorded spending", () => {
    useAppStore.getState().importInboxEvents([{ ...event("generic"), confidence: "generic" }]);
    expect(useAppStore.getState().transactions).toHaveLength(0);
    expect(useAppStore.getState().inboxDecisions?.find((d) => d.eventId === "generic:0")?.decision).toBe("review");
  });

  it("allows a pending unknown event to be resolved later using the same source identity", () => {
    const receipt = event("needs-review");
    useAppStore.getState().importInboxEvents([{ ...receipt, kind: "unknown", confidence: "generic" }]);
    expect(useAppStore.getState().transactions).toHaveLength(0);
    useAppStore.getState().importInboxEvents([receipt]);
    expect(useAppStore.getState().transactions.map((t) => t.id)).toEqual(["needs-review:0"]);
  });

  it("does not discover an account mentioned only in an OTP", () => {
    const otp = parseBankSmsBulk("رمز التحقق: 123456\nبطاقة: 8246\nمبلغ: SAR 200", "2026-08-15", {
      sender: "AlRajhiBank", sourceInboxId: "otp-only", receivedAt: "2026-08-15T12:00:00+03:00",
    }).events;
    useAppStore.getState().importInboxEvents(otp);
    expect(useAppStore.getState().accounts?.some((account) => account.last4 === "8246")).toBe(false);
    expect(useAppStore.getState().transactions).toHaveLength(0);
  });

  it.each(["transfer_in", "self_transfer"] as const)("keeps %s principal out of the real spending gateway and daily budget", (kind) => {
    const date = today();
    const dailyBudget = { amount: 100, startDate: date };
    useAppStore.setState({ dailyBudget });
    useAppStore.getState().importInboxEvents([{
      ...event(`nonexpense-${kind}`), date, kind,
      direction: kind === "transfer_in" ? "in" : "neutral",
      amount: 500, expenseAmount: 0,
    }]);
    const state = useAppStore.getState();
    expect(state.transactions.reduce((sum, transaction) => sum + cashOut(transaction), 0)).toBe(0);
    expect(computeDailyBudgetStatus(dailyBudget, state.transactions).balance).toBe(100);
  });

  it("counts an explicitly confirmed external outgoing transfer as real spending", () => {
    const date = today();
    const dailyBudget = { amount: 100, startDate: date };
    useAppStore.setState({ dailyBudget });
    useAppStore.getState().confirmInboxEvent({
      ...event("external-transfer"), date, kind: "transfer_out", direction: "out",
      amount: 500, expenseAmount: 500,
    });
    const state = useAppStore.getState();
    expect(state.transactions.reduce((sum, transaction) => sum + cashOut(transaction), 0)).toBe(500);
    expect(computeDailyBudgetStatus(dailyBudget, state.transactions).balance).toBe(-400);
  });

  it.each([
    { header: "حوالة بين حساباتك", expectedSpend: 1.15 },
    { header: "حوالة محلية صادرة", expectedSpend: 501.15 },
  ])("records principal and fee correctly once for $header", ({ header, expectedSpend }) => {
    const receipt = parseBankSmsBulk(`${header}\nمبلغ: SAR 500\nمن: 7312\nالى: 8246\nرسوم: SAR 1.15`, "2026-08-15", {
      sender: "AlRajhiBank", sourceInboxId: "fee-receipt", receivedAt: "2026-08-15T12:00:00+03:00",
    }).events[0];
    useAppStore.getState().confirmInboxEvent(receipt);
    useAppStore.getState().confirmInboxEvent(receipt);
    expect(useAppStore.getState().transactions.reduce((sum, transaction) => sum + cashOut(transaction), 0)).toBeCloseTo(expectedSpend, 2);
  });
});

describe("independent receipt classification", () => {
  const parse = (rawText: string, sender: string) => parseBankSmsBulk(rawText, "2026-09-20", {
    sender, receivedAt: "2026-08-15T09:00:00+03:00", sourceInboxId: "classification-case",
  }).events;

  it("does not turn an Arabic online-purchase OTP into an expense", () => {
    const parsed = parse("رمز شراء أونلاين 123456\nلعملية بمبلغ 113 SAR\nبطاقة **8246", "Alinma");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].kind).toBe("otp");
    expect(parsed[0].amount).toBe(0);
    expect(parsed[0].expenseAmount).toBe(0);
  });

  it("recognizes an outgoing internal transfer before the general internal-transfer prefix", () => {
    const parsed = parse("حوالة داخلية صادرة\nمبلغ: SAR 300\nمن: 7312\nإلى: 8246", "AlRajhiBank");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].direction).toBe("out");
    expect(parsed[0].amount).toBe(300);
  });

  it("uses the receipt date rather than a card statement due date", () => {
    const parsed = parse("إصدار كشف حساب\nتفاصيل البطاقة **8246\nإجمالي المبلغ المستحق: SAR 311.67\nتاريخ الاستحقاق: 2026-09-25", "Alinma");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].kind).toBe("statement");
    expect(parsed[0].date).toBe("2026-08-15");
  });

  it("keeps a real self-transfer fee while excluding its principal from expense", () => {
    const parsed = parse("حوالة بين حساباتك\nمبلغ: SAR 500\nالى: 8246\nرسوم: SAR 1.15", "AlRajhiBank");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].kind).toBe("self_transfer");
    expect(parsed[0].amount).toBe(500);
    expect(parsed[0].fee).toBe(1.15);
    // Routing may create a separate fee effect; the principal is never spend.
    expect(parsed[0].expenseAmount).toBe(0);
  });
});


describe("independent persistence review", () => {
  it("keeps saving after a follow-up write leaves an empty timer drain", async () => {
    const { createDeferredStorage } = await import("./persistScheduler");
    vi.useFakeTimers();
    const writes: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const writer = createDeferredStorage({
      getItem: async () => null,
      removeItem: async () => {},
      setItem: async (_key, value) => {
        if (value === "first") await gate;
        writes.push(value);
      },
    }, { delayMs: 100 });
    try {
      await writer.setItem("state", "first");
      vi.advanceTimersByTime(100);
      await writer.setItem("state", "second");
      release();
      await vi.advanceTimersByTimeAsync(100);
      await writer.setItem("state", "third");
      await writer.flush();
      expect(writes).toEqual(["first", "second", "third"]);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});


describe("independent explicit decision review", () => {
  it("does not create a fee when an explicitly ignored transfer arrives again", () => {
    const transfer = { ...event("ignored-transfer"), kind: "self_transfer" as const,
      direction: "neutral" as const, amount: 500, expenseAmount: 0, fee: 1.15 };
    useAppStore.getState().decideInboxEvent({
      id: transfer.eventId!, eventId: transfer.eventId!, decision: "ignored",
    });
    useAppStore.getState().importInboxEvents([transfer]);
    expect(useAppStore.getState().transactions).toHaveLength(0);
  });
});


describe("independent core reconciliation acceptance", () => {
  function creditSetup() {
    useAppStore.setState({
      accounts: [{ id: "rajhi:card:7312", bank: "rajhi", last4: "7312", kind: "card", fundingKind: "credit", isOwn: true, firstSeen: "2026-08-01", lastSeen: "2026-08-15" }],
      reserves: [{ id: "held", name: "Recorded holdings", icon: "", color: "#000", deposits: [{ id: "opening", amount: 10000, date: "2026-08-01" }] }],
      dailyBudget: null,
    });
  }

  it("keeps partial repayment balanced through the actual reconcile action", () => {
    creditSetup();
    useAppStore.getState().importInboxEvents([{ ...event("credit-purchase"), amount: 1000, expenseAmount: 1000 }]);
    useAppStore.getState().updateTransaction("credit-purchase:0", { reserveSplits: [{ fundId: "held", pct: 100 }] });
    useAppStore.getState().addCardSettlement({ id: "payment", eventId: "payment", cardId: "rajhi:card:7312", amount: 400, date: "2026-08-16" });
    const result = useAppStore.getState().recordReconcile(9600);
    expect(result).not.toBeNull();
    expect(result?.expected).toBe(9600);
    expect(result?.delta).toBe(0);
  });

  it("blocks the store action while an unexplained payment of a missing purchase remains", () => {
    creditSetup();
    useAppStore.getState().addCardSettlement({ id: "unexplained", eventId: "unexplained", cardId: "rajhi:card:7312", amount: 500, date: "2026-08-16" });
    const before = useAppStore.getState().snapshot();
    expect(useAppStore.getState().recordReconcile(9500)).toBeNull();
    expect(useAppStore.getState().reserves).toEqual(before.reserves);
    expect(useAppStore.getState().reconciles).toEqual(before.reconciles);
  });
});
