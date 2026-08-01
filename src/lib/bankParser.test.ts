import { describe, it, expect } from "vitest";
import { parseBankSms } from "./bankParser";

describe("parseBankSms — ambiguous 2-digit-year dates", () => {
  it("reads a yy-mm-dd credit-card POS alert by proximity to today, not as dd-mm-yy", () => {
    // ALDREES fuel purchase, dated "26-07-30" — yy-mm-dd (2026-07-30), sent
    // two days before the reference date. Read as dd-mm-yy this would land on
    // 2030-07-26, a purchase four years in the future.
    const text =
      "شراء 78.00 SAR POS - Apple Pay بطاقة ائتمانية *9407 من ALDREES 1089 - SA في 15:12 26-07-30 الرصيد 482.37";
    const result = parseBankSms(text, "2026-08-01");
    expect(result?.date).toBe("2026-07-30");
  });

  it("still reads a mada dd-mm-yy alert correctly", () => {
    const text = "شراء بـ SR 22 لدى STARBUCKS بتاريخ 16/7/26 رصيد: 1200";
    const result = parseBankSms(text, "2026-08-01");
    expect(result?.date).toBe("2026-07-16");
  });

  it("falls back to the only calendar-valid reading when unambiguous", () => {
    // day 26 can't be a month, so this can only be dd-mm-yy.
    const text = "شراء 50 SAR لدى SOME STORE بتاريخ 26-02-25 رصيد: 900";
    const result = parseBankSms(text, "2025-02-27");
    expect(result?.date).toBe("2025-02-26");
  });
});
