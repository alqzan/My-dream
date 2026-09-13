import { describe, it, expect } from "vitest";
import { activeTrip, tripSummary, pastTrips } from "./trip";
import type { ReserveFund, Transaction } from "./types";

const fund = (over: Partial<ReserveFund> & { id: string }): ReserveFund => ({
  name: "رحلة المدينة", icon: "🎒", color: "#000", deposits: [], createdAt: "2026-03-01", ...over,
});
const tx = (id: string, date: string, amount: number, category: string, pct = 100): Transaction => ({
  id, date, amount, category, note: id, reserveSplits: [{ fundId: "f-trip", pct }],
});

const trip = fund({ id: "f-trip", trip: { startedAt: "2026-03-10", endedAt: "2026-03-14" } });
const txs = [
  tx("hotel", "2026-03-10", 2600, "cat-lux"),
  tx("food", "2026-03-11", 300, "cat-basic"),
  tx("gift", "2026-03-13", 500, "cat-gift", 50), // نصفُه على المظروف
  { id: "other", date: "2026-03-12", amount: 90, category: "cat-basic", note: "خارج الرحلة" } as Transaction,
];

describe("activeTrip — رحلةٌ واحدة جارية", () => {
  it("تُعرف بأنّها بدأت ولم تنتهِ", () => {
    expect(activeTrip([trip])).toBeNull(); // منتهية
    const live = fund({ id: "f-live", trip: { startedAt: "2026-03-10" } });
    expect(activeTrip([trip, live])?.id).toBe("f-live");
    expect(activeTrip([fund({ id: "f-plain" })])).toBeNull();
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
    const live = fund({ id: "f-trip", trip: { startedAt: "2026-03-10" } });
    const s = tripSummary(live, txs, "2026-03-12");
    expect(s.days).toBe(3);
    expect(s.ongoing).toBe(true);
  });

  it("ويقسّم الصرف على الأقسام مرتّباً تنازلياً", () => {
    const s = tripSummary(trip, txs, "2026-03-20");
    expect(s.byCategory[0]).toEqual({ category: "cat-lux", total: 2600 });
    expect(s.byCategory.map((c) => c.category)).toEqual(["cat-lux", "cat-basic", "cat-gift"]);
  });

  it("مظروفٌ بلا سفرٍ ولا معاملات: أصفارٌ بلا انهيار", () => {
    const s = tripSummary(fund({ id: "f-empty" }), [], "2026-03-20");
    expect(s).toMatchObject({ total: 0, count: 0, days: 0, perDay: 0, biggest: null, ongoing: false });
  });
});

describe("pastTrips — سجلّ الرحلات", () => {
  it("المنتهيةُ وحدها، أحدثُها أوّلاً", () => {
    const older = fund({ id: "f-old", name: "عمرة", trip: { startedAt: "2026-01-01", endedAt: "2026-01-05" } });
    const live = fund({ id: "f-live", trip: { startedAt: "2026-03-10" } });
    expect(pastTrips([older, trip, live, fund({ id: "f-plain" })]).map((f) => f.id)).toEqual(["f-trip", "f-old"]);
  });
});
