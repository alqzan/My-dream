import { describe, it, expect } from "vitest";
import {
  installmentDueDates, planScheduleAmounts, planExpectedTotal, planMismatch,
  planPaid, planSchedule, planSummary, installmentsOverview, validatePlanDraft,
  describeDueIn, isPlanOpen, planPrincipal, planLinkedTransactions,
} from "./installments";
import type { InstallmentPlan, Transaction } from "./types";

const plan = (over: Partial<InstallmentPlan> = {}): InstallmentPlan => ({
  id: "p1",
  provider: "تمارا",
  name: "جوّال",
  totalPrice: 1200,
  downPayment: 200,
  installmentAmount: 100,
  count: 10,
  firstDueDate: "2026-02-15",
  status: "active",
  createdAt: "2026-02-01",
  ...over,
});

const pay = (over: Partial<Transaction> & { id: string }): Transaction => ({
  date: "2026-02-15",
  amount: 100,
  category: "cat",
  note: "",
  planId: "p1",
  ...over,
});

describe("installmentDueDates — جدولٌ شهريٌّ يصمد لـ29/30/31 وفبراير", () => {
  it("keeps the anchor day month after month", () => {
    expect(installmentDueDates("2026-02-15", 3)).toEqual(["2026-02-15", "2026-03-15", "2026-04-15"]);
  });

  it("clamps a 31st to the last day of a shorter month, then returns to the anchor", () => {
    // 31 يناير → 28 فبراير (غير كبيسة) → 31 مارس → 30 أبريل → 31 مايو: الموعد
    // يُقلَّم ولا يزحف (لا يبقى على 28 ولا يقفز لأول الشهر التالي).
    expect(installmentDueDates("2026-01-31", 5)).toEqual([
      "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31",
    ]);
  });

  it("uses 29 February in a leap year", () => {
    expect(installmentDueDates("2028-01-31", 3)).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
    expect(installmentDueDates("2028-01-29", 2)).toEqual(["2028-01-29", "2028-02-29"]);
  });

  it("crosses the year boundary", () => {
    expect(installmentDueDates("2026-12-10", 3)).toEqual(["2026-12-10", "2027-01-10", "2027-02-10"]);
  });

  it("returns nothing for a bad date or a zero count", () => {
    expect(installmentDueDates("", 5)).toEqual([]);
    expect(installmentDueDates("2026-02-15", 0)).toEqual([]);
  });

  it("caps a corrupt count so a bad number can't generate millions of rows", () => {
    expect(installmentDueDates("2026-02-15", 1_000_000)).toHaveLength(600);
  });
});

describe("planScheduleAmounts — الدفعة الأخيرة تستبدل آخر قسط", () => {
  it("uses the plain installment amount when there is no final payment", () => {
    const rows = planScheduleAmounts(plan({ count: 3 }));
    expect(rows.map((r) => r.amount)).toEqual([100, 100, 100]);
    expect(rows.some((r) => r.isFinal)).toBe(false);
  });

  it("replaces (never adds to) the last installment with the final payment", () => {
    const rows = planScheduleAmounts(plan({ count: 3, finalPayment: 500 }));
    expect(rows.map((r) => r.amount)).toEqual([100, 100, 500]);
    expect(rows[2].isFinal).toBe(true);
    // ثلاثة أقساط لا أربعة — الدفعة الأخيرة استبدلت الأخير ولم تُضَف صفّاً.
    expect(rows).toHaveLength(3);
  });
});

describe("planExpectedTotal / planMismatch — الإجمالي هو المرجع والرسوم توضيحية", () => {
  it("has no mismatch when the pieces add up to the total", () => {
    expect(planExpectedTotal(plan())).toBe(1200); // 200 + 10×100
    expect(planMismatch(plan())).toBeNull();
  });

  it("never adds fees on top of the total price", () => {
    const p = plan({ fees: 75 });
    expect(planExpectedTotal(p)).toBe(1200);
    expect(planMismatch(p)).toBeNull(); // الرسوم لا تُحدث فرقاً
  });

  it("flags a real mismatch (non-blocking) with the expected sum and the difference", () => {
    const p = plan({ count: 10, finalPayment: 300 }); // 200 + 9×100 + 300 = 1400
    expect(planExpectedTotal(p)).toBe(1400);
    expect(planMismatch(p)).toEqual({ expected: 1400, diff: 200 });
  });

  it("tolerates rounding noise below half a riyal", () => {
    expect(planMismatch(plan({ totalPrice: 1200.2 }))).toBeNull();
  });
});

describe("planSchedule — لا يصير القسط مدفوعاً بمرور الوقت", () => {
  it("leaves every row unpaid (just overdue) when nothing was recorded", () => {
    const rows = planSchedule(plan({ count: 3 }), [], "2026-12-31");
    expect(rows.every((r) => !r.paid)).toBe(true);
    expect(rows.filter((r) => r.overdue)).toHaveLength(3); // فائتة لا مدفوعة
    expect(planSummary(plan({ count: 3 }), [], "2026-12-31").paid).toBe(0);
  });

  it("marks the row a payment explicitly names", () => {
    const txs = [pay({ id: "t1", planRole: "installment", planInstallmentNo: 2, amount: 100 })];
    const rows = planSchedule(plan({ count: 3 }), txs, "2026-02-16");
    expect(rows[0].paid).toBe(false);
    expect(rows[1].paid).toBe(true);
    expect(rows[1].txIds).toEqual(["t1"]);
  });

  it("allocates a numberless payment to the earliest unpaid row", () => {
    const txs = [
      pay({ id: "t1", planRole: "installment", amount: 100 }),
      pay({ id: "t2", planRole: "installment", amount: 100, date: "2026-03-15" }),
    ];
    const rows = planSchedule(plan({ count: 3 }), txs, "2026-04-01");
    expect(rows.map((r) => r.paid)).toEqual([true, true, false]);
  });

  it("ignores the down payment when covering installment rows", () => {
    const txs = [pay({ id: "d", planRole: "down", amount: 200 })];
    const rows = planSchedule(plan({ count: 3 }), txs, "2026-02-16");
    expect(rows.every((r) => !r.paid)).toBe(true);
    // لكنّها تُحتسب في المدفوع (كل معاملةٍ مربوطة).
    expect(planPaid(plan({ count: 3 }), txs)).toBe(200);
  });
});

describe("planSummary — المدفوع والمتبقّي والنسبة والقسط القادم", () => {
  it("derives everything from the linked transactions", () => {
    const txs = [
      pay({ id: "d", planRole: "down", amount: 200 }),
      pay({ id: "t1", planRole: "installment", planInstallmentNo: 1, amount: 100 }),
    ];
    const s = planSummary(plan(), txs, "2026-03-01");
    expect(s.paid).toBe(300);
    expect(s.remaining).toBe(900);
    expect(s.pct).toBe(25);
    expect(s.downPaid).toBe(true);
    expect(s.next?.no).toBe(2);
    expect(s.complete).toBe(false);
  });

  it("never reports a negative remaining, and completes at the total", () => {
    const txs = [pay({ id: "big", planRole: "settlement", amount: 5000 })];
    const s = planSummary(plan(), txs, "2026-03-01");
    expect(s.remaining).toBe(0);
    expect(s.pct).toBe(100);
    expect(s.complete).toBe(true);
  });
});

describe("السداد المبكر — المبلغ الفعليّ وحده، والفرق «موفَّر»", () => {
  it("records only what was actually paid and shows the difference as saved", () => {
    // دُفعت الأولى + قسطان (400)، ثمّ سُدّد الباقي (800) بـ700 فعلياً.
    const txs = [
      pay({ id: "d", planRole: "down", amount: 200 }),
      pay({ id: "t1", planRole: "installment", planInstallmentNo: 1, amount: 100 }),
      pay({ id: "t2", planRole: "installment", planInstallmentNo: 2, amount: 100 }),
      pay({ id: "s", planRole: "settlement", amount: 700, date: "2026-04-20" }),
    ];
    const p = plan({ status: "settled" });
    const s = planSummary(p, txs, "2026-05-01");
    expect(s.paid).toBe(1100); // لا مصروف وهمي للفرق
    expect(s.saved).toBe(100); // 800 كانت واجبة، دُفع 700
    expect(s.complete).toBe(true);
    expect(s.pct).toBe(100);
    // الأقساط الباقية أُغلقت بالسداد: لا مدفوعة ولا متأخّرة.
    const closed = s.rows.filter((r) => r.closedEarly);
    expect(closed).toHaveLength(8);
    expect(s.overdue).toBe(0);
    expect(isPlanOpen(p, txs, "2026-05-01")).toBe(false);
  });

  it("reports no saving when the settlement equals what was owed", () => {
    const txs = [pay({ id: "s", planRole: "settlement", amount: 1200 })];
    expect(planSummary(plan({ status: "settled" }), txs, "2026-05-01").saved).toBe(0);
  });
});

describe("الإلغاء لا يمحو ما دُفع", () => {
  it("keeps the paid total and stops demanding the rest", () => {
    const txs = [pay({ id: "d", planRole: "down", amount: 200 })];
    const cancelled = plan({ status: "cancelled" });
    const s = planSummary(cancelled, txs, "2026-12-31");
    expect(s.paid).toBe(200); // المعاملة باقية
    expect(s.overdue).toBe(0); // لا مطالبة بعد الإلغاء
    expect(isPlanOpen(cancelled, txs, "2026-12-31")).toBe(false);
  });
});

describe("installmentsOverview — تجميعٌ لكل الخطط", () => {
  const active = plan({ id: "a", firstDueDate: "2026-03-10", count: 2, totalPrice: 200, downPayment: 0, installmentAmount: 100 });
  const done = plan({ id: "b", status: "settled", totalPrice: 500 });

  it("counts only open plans and picks the soonest due row", () => {
    const o = installmentsOverview([active, done], [], "2026-03-11");
    expect(o.activeCount).toBe(1);
    expect(o.remainingTotal).toBe(200);
    expect(o.monthlyLoad).toBe(100);
    expect(o.next?.plan.id).toBe("a");
    expect(o.next?.row.no).toBe(1);
    expect(o.overdueCount).toBe(1); // 10 مارس فات
  });

  it("is empty when there are no plans at all", () => {
    const o = installmentsOverview([], [], "2026-03-11");
    expect(o).toEqual({ activeCount: 0, remainingTotal: 0, monthlyLoad: 0, overdueCount: 0, next: null, savedTotal: 0 });
  });
});

describe("validatePlanDraft — يمنع المستحيل ولا يمنع عدم التطابق", () => {
  const good = {
    provider: "تمارا", name: "جوّال", totalPrice: 1200, downPayment: 200,
    installmentAmount: 100, count: 10, firstDueDate: "2026-02-15",
  };
  it("accepts a sound draft", () => {
    expect(validatePlanDraft(good)).toEqual([]);
  });
  it("accepts a draft whose numbers don't add up (that is a warning, not an error)", () => {
    expect(validatePlanDraft({ ...good, totalPrice: 999 })).toEqual([]);
  });
  it("rejects an absurd installment count (input-error guard)", () => {
    expect(validatePlanDraft({ ...good, count: 500 })).toEqual([
      "عدد الأقساط أكبر من المعقول (الحدّ 120)",
    ]);
    expect(validatePlanDraft({ ...good, count: 120 })).toEqual([]);
  });

  it("rejects a missing total, count, amount or date", () => {
    expect(validatePlanDraft({ ...good, totalPrice: 0 }).length).toBe(1);
    expect(validatePlanDraft({ ...good, count: 0 }).length).toBe(1);
    expect(validatePlanDraft({ ...good, installmentAmount: 0 }).length).toBe(1);
    expect(validatePlanDraft({ ...good, firstDueDate: "غداً" }).length).toBe(1);
    expect(validatePlanDraft({ ...good, provider: "", name: "" }).length).toBe(1);
  });
});

describe("describeDueIn", () => {
  it("reads naturally in Arabic for late, today, tomorrow and later", () => {
    expect(describeDueIn(-3)).toBe("متأخّر 3 يوم");
    expect(describeDueIn(0)).toBe("اليوم");
    expect(describeDueIn(1)).toBe("غداً");
    expect(describeDueIn(5)).toBe("خلال 5 يوم");
  });
});

describe("«الأصل المؤجّل» — الشراء مهب كاش، والأقساط هي الصرف", () => {
  const principal = pay({
    id: "orig", amount: 1200, date: "2026-02-01",
    planRole: "principal", deferred: true,
  });

  it("is never counted as a payment (the plan isn't settled the moment you buy)", () => {
    const s = planSummary(plan(), [principal], "2026-02-02");
    expect(s.paid).toBe(0);
    expect(s.remaining).toBe(1200);
    expect(s.pct).toBe(0);
    expect(s.complete).toBe(false);
    expect(s.rows.every((r) => !r.paid)).toBe(true);
  });

  it("keeps the principal in the linked list but out of the payments list", () => {
    expect(planLinkedTransactions(plan(), [principal]).map((t) => t.id)).toEqual(["orig"]);
    expect(planPrincipal(plan(), [principal])?.id).toBe("orig");
  });

  it("is exposed for display and linked back through the plan", () => {
    const s = planSummary(plan({ principalTxId: "orig" }), [principal], "2026-02-02");
    expect(s.principal?.id).toBe("orig");
    expect(s.principal?.deferred).toBe(true);
  });

  it("counts only the installments as paid, alongside the principal", () => {
    const txs = [
      principal,
      pay({ id: "t1", planRole: "installment", planInstallmentNo: 1, amount: 100 }),
      pay({ id: "t2", planRole: "installment", planInstallmentNo: 2, amount: 100 }),
    ];
    const s = planSummary(plan(), txs, "2026-04-01");
    expect(s.paid).toBe(200); // لا 1400 — الأصل ليس دفعة
    expect(s.remaining).toBe(1000);
  });

  it("ignores any deferred transaction even if it carries a payment role", () => {
    const ghost = pay({ id: "g", planRole: "installment", planInstallmentNo: 1, amount: 100, deferred: true });
    expect(planSummary(plan(), [ghost], "2026-03-01").paid).toBe(0);
  });
});
