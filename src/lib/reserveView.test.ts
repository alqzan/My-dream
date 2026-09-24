import { describe, it, expect } from "vitest";
import { groupReserves, lastMovement } from "./reserveView";
import type { ReserveFund, Transaction } from "./types";

const fund = (id: string, name: string, extra: Partial<ReserveFund> = {}): ReserveFund =>
  ({ id, name, icon: "", color: "", createdAt: "2026-07-01", deposits: [], ...extra });

describe("groupReserves — المظاريف بأدوارها لا بأسمائها", () => {
  it("يفصل المدّخر والفوائض عن مظاريف الأهداف، ويحفظ ترتيب الأهداف", () => {
    const g = groupReserves([
      fund("t", "سفر"),
      fund("s", "الفوائض", { role: "surplus" }),
      fund("g", "عام", { role: "general" }),
      fund("h", "هدايا"),
    ]);
    expect(g.general?.id).toBe("g");
    expect(g.surplus?.id).toBe("s");
    expect(g.goals.map((f) => f.id)).toEqual(["t", "h"]);
  });

  it("نسخةٌ ثانيةٌ بدورٍ محجوز لا تُخفى — تُعرض مع الأهداف", () => {
    const g = groupReserves([fund("g1", "عام", { role: "general" }), fund("g2", "عام", { role: "general" })]);
    expect(g.general?.id).toBe("g1");
    expect(g.goals.map((f) => f.id)).toEqual(["g2"]);
  });

  it("بلا مظاريف: لا شيء", () => {
    expect(groupReserves([])).toEqual({ general: null, surplus: null, goals: [] });
  });
});

describe("lastMovement — ماذا فعل هذا الوعاء آخرَ مرّة", () => {
  const rent: Transaction = { id: "t1", date: "2026-09-20", amount: 20850, category: "c", note: "إيجار البيت", reserveSplits: [{ fundId: "g", pct: 100 }] };

  it("الصرفُ منه أحدثُ من آخر إيداع ⇒ خارجٌ بمبلغه واسمه", () => {
    const g = fund("g", "عام", { deposits: [{ id: "d", date: "2026-07-24", amount: 6229, note: "تعبئة" }] });
    expect(lastMovement(g, [rent])).toEqual({ date: "2026-09-20", amount: -20850, note: "إيجار البيت" });
  });

  it("إيداعٌ أحدث ⇒ داخل، والمقاصةُ (إيداعٌ سالب) خارج", () => {
    const s = fund("s", "الفوائض", {
      deposits: [
        { id: "a", date: "2026-09-24", amount: 1410.17, note: "فوائض دورة الراتب" },
        { id: "b", date: "2026-09-24", amount: -299.2, note: "مقاصة تلقائية — تغطية عجز اليومية" },
      ],
    });
    // يومٌ واحد: الخارجُ يُقدَّم — هو ما يُسأل عنه.
    expect(lastMovement(s, [])).toMatchObject({ amount: -299.2 });
  });

  it("بلا حركةٍ قطّ ⇒ null", () => {
    expect(lastMovement(fund("x", "سفر"), [])).toBeNull();
  });
});
