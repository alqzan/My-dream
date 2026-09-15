import { describe, it, expect } from "vitest";
import { reserveTotals, reserveBalance, reserveSpent, reserveShare } from "./utils";
import type { ReserveFund, Transaction } from "./types";

// ===== أرصدةُ المظاريف: مرورٌ واحد، ورقمٌ مقرَّب عند الحدّ =====
// `reserveBalance` تمسح قائمة المعاملات كاملةً لكلّ مظروف، وصفحةُ المال كانت
// تناديها ‏2×(عدد المظاريف) مرّة في كلّ رسم. `reserveTotals` تفعلها في مرورٍ
// واحد — والاختبارُ هنا يُلزمها بأن تعطي **الرقم نفسه** لا رقماً قريباً منه،
// فلا ينحرف مجموعُ الترويسة عن رصيدِ القرص الواحد.

const tx = (id: string, amount: number, splits?: { fundId: string; pct: number }[]): Transaction => ({
  id, date: "2026-08-10", amount, category: "c", note: "",
  ...(splits ? { reserveSplits: splits } : {}),
});

const fund = (id: string, deposits: number[]): ReserveFund => ({
  id, name: id, icon: "📦", color: "#000",
  deposits: deposits.map((amount, i) => ({ id: `${id}-d${i}`, date: "2026-08-01", amount })),
});

describe("reserveTotals يطابق reserveBalance بالضبط", () => {
  const funds = [fund("trip", [1000, 500]), fund("rent", [3000]), fund("empty", [])];
  const txs = [
    tx("t1", 300, [{ fundId: "trip", pct: 100 }]),
    tx("t2", 900, [{ fundId: "trip", pct: 50 }, { fundId: "rent", pct: 50 }]),
    tx("t3", 120),                                   // بلا مظروف — لا يمسّ شيئاً
    tx("t4", 100, [{ fundId: "rent", pct: 33 }]),    // نسبةٌ لا تقسم بالتساوي
  ];

  it("كلُّ مظروفٍ يطابق حسابَه المفرد", () => {
    const totals = reserveTotals(funds, txs);
    for (const f of funds) {
      expect(totals.get(f.id)!.balance).toBe(reserveBalance(f, txs));
      expect(totals.get(f.id)!.spent).toBe(reserveSpent(f, txs));
    }
  });

  it("المجموعُ هو مجموعُ الأرصدة المفردة", () => {
    const totals = reserveTotals(funds, txs);
    const viaMap = funds.reduce((s, f) => s + totals.get(f.id)!.balance, 0);
    const viaSingle = funds.reduce((s, f) => s + reserveBalance(f, txs), 0);
    expect(viaMap).toBe(viaSingle);
  });

  it("مظروفٌ بلا إيداعٍ ولا صرفٍ رصيدُه صفر", () => {
    expect(reserveTotals(funds, txs).get("empty")).toEqual({ balance: 0, spent: 0 });
  });
});

describe("رصيدُ المظروف مقرَّبٌ عند الحدّ", () => {
  // الرصيد يُقرأ **بإشارته** في حُرّاسٍ ماليّة: `pullFromReserve` و
  // `transferBetweenReserves` يقفان عند `<= 0`، و`offsetPlan` يُعلن `noSurplus`.
  // فمظروفٌ أُفرغ بنِسبٍ لا تقسم بالتساوي كان يهبط إلى ‎-1e-14 بدل الصفر، فيصير
  // زرُّ السحب لا يفعل شيئاً **بصمت** على مظروفٍ تعرضه الشاشة «٠ ر.س».
  it("ثلاثةُ أثلاثٍ تُفرغ المظروف إلى صفرٍ نظيف", () => {
    const f = fund("thirds", [100]);
    const spent = [
      tx("a", 100, [{ fundId: "thirds", pct: 33.33 }]),
      tx("b", 100, [{ fundId: "thirds", pct: 33.33 }]),
      tx("c", 100, [{ fundId: "thirds", pct: 33.34 }]),
    ];
    const balance = reserveBalance(f, spent);
    expect(balance).toBe(0);
    expect(Object.is(balance, -0)).toBe(false); // ولا صفرٌ سالب يربك المقارنة
    expect(balance <= 0).toBe(true);
  });

  it("الحصّةُ نفسُها تمرّ بـ`cashOut` ومقرَّبة", () => {
    const t = tx("x", 99.99, [{ fundId: "f", pct: 33 }]);
    expect(reserveShare(t, "f")).toBe(33);   // 32.9967 → 33
    expect(reserveShare(t, "other")).toBe(0);
  });
});
