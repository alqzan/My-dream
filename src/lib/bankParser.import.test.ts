import { describe, expect, it } from "vitest";
import { parseBankSmsBulk } from "./bankParser";

describe("bank SMS import boundary", () => {
  it("uses the receipt date when the body only contains a due date", () => {
    const [event] = parseBankSmsBulk(
      "إصدار كشف حساب\nإجمالي المبلغ المستحق: SAR 311.67\nتاريخ الاستحقاق: 2026-09-25",
      "2026-08-15",
      { sender: "Alinma", receivedAt: "2026-08-15T12:00:00+03:00", sourceInboxId: "doc-1" },
    ).events;
    expect(event.kind).toBe("statement");
    expect(event.amount).toBe(0);
    expect(event.date).toBe("2026-08-15");
  });

  it("keeps a warning paragraph with its receipt instead of creating a second event", () => {
    const parsed = parseBankSmsBulk(
      "شراء\nالمبلغ: SAR 45\nلدى: TEST SHOP\n\nلحمايتك، حاولنا التواصل معك بخصوص العملية",
      "2026-08-15",
      { sender: "AlRajhiBank", receivedAt: "2026-08-15T12:00:00+03:00", sourceInboxId: "doc-2" },
    ).events;
    expect(parsed).toHaveLength(1);
    expect(parsed[0].kind).toBe("purchase");
    expect(parsed[0].amount).toBe(45);
  });

  it("keeps event identity tied to the source document and subevent slot", () => {
    const options = { sourceId: "manual-paste-1", sender: "AlRajhiBank", receivedAt: "2026-08-15T12:00:00+03:00" };
    const a = parseBankSmsBulk("شراء\nالمبلغ: SAR 10\nلدى: TEST SHOP", "2026-08-15", options).events[0];
    const b = parseBankSmsBulk("شراء\nالمبلغ: SAR 10\nلدى: EDITED SHOP", "2026-08-15", options).events[0];
    expect(a.eventId).toBe("manual-paste-1:0");
    expect(b.eventId).toBe(a.eventId);
    expect(b.sourceKey).not.toBe(a.sourceKey);
  });

  it.each([
    ["رمز شراء اونلاين 123456\nلعملية بمبلغ 113 SAR", "otp"],
    ["تم منحكم الخصم الخاص بحسابكم بنسبة 100%", "marketing"],
    ["ECOM Purchase Transaction\nAmount: 20 SAR\nJust a hold on your card", "hold"],
  ] as const)("sets zero amount for %s", (text, kind) => {
    const event = parseBankSmsBulk(text, "2026-08-15", { sender: "Alinma", receivedAt: "2026-08-15T12:00:00+03:00" }).events[0];
    expect(event.kind).toBe(kind);
    expect(event.amount).toBe(0);
    expect(event.expenseAmount).toBe(0);
  });

  it("does not turn a Visa mention alone into credit evidence", () => {
    const event = parseBankSmsBulk(
      "شراء\nالمبلغ: SAR 25\nلدى: TEST SHOP\nVisa 7312\nالرصيد: 900",
      "2026-08-15",
      { sender: "AlRajhiBank", receivedAt: "2026-08-15T12:00:00+03:00" },
    ).events[0];
    expect(event.accountId).toBe("rajhi:card:7312");
    expect(event.cardLast4).toBe("7312");
    expect(event.balanceKind).toBe("unknown");
  });

  it("keeps BNPL provider facts as metadata while cash amount stays zero", () => {
    const event = parseBankSmsBulk(
      "دفعة قادمة بقيمة 397.01 SAR لطلبك من شي ان مستحقة خلال يومين",
      "2026-08-15",
      { sender: "Tamara", receivedAt: "2026-08-15T12:00:00+03:00", sourceInboxId: "bnpl-hint" },
    ).events[0];
    expect(event.kind).toBe("info");
    expect(event.amount).toBe(0);
    expect(event.obligationHint).toMatchObject({ amount: 397.01, merchant: "شي ان", dueDate: "2026-08-17" });
  });
});
