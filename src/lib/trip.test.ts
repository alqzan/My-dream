import { describe, it, expect } from "vitest";
import { activeTrip, activeTripOf, isTripEligibleFund, lastEndedTrip, tripSplitFor, tripSummary, pastTrips } from "./trip";
import { GENERAL_FUND_NAME, SURPLUS_FUND_NAME, type ReserveFund, type Transaction, type Trip } from "./types";
import { reserveBalance, reserveShare } from "./utils";

const fund = (over: Partial<ReserveFund> & { id: string }): ReserveFund => ({
  name: "رحلة المدينة", icon: "🎒", color: "#000", deposits: [], createdAt: "2026-03-01", ...over,
});
const tx = (id: string, date: string, amount: number, category: string, pct = 100): Transaction => ({
  id, date, amount, category, note: id, reserveSplits: [{ fundId: "f-trip", pct }],
});
const t = (id: string, startedAt: string, endedAt?: string): Trip =>
  ({ id, startedAt, ...(endedAt ? { endedAt } : {}) });

const MARCH: Trip = t("tr-1", "2026-03-10", "2026-03-14");
const trip = fund({ id: "f-trip", trips: [MARCH] });
const txs = [
  tx("hotel", "2026-03-10", 2600, "cat-lux"),
  tx("food", "2026-03-11", 300, "cat-basic"),
  tx("gift", "2026-03-13", 500, "cat-gift", 50), // نصفُه على المظروف
  { id: "other", date: "2026-03-12", amount: 90, category: "cat-basic", note: "خارج الرحلة" } as Transaction,
];

describe("activeTrip — واحدةٌ جارية في كلّ وقت", () => {
  it("تُعرف بأنّها بدأت ولم تنتهِ", () => {
    expect(activeTrip([trip])).toBeNull(); // منتهية
    const live = fund({ id: "f-live", trips: [t("tr-live", "2026-03-10")] });
    expect(activeTrip([trip, live])?.fund.id).toBe("f-live");
    expect(activeTrip([trip, live])?.trip.id).toBe("tr-live");
    expect(activeTrip([fund({ id: "f-plain" })])).toBeNull();
  });

  it("و`activeTripOf` تقرأ مظروفاً واحداً", () => {
    expect(activeTripOf(trip)).toBeNull();
    const mixed = fund({ id: "f-x", trips: [MARCH, t("tr-2", "2026-06-01")] });
    expect(activeTripOf(mixed)?.id).toBe("tr-2");
  });

  it("و`lastEndedTrip` تعطي آخرَ ما انتهى لا أوّلَه", () => {
    const many = fund({ id: "f-y", trips: [t("a", "2026-01-01", "2026-01-05"), t("b", "2026-05-01", "2026-05-03")] });
    expect(lastEndedTrip(many)?.id).toBe("b");
    expect(lastEndedTrip(fund({ id: "f-none" }))).toBeNull();
  });
});

describe("المظاريف العامة ليست وضع سفر", () => {
  it("يفصل «عام» و«الفوائض» عن الرحلات", () => {
    expect(isTripEligibleFund(fund({ id: "f-trip", name: "رحلة المدينة" }))).toBe(true);
    expect(isTripEligibleFund(fund({ id: "f-general", name: GENERAL_FUND_NAME }))).toBe(false);
    expect(isTripEligibleFund(fund({ id: "f-surplus", name: SURPLUS_FUND_NAME }))).toBe(false);
  });

  it("لا يعرض رحلة قديمة أو صرفها على مظروفٍ عام", () => {
    const general = fund({
      id: "f-general", name: GENERAL_FUND_NAME,
      trips: [t("tr-rent", "2026-09-20", "2026-09-20")],
    });
    const rent = { ...tx("rent", "2026-09-20", 20850, "cat-essentials"), reserveSplits: [{ fundId: "f-general", pct: 100 }] };
    expect(activeTripOf(general)).toBeNull();
    expect(pastTrips([general])).toEqual([]);
    expect(tripSummary(general, [rent], "2026-09-21").total).toBe(0);
  });
});

describe("tripSplitFor — الرحلة تتبع تاريخ المعاملة", () => {
  const live = fund({ id: "f-live", trips: [t("tr-live", "2026-03-10")] });
  const ended = fund({ id: "f-ended", trips: [t("tr-ended", "2026-03-10", "2026-03-12")] });

  it("routes dates inside ongoing and completed trips, including receipts imported later", () => {
    expect(tripSplitFor([live], "2026-03-11", "2026-03-12")).toEqual([{ fundId: "f-live", pct: 100 }]);
    expect(tripSplitFor([ended], "2026-03-11", "2026-03-20")).toEqual([{ fundId: "f-ended", pct: 100 }]);
    expect(tripSplitFor([ended], "2026-03-13", "2026-03-20")).toBeUndefined();
  });

  it("does not backdate a pre-trip receipt, future date, malformed date, or system fund", () => {
    const general = fund({ id: "f-general", name: GENERAL_FUND_NAME, trips: [t("tr-general", "2026-03-10")] });
    expect(tripSplitFor([live], "2026-03-09", "2026-03-12")).toBeUndefined();
    expect(tripSplitFor([live], "2026-03-13", "2026-03-12")).toBeUndefined();
    expect(tripSplitFor([live], "2026-02-30", "2026-03-12")).toBeUndefined();
    expect(tripSplitFor([general], "2026-03-11", "2026-03-12")).toBeUndefined();
  });
});

describe("tripSummary — كم كلّفتني", () => {
  it("يجمع ما حُمِّل على المظروف وحده، بحصصه لا بمبالغه الخام", () => {
    const s = tripSummary(trip, txs, "2026-03-20");
    expect(s.total).toBe(3150); // 2600 + 300 + 250 (نصف الهدية)
    expect(s.count).toBe(3); // «خارج الرحلة» غير محسوبة
    expect(s.biggest?.id).toBe("hotel");
  });

  it("يحسب الأيام شاملةً الطرفين ومتوسّط اليوم", () => {
    const s = tripSummary(trip, txs, "2026-03-20");
    expect(s.days).toBe(5); // 10..14
    expect(s.perDay).toBe(630);
    expect(s.ongoing).toBe(false);
  });

  it("ورحلةٌ جارية تُقاس حتى اليوم", () => {
    const live = fund({ id: "f-trip", trips: [t("tr-live", "2026-03-10")] });
    const s = tripSummary(live, txs, "2026-03-12");
    expect(s.days).toBe(3);
    expect(s.ongoing).toBe(true);
  });

  it("ويقسّم الصرف على الأقسام مرتّباً تنازلياً", () => {
    const s = tripSummary(trip, txs, "2026-03-20");
    expect(s.byCategory[0]).toEqual({ category: "cat-lux", total: 2600 });
    expect(s.byCategory.map((c) => c.category)).toEqual(["cat-lux", "cat-basic", "cat-gift"]);
  });

  it("يرجع الاسترداد المرتبط إلى مظروف الرحلة حتى بعد انتهائها", () => {
    const original = { ...tx("trip-purchase", "2026-03-11", 200, "cat-trip"), accountId: "card-1" };
    const refund: Transaction = {
      id: "trip-refund", date: "2026-03-18", amount: 50, category: "cat-trip", note: "refund",
      kind: "refund", direction: "in", refundDestination: "merchant_card",
      linkedTransactionId: original.id, reserveSplits: original.reserveSplits,
    };
    const fundWithDeposit = { ...trip, deposits: [{ id: "d1", date: "2026-03-01", amount: 500 }] };
    expect(reserveShare(refund, "f-trip")).toBe(-50);
    expect(reserveBalance(fundWithDeposit, [original, refund])).toBe(350);
    const summary = tripSummary(fundWithDeposit, [original, refund], "2026-03-20", MARCH);
    expect(summary).toMatchObject({ total: 150, count: 2 });
    expect(summary.biggest?.id).toBe(original.id);
  });

  it("مظروفٌ بلا سفرٍ ولا معاملات: أصفارٌ بلا انهيار", () => {
    const s = tripSummary(fund({ id: "f-empty" }), [], "2026-03-20");
    expect(s).toMatchObject({ total: 0, count: 0, days: 0, perDay: 0, biggest: null, ongoing: false });
  });
});

// ===== العطلُ الذي وُلد منه هذا التغيير (٠٫١٫٤٢٥) =====
// كان المظروف يحمل **رحلةً واحدة**. فمن سافر على مظروف «سفر» ثمّ سافر عليه
// ثانيةً — وهو أطبعُ ما يُفعل بمظروفٍ اسمُه سفر — فقد الأولى بلا استرجاع،
// وقُسِم صرفُ المظروف **كلُّه** على أيّام الثانية فأعطى `perDay` أضعافَ الحقيقة.
describe("رحلتان على مظروفٍ واحد", () => {
  const two = fund({
    id: "f-trip",
    trips: [t("tr-1", "2026-03-10", "2026-03-14"), t("tr-2", "2026-06-01", "2026-06-02")],
  });
  const both = [
    ...txs,
    tx("june-hotel", "2026-06-01", 400, "cat-lux"),
    tx("june-food", "2026-06-02", 100, "cat-basic"),
  ];

  it("**كلُّ رحلةٍ تقرأ نافذتَها وحدها** — لا يُحسب صرفُ مارس على يونيو", () => {
    const june = tripSummary(two, both, "2026-06-10", t("tr-2", "2026-06-01", "2026-06-02"));
    expect(june.total).toBe(500);   // ٤٠٠ + ١٠٠ — لا ٣٦٥٠
    expect(june.count).toBe(2);
    expect(june.days).toBe(2);
    expect(june.perDay).toBe(250);  // وبلا نافذةٍ كانت ١٨٢٥
  });

  it("والرحلةُ الأولى ما زالت كما كانت", () => {
    const march = tripSummary(two, both, "2026-06-10", MARCH);
    expect(march.total).toBe(3150);
    expect(march.perDay).toBe(630);
  });

  it("وكلتاهما في سجلّ «رحلاتي السابقة» — مظروفٌ واحد بسطرين", () => {
    const rows = pastTrips([two]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.trip.id)).toEqual(["tr-2", "tr-1"]); // أحدثُها أوّلاً
    expect(rows.every((r) => r.fund.id === "f-trip")).toBe(true);
  });

  it("ومصروفٌ بين الرحلتين لا يُحسب على أيٍّ منهما", () => {
    const between = [...both, tx("gap", "2026-04-20", 999, "cat-lux")];
    expect(tripSummary(two, between, "2026-06-10", MARCH).total).toBe(3150);
    expect(tripSummary(two, between, "2026-06-10", t("tr-2", "2026-06-01", "2026-06-02")).total).toBe(500);
  });
});

describe("pastTrips — سجلّ الرحلات", () => {
  it("المنتهيةُ وحدها، أحدثُها أوّلاً، عبر المظاريف كلِّها", () => {
    const older = fund({ id: "f-old", name: "عمرة", trips: [t("tr-o", "2026-01-01", "2026-01-05")] });
    const live = fund({ id: "f-live", trips: [t("tr-l", "2026-03-10")] });
    const rows = pastTrips([older, trip, live, fund({ id: "f-plain" })]);
    expect(rows.map((r) => r.trip.id)).toEqual(["tr-1", "tr-o"]);
  });
});
