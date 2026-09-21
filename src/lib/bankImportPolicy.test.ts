import { describe, expect, it } from "vitest";
import { isAutoApprovableBankEvent } from "./bankImportPolicy";

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
});
