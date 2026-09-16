import { describe, it, expect } from "vitest";
import {
  RECONCILE_DAYS, RECONCILE_TOLERANCE, holdings, lastReconcile, reconcileDelta, reconcileStatus,
} from "./reconcile";
import type { Reconcile, ReserveFund, Transaction } from "./types";

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: "t1", date: "2026-01-01", amount: 100, category: "c1", type: "expense", note: "", ...over,
} as Transaction);

const fund = (over: Partial<ReserveFund> = {}): ReserveFund => ({
  id: "f1", name: "سفر", icon: "✈️", color: "#000", deposits: [], createdAt: "2026-01-01", ...over,
});

const TODAY = "2026-09-16";

describe("متى تُطلب المطابقة", () => {
  it("المرساةُ أوّلُ معاملةٍ لا يومُ التثبيت — فلا يُطالَب جهازٌ جديد بلا بيانات", () => {
    const st = reconcileStatus([], [], TODAY);
    expect(st.anchor).toBeNull();
    expect(st.due).toBe(false);
    expect(st.daysLeft).toBe(RECONCILE_DAYS);
  });

  it("من بدأ أمس لا يُطالَب اليوم", () => {
    const st = reconcileStatus([], [tx({ date: "2026-09-15" })], TODAY);
    expect(st.daysSince).toBe(1);
    expect(st.due).toBe(false);
  });

  it("تُطلب بعد تسعين يوماً من المرساة", () => {
    const st = reconcileStatus([], [tx({ date: "2026-06-18" })], TODAY);
    expect(st.daysSince).toBe(90);
    expect(st.due).toBe(true);
    expect(st.daysLeft).toBe(0);
  });

  it("آخرُ مطابقةٍ تُزيح المرساة وتُسكت الطلب", () => {
    const rec: Reconcile[] = [{ id: "r1", date: "2026-09-01", expected: 100, actual: 90, delta: -10 }];
    const st = reconcileStatus(rec, [tx({ date: "2020-01-01" })], TODAY);
    expect(st.anchor).toBe("2026-09-01");
    expect(st.due).toBe(false);
    expect(st.last).toBe("2026-09-01");
  });

  it("أحدثُ قيدٍ هو المرساة ولو كان السجلّ غيرَ مرتّب", () => {
    const rec: Reconcile[] = [
      { id: "a", date: "2026-03-01", expected: 1, actual: 1, delta: 0 },
      { id: "b", date: "2026-09-01", expected: 1, actual: 1, delta: 0 },
      { id: "c", date: "2026-06-01", expected: 1, actual: 1, delta: 0 },
    ];
    expect(lastReconcile(rec)?.id).toBe("b");
  });

  it("تاريخٌ مشوّه في السجلّ لا يصير مرساة", () => {
    const rec: Reconcile[] = [{ id: "bad", date: "لا شيء", expected: 1, actual: 1, delta: 0 }];
    expect(lastReconcile(rec)).toBeNull();
  });
});

describe("ما يظنّه التطبيق أنّك تملك", () => {
  it("مظاريفُك + رصيدُ دورتك — ورصيدُ الدورة مالٌ في حسابك أيضاً", () => {
    const reserves = [
      fund({ id: "f1", deposits: [{ id: "d1", date: "2026-09-01", amount: 1000 }] }),
      fund({ id: "f2", name: "الفوائض", deposits: [{ id: "d2", date: "2026-09-01", amount: 500 }] }),
    ];
    const h = holdings({
      reserves,
      transactions: [],
      // ميزانيةٌ بدأت اليوم: يوميّةٌ واحدة لم تُصرف
      dailyBudget: { amount: 100, startDate: TODAY },
    });
    expect(h.envelopesTotal).toBe(1500);
    expect(h.cycleBalance).toBe(100);
    expect(h.expected).toBe(1600);
    expect(h.envelopes).toHaveLength(2);
  });

  it("بلا ميزانيةٍ يومية يكون المجموعُ المظاريفَ وحدها", () => {
    const h = holdings({ reserves: [fund({ deposits: [{ id: "d", date: "2026-09-01", amount: 300 }] })], transactions: [], dailyBudget: null });
    expect(h.cycleBalance).toBe(0);
    expect(h.expected).toBe(300);
  });
});

describe("الفرق", () => {
  it("ما دون الريال تقريبٌ لا اختلافُ حساب", () => {
    const r = reconcileDelta(1000, 1000.4);
    expect(r.verdict).toBe("match");
    expect(r.delta).toBe(0); // لا تُسجَّل تسويةٌ بلا معنى
  });

  it("الواقعُ أكثر: دخلٌ لم يُسجَّل", () => {
    const r = reconcileDelta(1000, 1250);
    expect(r.verdict).toBe("more");
    expect(r.delta).toBe(250);
  });

  it("الواقعُ أقلّ: صرفٌ لم يُسجَّل — والفرقُ سالبٌ لا يُقلَب", () => {
    const r = reconcileDelta(1000, 740);
    expect(r.verdict).toBe("less");
    expect(r.delta).toBe(-260);
  });

  it("الحدُّ نفسُه مطابقةٌ لا اختلاف", () => {
    expect(reconcileDelta(1000, 1000 + RECONCILE_TOLERANCE).verdict).toBe("match");
    expect(reconcileDelta(1000, 1000 - RECONCILE_TOLERANCE).verdict).toBe("match");
  });

  it("قيمةٌ مشوّهة تُقرأ صفراً لا NaN", () => {
    expect(reconcileDelta(Number.NaN, 100).delta).toBe(100);
    expect(Number.isFinite(reconcileDelta(100, Number.NaN).delta)).toBe(true);
  });
});
