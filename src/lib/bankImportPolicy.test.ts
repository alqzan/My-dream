import { describe, expect, it } from "vitest";
import { defaultIncluded, isAutoApprovableBankEvent } from "./bankImportPolicy";

const purchase = {
  kind: "purchase" as const,
  direction: "out" as const,
  confidence: "template" as const,
  amount: 38,
  expenseAmount: 38,
};

describe("bank import automatic acceptance", () => {
  it("accepts a parsed outgoing expense with a real amount", () => {
    expect(isAutoApprovableBankEvent(purchase)).toBe(true);
  });

  it.each([
    ["generic", { ...purchase, confidence: "generic" as const }],
    ["duplicate", purchase, true],
    ["incoming", { ...purchase, direction: "in" as const }],
    ["notice", { ...purchase, kind: "info" as const, amount: 0, expenseAmount: 0 }],
    ["obligation", { ...purchase, obligationHint: { amount: 20, merchant: "shop", dueDate: "2026-09-25" } }],
  ] as const)("keeps %s in review", (_label, event, duplicate = false) => {
    expect(isAutoApprovableBankEvent(event, duplicate)).toBe(false);
  });

  it("never auto-approves installments or a receipt at the event-size boundary", () => {
    const installment = { ...purchase, kind: "installment" as const, amount: 250, expenseAmount: 250 };
    expect(isAutoApprovableBankEvent(installment)).toBe(false);
    expect(isAutoApprovableBankEvent({ ...purchase, amount: 299, expenseAmount: 299 }, false, { dailyRate: 100 })).toBe(true);
    expect(isAutoApprovableBankEvent({ ...purchase, amount: 300, expenseAmount: 300 }, false, { dailyRate: 100 })).toBe(false);
    expect(isAutoApprovableBankEvent({ ...purchase, amount: 300, expenseAmount: 300 }, false, { dailyRate: 100, onTrip: true })).toBe(true);
  });

  it("defaults ordinary generic expenses to selected while attaching a reason to each risky row", () => {
    expect(defaultIncluded({ ...purchase, confidence: "generic" })).toEqual({ included: true });
    expect(defaultIncluded(purchase, true)).toEqual({ included: false, reason: "مكرّر" });
    expect(defaultIncluded({ ...purchase, reviewReason: "هل برق محفظتك؟" })).toEqual({ included: false, reason: "محفظة؟" });
    expect(defaultIncluded({ ...purchase, reviewReason: "لم يظهر مبلغ موثوق" })).toEqual({ included: false, reason: "راجع المبلغ" });
    expect(defaultIncluded({ ...purchase, kind: "installment" }, false, { dailyRate: 100 })).toEqual({ included: false, reason: "وجّه المصروف" });
    expect(defaultIncluded({ ...purchase, amount: 300, expenseAmount: 300 }, false, { dailyRate: 100 })).toEqual({ included: false, reason: "وجّه المصروف" });
    expect(defaultIncluded({ ...purchase, amount: 300, expenseAmount: 300 }, false, { dailyRate: 100, onTrip: true })).toEqual({ included: true });
    expect(defaultIncluded({ ...purchase, kind: "unknown", direction: "neutral" })).toEqual({ included: false, reason: "غير معروف" });
    expect(defaultIncluded({ ...purchase, direction: "in" })).toEqual({ included: false, reason: "غير مصروف" });
  });
});
