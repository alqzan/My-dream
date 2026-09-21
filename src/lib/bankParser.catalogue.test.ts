import { describe, expect, it } from "vitest";
import { parseBankSmsBulk } from "./bankParser";

// Sanitized, hand-labelled probes for the 19 sender families in the private
// catalogue.  The fixture intentionally contains no real account, employer,
// beneficiary, or merchant data; expected semantics are authored here rather
// than generated from the parser under test.
const cases = [
  { sender: "AlRajhiBank", text: "حوالة داخلية صادرة\nمن:2468\nمبلغ:SAR 600\nالى:حساب ادخار\nفي:2026-08-14", kind: "transfer_out", direction: "out" },
  { sender: "BSF", text: "شراء عبر نقاط البيع بـ SAR 57.39\nبطاقة:7312\nلدى:TEST GROCERY\nفي:2026-08-14", kind: "purchase", direction: "out" },
  { sender: "SNB", text: "OTP 123456 for Own Credit Card Payment with Amount 700 SAR", kind: "otp", direction: "neutral" },
  { sender: "Alinma", text: "رمز شراء أونلاين 123456\nللبطاقة *7312\nبـ 113 SAR\nمن TEST SHOP\nفي:2026-08-14", kind: "otp", direction: "neutral" },
  { sender: "Barq", text: "Money Added to your Barq wallet\namount: 5000.0 SAR\ncard number: **7312\n2026-08-14 12:22", kind: "deposit", direction: "in" },
  { sender: "STC Bank", text: "دفع قطة\nمبلغ:47.33 ر.س\nإلى:حساب مشترك", kind: "purchase", direction: "out" },
  { sender: "Sukuk", text: "إيداع إلى حساب استثماري\nمبلغ:SAR 300\nفي:2026-08-14", kind: "deposit", direction: "in" },
  { sender: "D360", text: "اضافة باستخدام آبل باى\nمبلغ:SAR 1000\nبطاقة:*7312 - mada\nإلى:*2468\nفي:2026-08-14", kind: "deposit", direction: "in" },
  { sender: "Tiqmo", text: "ECOM Purchase Transaction\nAmount: 20 SAR\nJust a hold on your card", kind: "hold", direction: "neutral" },
  { sender: "Tamara", text: "تأكيد الدفع\nمن:ExampleStore\nبقيمة:62.00 SAR", kind: "info", direction: "neutral" },
  { sender: "Tabby", text: "Your SAR 62 purchase at ExampleStore is confirmed", kind: "info", direction: "neutral" },
  { sender: "RiyadBank", text: "لا تشارك الرمز 123456", kind: "otp", direction: "neutral" },
  { sender: "Drahim", text: "رمز التحقق:123456 لسحب الدراهم", kind: "otp", direction: "neutral" },
  { sender: "Tweeq", text: "عزيزي العميل، نود إبلاغك بإيقاف خدمات المحفظة مؤقتاً", kind: "marketing", direction: "neutral" },
  { sender: "Emkan", text: "رمز التحقق: 123456", kind: "otp", direction: "neutral" },
  { sender: "Derayah", text: "تم منحكم الخصم الخاص بحسابكم بنسبة 100% وتم تفعيل الخصم تلقائياً", kind: "marketing", direction: "neutral" },
  // An investment opportunity's early-repayment notice has no card evidence;
  // it is informational until the owner links it explicitly.
  { sender: "Manafa", text: "العملية: سداد مبكر\nالمبلغ: SAR 200", kind: "info", direction: "neutral" },
  { sender: "SDB", text: "سم نفسك تاجر وانطلق لريادتك!", kind: "marketing", direction: "neutral" },
  { sender: "STC900", text: "عزيزي العميل،\nالنقاط المضافة إلى رصيدك: 1 نقطة\nرصيد قطاف الحالي: 10 نقاط", kind: "marketing", direction: "neutral" },
] as const;

describe("sanitized sender catalogue", () => {
  it("routes one manually labelled sample for every known sender family", () => {
    for (const sample of cases) {
      const event = parseBankSmsBulk(sample.text, "2026-08-15", {
        sender: sample.sender,
        receivedAt: "2026-08-15T12:00:00+03:00",
        sourceInboxId: `fixture-${sample.sender}`,
      }).events[0];
      expect(event?.kind, sample.sender).toBe(sample.kind);
      expect(event?.direction, sample.sender).toBe(sample.direction);
    }
  });

  it("keeps a self-transfer fee as a fee signal without making the transfer principal expense", () => {
    const event = parseBankSmsBulk(
      "تحويل بين حساباتي\nمن:2468\nمبلغ:SAR 500\nإلى:حساب ادخار\nالرسوم:SAR 1.15\nفي:2026-08-14",
      "2026-08-15",
      { sender: "AlRajhiBank", receivedAt: "2026-08-15T12:00:00+03:00", sourceInboxId: "fee-fixture" },
    ).events[0];
    expect(event?.kind).toBe("self_transfer");
    expect(event?.amount).toBe(500);
    expect(event?.expenseAmount).toBe(0);
    expect(event?.fee).toBe(1.15);
  });
});
