import { describe, expect, it } from "vitest";
import {
  GENERAL_FUND_ID,
  SURPLUS_FUND_ID,
  canonicalizeReserveFunds,
  normalizeReserveFunds,
  normalizeReserveSplits,
  normalizeTransactionReserveSplitsForFunds,
  reserveFundRole,
} from "./reserveFunds";
import type { ReserveFund } from "./types";

const fund = (over: Partial<ReserveFund>): ReserveFund => ({
  id: "f1", name: "رحلة", icon: "📦", color: "#000", deposits: [], createdAt: "2026-09-01", ...over,
});

describe("هوية المظاريف المحجوزة", () => {
  it("يطبّع الأسماء القديمة إلى role ثابت ويحافظ على معرف الصندوق", () => {
    const out = normalizeReserveFunds([
      fund({ id: "legacy-general", name: "عام" }),
      fund({ id: "legacy-surplus", name: "الفوائض" }),
    ]);

    expect(out.map((f) => [f.id, f.role, f.name])).toEqual([
      ["legacy-general", "general", "عام"],
      ["legacy-surplus", "surplus", "الفوائض"],
    ]);
    expect(reserveFundRole(out[0])).toBe("general");
    expect(reserveFundRole(out[1])).toBe("surplus");
  });

  it("يستخدم معرفات حتمية عند إنشاء الحسابين المحجوزين", () => {
    expect(GENERAL_FUND_ID).toBe("fund-general");
    expect(SURPLUS_FUND_ID).toBe("fund-surplus");
  });

  it("لا يسمح لاسم مكرر قديم بأن يكتسب دور الحساب المحجوز الثاني", () => {
    const out = normalizeReserveFunds([
      fund({ id: "g", name: "عام" }),
      fund({ id: "custom", name: "عام" }),
    ]);

    expect(out[0].role).toBe("general");
    expect(out[1].role).toBe("custom");
    expect(reserveFundRole(out[1])).toBeUndefined();
  });

  it("يوحّد نسختي الدور عبر الجهازين ويرجع مراجع المعاملات إلى المعرف الفائز", () => {
    const result = canonicalizeReserveFunds([
      fund({ id: "legacy-general-b", role: "general", name: "عام", deposits: [{ id: "d-b", date: "2026-09-02", amount: 200 }] }),
      fund({ id: GENERAL_FUND_ID, role: "general", name: "عام", deposits: [{ id: "d-a", date: "2026-09-01", amount: 100 }] }),
      fund({ id: "custom-same-name", role: "custom", name: "عام" }),
    ]);

    expect(result.reserves.filter((f) => f.role === "general")).toHaveLength(1);
    expect(result.reserves.find((f) => f.id === GENERAL_FUND_ID)?.deposits.map((d) => d.id)).toEqual(["d-b", "d-a"]);
    expect(result.aliases["legacy-general-b"]).toBe(GENERAL_FUND_ID);
    expect(result.reserves.find((f) => f.id === "custom-same-name")?.role).toBe("custom");
    expect(normalizeTransactionReserveSplitsForFunds(
      { id: "t", reserveSplits: [
        { fundId: "legacy-general-b", pct: 25 },
        { fundId: GENERAL_FUND_ID, pct: 25 },
        { fundId: "missing", pct: 50 },
      ] },
      result.aliases,
      new Set(result.reserves.map((f) => f.id)),
    ).reserveSplits).toEqual([{ fundId: GENERAL_FUND_ID, pct: 50 }]);
  });
});

describe("normalizeReserveSplits", () => {
  it("يدمج تكرار الحساب نفسه ويحافظ على مجموع صالح", () => {
    expect(normalizeReserveSplits([
      { fundId: "a", pct: 20 },
      { fundId: "a", pct: 30 },
      { fundId: "b", pct: 10 },
    ])).toEqual([
      { fundId: "a", pct: 50 },
      { fundId: "b", pct: 10 },
    ]);
  });

  it("يقصّ حمولة قديمة تتجاوز 100% بطريقة متناسبة", () => {
    expect(normalizeReserveSplits([
      { fundId: "a", pct: 80 },
      { fundId: "b", pct: 40 },
    ])).toEqual([
      { fundId: "a", pct: 66.67 },
      { fundId: "b", pct: 33.33 },
    ]);
  });
});
