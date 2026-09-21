import { describe, expect, it } from "vitest";
import { calculateCreditLedger, type CreditLedgerInput } from "./creditLedger";

const CARD_A = "card-a";
const CARD_B = "card-b";

function charge(id: string, amount: number | string, date: string, cardId = CARD_A, time?: string) {
  return { id, cardId, amount, date, ...(time ? { time } : {}) };
}

function settlement(id: string, amount: number | string, date: string, cardId = CARD_A, time?: string) {
  return { id, cardId, amount, date, ...(time ? { time } : {}) };
}

function cents(result: ReturnType<typeof calculateCreditLedger>) {
  return {
    unpaid: result.unsettledRecordedChargesCents,
    excess: result.excessSettlementCents,
    prepaid: result.prepaidCreditCents,
  };
}

describe("calculateCreditLedger — independent numerical contract", () => {
  it("case 1: records an unpaid credit charge", () => {
    expect(cents(calculateCreditLedger({ charges: [charge("c1", 1000, "2026-01-01")] }))).toEqual({ unpaid: 100000, excess: 0, prepaid: 0 });
  });

  it("case 2: allocates a later partial settlement FIFO", () => {
    const result = calculateCreditLedger({
      charges: [charge("c1", 1000, "2026-01-01")],
      settlements: [settlement("s1", 400, "2026-01-02")],
    });
    expect(cents(result)).toEqual({ unpaid: 60000, excess: 0, prepaid: 0 });
    expect(result.allocations.find((item) => item.kind === "charge_settlement")?.amountCents).toBe(40000);
  });

  it("case 3: allocates the remaining settlement without floating point drift", () => {
    const result = calculateCreditLedger({
      charges: [charge("c1", 1000, "2026-01-01")],
      settlements: [settlement("s1", 400, "2026-01-02"), settlement("s2", 600, "2026-01-03")],
    });
    expect(cents(result)).toEqual({ unpaid: 0, excess: 0, prepaid: 0 });
  });

  it("case 4: leaves a payment with no earlier charge as unresolved excess", () => {
    const result = calculateCreditLedger({ settlements: [settlement("s1", 500, "2026-01-02")] });
    expect(cents(result)).toEqual({ unpaid: 0, excess: 50000, prepaid: 0 });
    expect(result.issues.some((issue) => issue.code === "unresolved_excess")).toBe(true);
  });

  it("case 5: does not let a later new charge consume old excess", () => {
    const result = calculateCreditLedger({
      settlements: [settlement("s1", 500, "2026-01-02")],
      charges: [charge("c1", 300, "2026-01-03")],
    });
    expect(cents(result)).toEqual({ unpaid: 30000, excess: 50000, prepaid: 0 });
  });

  it("case 6: a late imported charge with an earlier actual date can consume the payment", () => {
    const result = calculateCreditLedger({
      settlements: [settlement("s1", 500, "2026-01-02")],
      charges: [charge("late-c1", 500, "2026-01-01")],
    });
    expect(cents(result)).toEqual({ unpaid: 0, excess: 0, prepaid: 0 });
  });

  it("case 7: opening debt consumes its named settlement and does not pay a later purchase", () => {
    const result = calculateCreditLedger({
      settlements: [settlement("s1", 2000, "2026-01-02")],
      resolutions: [{ id: "r1", cardId: CARD_A, kind: "opening_debt", amount: 2000, date: "2026-01-03", settlementIds: ["s1"] }],
      charges: [charge("new-c1", 500, "2026-01-04")],
    });
    expect(cents(result)).toEqual({ unpaid: 50000, excess: 0, prepaid: 0 });
    expect(result.allocations.some((item) => item.kind === "opening_debt" && item.amountCents === 200000)).toBe(true);
  });

  it("case 8: prepaid credit funds future charges and is consumed in order", () => {
    const result = calculateCreditLedger({
      settlements: [settlement("s1", 500, "2026-01-02")],
      resolutions: [{ id: "r1", cardId: CARD_A, kind: "prepaid_credit", amount: 500, date: "2026-01-03", settlementIds: ["s1"] }],
      charges: [charge("future-c1", 300, "2026-01-04"), charge("future-c2", 700, "2026-01-05")],
    });
    expect(cents(result)).toEqual({ unpaid: 50000, excess: 0, prepaid: 0 });
    expect(result.allocations.filter((item) => item.kind === "prepaid_credit" && item.chargeId).map((item) => item.amountCents)).toEqual([30000, 20000]);
  });

  it("allocates one explicit prepaid decision across multiple named settlements", () => {
    const result = calculateCreditLedger({
      settlements: [settlement("s1", 300, "2026-01-01"), settlement("s2", 200, "2026-01-02")],
      resolutions: [{ id: "r1", cardId: CARD_A, kind: "prepaid_credit", amount: 500, date: "2026-01-03", settlementIds: ["s1", "s2"] }],
      charges: [charge("future-c1", 500, "2026-01-04")],
    });
    expect(cents(result)).toEqual({ unpaid: 0, excess: 0, prepaid: 0 });
    expect(result.allocations.filter((item) => item.kind === "prepaid_credit" && item.settlementId).map((item) => item.amountCents)).toEqual([30000, 20000]);
  });

  it("case 9: cards are independent and never cross-cancel", () => {
    const result = calculateCreditLedger({
      charges: [charge("a-c1", 1000, "2026-01-01", CARD_A)],
      settlements: [settlement("b-s1", 500, "2026-01-02", CARD_B)],
    });
    expect(cents(result)).toEqual({ unpaid: 100000, excess: 50000, prepaid: 0 });
    expect(result.byCard[CARD_A].unsettledRecordedChargesCents).toBe(100000);
    expect(result.byCard[CARD_B].excessSettlementCents).toBe(50000);
  });

  it("case 11: person reimbursement increases bank cash but does not reduce card liability", () => {
    const result = calculateCreditLedger({
      charges: [charge("c1", 1000, "2026-01-01")],
      cardRefunds: [{ id: "p1", cardId: CARD_A, amount: 300, date: "2026-01-02", destination: "person_bank", chargeId: "c1" }],
    });
    expect(cents(result)).toEqual({ unpaid: 100000, excess: 0, prepaid: 0 });
    expect(result.allocations.some((item) => item.kind === "person_bank_reimbursement" && item.amountCents === 30000)).toBe(true);
  });

  it("case 12: merchant card refund reduces an unpaid charge", () => {
    const result = calculateCreditLedger({
      charges: [charge("c1", 1000, "2026-01-01")],
      cardRefunds: [{ id: "r1", cardId: CARD_A, amount: 300, date: "2026-01-02", destination: "merchant_card", chargeId: "c1" }],
    });
    expect(cents(result)).toEqual({ unpaid: 70000, excess: 0, prepaid: 0 });
  });

  it("case 13: merchant refund after full payment becomes future card credit", () => {
    const result = calculateCreditLedger({
      charges: [charge("c1", 1000, "2026-01-01"), charge("c2", 200, "2026-01-04")],
      settlements: [settlement("s1", 1000, "2026-01-02")],
      cardRefunds: [{ id: "r1", cardId: CARD_A, amount: 300, date: "2026-01-03", destination: "merchant_card", chargeId: "c1" }],
    });
    expect(cents(result)).toEqual({ unpaid: 0, excess: 0, prepaid: 10000 });
    expect(result.byCard[CARD_A].cardRefundCreditCents).toBe(10000);
  });

  it("case 14: person reimbursement after full payment does not create card credit", () => {
    const result = calculateCreditLedger({
      charges: [charge("c1", 1000, "2026-01-01")],
      settlements: [settlement("s1", 1000, "2026-01-02")],
      cardRefunds: [{ id: "p1", cardId: CARD_A, amount: 300, date: "2026-01-03", destination: "person_bank", chargeId: "c1" }],
    });
    expect(cents(result)).toEqual({ unpaid: 0, excess: 0, prepaid: 0 });
  });

  it("uses exact integer cents and rejects malformed duplicate input", () => {
    const result = calculateCreditLedger({
      charges: [
        { id: "c1", cardId: CARD_A, amount: "10.10", date: "2026-01-01" },
        { id: "c1", cardId: CARD_A, amount: 2, date: "2026-01-02" },
        { id: "bad", cardId: CARD_A, amount: -1, date: "2026-01-01" },
        { id: "nan", cardId: CARD_A, amount: Number.NaN, date: "2026-01-01" },
      ],
    });
    expect(result.unsettledRecordedChargesCents).toBe(1010);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["duplicate_id", "negative_amount", "invalid_amount"]));
  });

  it("rejects wrong-card and overallocated settlement resolutions", () => {
    const result = calculateCreditLedger({
      settlements: [settlement("s1", 100, "2026-01-02", CARD_A)],
      resolutions: [
        { id: "wrong", cardId: CARD_B, kind: "opening_debt", amount: 100, date: "2026-01-03", settlementIds: ["s1"] },
        { id: "too-much", cardId: CARD_A, kind: "prepaid_credit", amount: 101, date: "2026-01-03", settlementIds: ["s1"] },
      ],
    });
    expect(result.excessSettlementCents).toBe(10000);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["resolution_wrong_card", "resolution_overallocated"]));
  });

  it("does not hide excess behind uncertain same-day chronology", () => {
    const result = calculateCreditLedger({
      charges: [charge("c1", 100, "2026-01-02")],
      settlements: [settlement("s1", 100, "2026-01-02")],
    });
    expect(cents(result)).toEqual({ unpaid: 10000, excess: 10000, prepaid: 0 });
    expect(result.issues.some((issue) => issue.code === "unresolved_excess")).toBe(true);
    expect(result.allocations.some((item) => item.kind === "charge_settlement")).toBe(false);
  });

  it("accepts explicit amountCents for fractional currency values", () => {
    const input: CreditLedgerInput = {
      charges: [{ id: "c1", cardId: CARD_A, amountCents: 101, date: "2026-01-01" }],
      settlements: [{ id: "s1", cardId: CARD_A, amountCents: 100, date: "2026-01-02" }],
    };
    expect(cents(calculateCreditLedger(input))).toEqual({ unpaid: 1, excess: 0, prepaid: 0 });
  });

  it("deduplicates a repeated refund source and caps an over-refund", () => {
    const result = calculateCreditLedger({
      charges: [charge("c1", 100, "2026-01-01")],
      cardRefunds: [
        { id: "r1", cardId: CARD_A, amount: 60, date: "2026-01-02", destination: "merchant_card", chargeId: "c1" },
        { id: "r1", cardId: CARD_A, amount: 60, date: "2026-01-02", destination: "merchant_card", chargeId: "c1" },
        { id: "r2", cardId: CARD_A, amount: 50, date: "2026-01-03", destination: "merchant_card", chargeId: "c1" },
      ],
    });
    expect(result.unsettledRecordedChargesCents).toBe(4000);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["duplicate_id", "refund_overallocated"]));
  });
});
