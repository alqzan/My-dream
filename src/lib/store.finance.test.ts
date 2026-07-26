import { describe, it, expect, vi, beforeEach } from "vitest";

// The persisted store talks to IndexedDB via idb-keyval; stub it so the store
// boots in plain Node without a browser.
const idb = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => { idb.set(k, v); },
  del: async (k: string) => { idb.delete(k); },
}));

import { useAppStore } from "./store";
import { planSummary, planSchedule } from "./installments";
import { today, cashOut, dailyShare, computeDailyBudgetStatus } from "./utils";
import type { InstallmentPlan, RecurringTransaction, Transaction } from "./types";

const rule = (over: Partial<RecurringTransaction> & { id: string }): RecurringTransaction => ({
  amount: 500, category: "cat-essentials", note: "إيجار", unit: "شهري", every: 1,
  dayOfMonth: 1, anchorDate: "2026-01-01", active: true, ...over,
});

const plan = (over: Partial<InstallmentPlan> = {}): InstallmentPlan => ({
  id: "p1", provider: "تمارا", name: "جوّال", totalPrice: 1200, downPayment: 200,
  installmentAmount: 100, count: 10, firstDueDate: "2026-02-15",
  status: "active", createdAt: "2026-02-01", ...over,
});

beforeEach(() => {
  useAppStore.setState({ transactions: [], recurring: [], installmentPlans: [], deleted: {} });
});

describe("runRecurring — idempotent (لا معاملة مكرّرة)", () => {
  it("running twice in a row generates the occurrence exactly once", () => {
    useAppStore.setState({ recurring: [rule({ id: "R1", anchorDate: "2026-01-01" })] });
    const first = useAppStore.getState().runRecurring();
    const before = useAppStore.getState().transactions.length;
    const second = useAppStore.getState().runRecurring();
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
    expect(useAppStore.getState().transactions).toHaveLength(before);
  });

  it("does not re-add an occurrence that arrived from another device (same deterministic id)", () => {
    // lastGenerated فارغ (كما لو رجع بدمجٍ قديم) لكن المعاملة موجودة أصلاً —
    // الحارس على المعرّف الحتميّ يمنع النسخة الثانية.
    const dueId = "rec_R1_2026-01-01";
    useAppStore.setState({
      recurring: [rule({ id: "R1", anchorDate: "2026-01-01" })],
      transactions: [{ id: dueId, date: "2026-01-01", amount: 500, category: "cat-essentials", note: "إيجار (تلقائي)" }],
    });
    useAppStore.getState().runRecurring();
    const dupes = useAppStore.getState().transactions.filter((t) => t.id === dueId);
    expect(dupes).toHaveLength(1);
    // ومع ذلك تقدّم lastGenerated فلا يُعاد الفحص كل مرّة.
    expect(useAppStore.getState().recurring[0].lastGenerated).toBeTruthy();
  });

  it("lastGenerated never rewinds, even if the stored value is ahead of the computed due date", () => {
    const ahead = "2099-01-01";
    useAppStore.setState({ recurring: [rule({ id: "R1", lastGenerated: ahead })] });
    useAppStore.getState().runRecurring();
    expect(useAppStore.getState().recurring[0].lastGenerated).toBe(ahead);
    expect(useAppStore.getState().transactions).toHaveLength(0);
  });

  it("a reminder-mode rule never generates a transaction", () => {
    useAppStore.setState({
      recurring: [rule({ id: "R1", anchorDate: "2026-01-01", generationMode: "reminder" })],
    });
    expect(useAppStore.getState().runRecurring()).toBe(0);
    expect(useAppStore.getState().transactions).toHaveLength(0);
    expect(useAppStore.getState().recurring[0].lastGenerated).toBeUndefined();
  });

  it("a rule with no generationMode is treated as auto (legacy data)", () => {
    const legacy = rule({ id: "R1", anchorDate: "2026-01-01" });
    expect(legacy.generationMode).toBeUndefined();
    useAppStore.setState({ recurring: [legacy] });
    expect(useAppStore.getState().runRecurring()).toBeGreaterThan(0);
  });

  it("an inactive rule generates nothing", () => {
    useAppStore.setState({ recurring: [rule({ id: "R1", active: false, anchorDate: "2026-01-01" })] });
    expect(useAppStore.getState().runRecurring()).toBe(0);
  });

  it("generation does not stamp updatedAt (so it can't outrank a real edit on merge)", () => {
    useAppStore.setState({ recurring: [rule({ id: "R1", anchorDate: "2026-01-01", updatedAt: 42 })] });
    useAppStore.getState().runRecurring();
    expect(useAppStore.getState().recurring[0].updatedAt).toBe(42);
  });
});

describe("recurring actions — أختام التعديل", () => {
  it("addRecurring / updateRecurring stamp updatedAt", () => {
    useAppStore.getState().addRecurring(rule({ id: "R1" }));
    const added = useAppStore.getState().recurring[0];
    expect(added.updatedAt).toBeGreaterThan(0);
    useAppStore.getState().updateRecurring("R1", { amount: 900 });
    const edited = useAppStore.getState().recurring[0];
    expect(edited.amount).toBe(900);
    expect(edited.updatedAt).toBeGreaterThanOrEqual(added.updatedAt!);
  });

  it("deleting a rule writes a tombstone, and re-adding it (undo) lifts it", () => {
    useAppStore.getState().addRecurring(rule({ id: "R1" }));
    useAppStore.getState().deleteRecurring("R1");
    expect(useAppStore.getState().deleted?.R1).toBeGreaterThan(0);
    useAppStore.getState().addRecurring(rule({ id: "R1" }));
    expect(useAppStore.getState().deleted?.R1).toBeUndefined();
  });
});

describe("الأقساط — تسجيل الدفعات", () => {
  beforeEach(() => {
    useAppStore.setState({ transactions: [], installmentPlans: [] });
    useAppStore.getState().addInstallmentPlan(plan());
  });

  it("stores the plan with an edit stamp", () => {
    const p = useAppStore.getState().installmentPlans[0];
    expect(p.id).toBe("p1");
    expect(p.updatedAt).toBeGreaterThan(0);
  });

  it("a recorded payment is a real transaction carrying exactly one role", () => {
    const id = useAppStore.getState().recordInstallmentPayment("p1", {
      role: "installment", amount: 100, installmentNo: 1, date: "2026-02-15",
    });
    const t = useAppStore.getState().transactions.find((x) => x.id === id)!;
    expect(t.amount).toBe(100);
    expect(t.planId).toBe("p1");
    expect(t.planRole).toBe("installment");
    expect(t.planInstallmentNo).toBe(1);
    expect(t.planLinkedAt).toBeGreaterThan(0);
    // دورٌ واحد فقط: الحقل مفردٌ بنيوياً، فلا يمكن أن تكون قسطاً ودفعةً أولى معاً.
    const roles = Object.keys(t).filter((k) => k === "planRole");
    expect(roles).toHaveLength(1);
  });

  it("a down payment carries no installment number", () => {
    const id = useAppStore.getState().recordInstallmentPayment("p1", { role: "down", amount: 200 });
    const t = useAppStore.getState().transactions.find((x) => x.id === id)!;
    expect(t.planRole).toBe("down");
    expect(t.planInstallmentNo).toBeUndefined();
  });

  it("two payments for the same installment stay two transactions (no id collision)", () => {
    const a = useAppStore.getState().recordInstallmentPayment("p1", { role: "installment", amount: 60, installmentNo: 1 });
    const b = useAppStore.getState().recordInstallmentPayment("p1", { role: "installment", amount: 40, installmentNo: 1 });
    expect(a).not.toBe(b);
    const rows = planSchedule(
      useAppStore.getState().installmentPlans[0],
      useAppStore.getState().transactions,
      today()
    );
    expect(rows[0].paid).toBe(true); // 60 + 40 = القسط كاملاً
    expect(rows[0].txIds).toHaveLength(2);
  });

  it("rejects a payment for a missing plan or a non-positive amount", () => {
    expect(useAppStore.getState().recordInstallmentPayment("nope", { role: "installment", amount: 100 })).toBe("");
    expect(useAppStore.getState().recordInstallmentPayment("p1", { role: "installment", amount: 0 })).toBe("");
    expect(useAppStore.getState().transactions).toHaveLength(0);
  });

  it("early settlement records only the actual amount and closes the plan", () => {
    useAppStore.getState().recordInstallmentPayment("p1", { role: "down", amount: 200 });
    const id = useAppStore.getState().settleInstallmentPlan("p1", 700);
    const st = useAppStore.getState();
    const t = st.transactions.find((x) => x.id === id)!;
    expect(t.amount).toBe(700);
    expect(t.planRole).toBe("settlement");
    expect(st.installmentPlans[0].status).toBe("settled");
    // لا مصروف وهمي للفرق: معاملتان فقط (الأولى + السداد).
    expect(st.transactions.filter((x) => x.planId === "p1")).toHaveLength(2);
    const s = planSummary(st.installmentPlans[0], st.transactions, today());
    expect(s.paid).toBe(900);
    expect(s.saved).toBe(300); // كان الواجب 1000، دُفع 700
  });

  it("cancelling keeps every recorded payment", () => {
    useAppStore.getState().recordInstallmentPayment("p1", { role: "down", amount: 200 });
    useAppStore.getState().cancelInstallmentPlan("p1");
    const st = useAppStore.getState();
    expect(st.installmentPlans[0].status).toBe("cancelled");
    expect(st.transactions).toHaveLength(1);
  });

  it("deleting a plan is a tombstone only — the payments stay in the ledger", () => {
    useAppStore.getState().recordInstallmentPayment("p1", { role: "down", amount: 200 });
    useAppStore.getState().deleteInstallmentPlan("p1");
    const st = useAppStore.getState();
    expect(st.installmentPlans).toHaveLength(0);
    expect(st.deleted?.p1).toBeGreaterThan(0);
    expect(st.transactions).toHaveLength(1);
    expect(st.transactions[0].planId).toBe("p1");
    // التراجع يعيد الخطة ويرفع الشاهد.
    useAppStore.getState().addInstallmentPlan(plan());
    expect(useAppStore.getState().deleted?.p1).toBeUndefined();
  });

  it("editing the plan recalculates the schedule (it is derived, never stored)", () => {
    useAppStore.getState().updateInstallmentPlan("p1", { count: 3, installmentAmount: 400, totalPrice: 1400 });
    const st = useAppStore.getState();
    const rows = planSchedule(st.installmentPlans[0], st.transactions, today());
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.amount)).toEqual([400, 400, 400]);
  });

  it("linkInstallmentReminder creates a reminder-only rule (never auto-generates)", () => {
    useAppStore.getState().linkInstallmentReminder("p1");
    const st = useAppStore.getState();
    const r = st.recurring.find((x) => x.planId === "p1")!;
    expect(r.generationMode).toBe("reminder");
    expect(st.installmentPlans[0].recurringId).toBe(r.id);
    // لا يولّد شيئاً ولو فات موعده بسنين.
    expect(useAppStore.getState().runRecurring()).toBe(0);
    // ولا يُنشئ تذكيراً ثانياً عند تكرار النداء.
    useAppStore.getState().linkInstallmentReminder("p1");
    expect(useAppStore.getState().recurring.filter((x) => x.planId === "p1")).toHaveLength(1);
  });
});

describe("snapshot/hydrate — الأقساط تدخل المزامنة والنسخ الاحتياطي", () => {
  it("round-trips installmentPlans", () => {
    useAppStore.getState().addInstallmentPlan(plan());
    const snap = useAppStore.getState().snapshot();
    expect(snap.installmentPlans).toHaveLength(1);
    useAppStore.getState().hydrate({ ...snap, installmentPlans: [] });
    expect(useAppStore.getState().installmentPlans).toHaveLength(0);
    useAppStore.getState().hydrate(snap);
    expect(useAppStore.getState().installmentPlans[0].id).toBe("p1");
  });

  it("hydrating a legacy snapshot without the field yields an empty list (no crash)", () => {
    const snap = useAppStore.getState().snapshot();
    const legacy = { ...snap } as Partial<typeof snap>;
    delete legacy.installmentPlans;
    useAppStore.getState().hydrate(legacy);
    expect(useAppStore.getState().installmentPlans).toEqual([]);
  });
});

describe("مهاجرة v14", () => {
  it("adds installmentPlans and stamps legacy recurring rules as auto", async () => {
    // نستدعي migrate عبر واجهة persist نفسها (المصدر الوحيد للمنطق).
    const persisted = {
      recurring: [{ id: "R1", amount: 100, category: "c", note: "n", unit: "شهري", every: 1, dayOfMonth: 1, anchorDate: "2026-01-01", active: true }],
      quranHifz: { plan: null, frontierId: 0, sessions: [], reviews: [], planId: "l:none" },
    };
    const migrate = useAppStore.persist.getOptions().migrate!;
    const out = (await migrate(persisted, 13)) as { recurring: RecurringTransaction[]; installmentPlans: InstallmentPlan[] };
    expect(out.installmentPlans).toEqual([]);
    expect(out.recurring[0].generationMode).toBe("auto");
    expect(out.recurring[0].updatedAt).toBe(0); // يفوز عليه أيّ تعديلٍ حقيقيّ لاحق
    // لا معاملةً أنشأتها المهاجرة ولا حذفتها.
    expect((out as unknown as { transactions?: Transaction[] }).transactions).toBeUndefined();
  });

  it("keeps an explicit reminder mode and a real updatedAt untouched", async () => {
    const migrate = useAppStore.persist.getOptions().migrate!;
    const out = (await migrate({
      recurring: [{ id: "R1", amount: 100, category: "c", note: "n", unit: "شهري", every: 1, dayOfMonth: 1, anchorDate: "2026-01-01", active: true, generationMode: "reminder", updatedAt: 777 }],
    }, 13)) as { recurring: RecurringTransaction[] };
    expect(out.recurring[0].generationMode).toBe("reminder");
    expect(out.recurring[0].updatedAt).toBe(777);
  });
});

describe("الشراء المؤجّل — «قسّط هذا المصروف» لا يحتسبه مرّتين", () => {
  beforeEach(() => {
    useAppStore.setState({ transactions: [], installmentPlans: [], dailyBudget: null });
  });

  const buy = (): Transaction => ({
    id: "buy1", date: today(), amount: 1200, category: "cat-luxuries", note: "جوّال",
  });

  it("turns the expense into the plan's deferred principal", () => {
    useAppStore.setState({ transactions: [buy()] });
    const planId = useAppStore.getState().convertTransactionToPlan("buy1", {
      provider: "تمارا", installmentAmount: 300, count: 4, firstDueDate: "2026-09-01",
    });
    const st = useAppStore.getState();
    const plan = st.installmentPlans.find((p) => p.id === planId)!;
    const tx = st.transactions.find((t) => t.id === "buy1")!;

    expect(plan.totalPrice).toBe(1200); // الإجمالي = مبلغ المعاملة بلا كتابةٍ ثانية
    expect(plan.principalTxId).toBe("buy1");
    expect(plan.name).toBe("جوّال");
    expect(plan.category).toBe("cat-luxuries");
    expect(tx.deferred).toBe(true);
    expect(tx.planRole).toBe("principal");
    expect(tx.planId).toBe(planId);
  });

  it("the deferred principal spends nothing: zero daily share and zero month spend", () => {
    useAppStore.setState({ transactions: [buy()] });
    const planId = useAppStore.getState().convertTransactionToPlan("buy1", {
      provider: "تمارا", installmentAmount: 300, count: 4, firstDueDate: today(),
    });
    const st = useAppStore.getState();
    const tx = st.transactions.find((t) => t.id === "buy1")!;
    expect(cashOut(tx)).toBe(0);
    expect(dailyShare(tx)).toBe(0);

    // الميزانية اليومية لا تتأثّر بالشراء، وتتأثّر بالقسط وحده.
    const budget = { amount: 100, startDate: today() };
    expect(computeDailyBudgetStatus(budget, st.transactions).spent).toBe(0);
    useAppStore.getState().payNextInstallment(planId);
    const after = useAppStore.getState().transactions;
    expect(computeDailyBudgetStatus(budget, after).spent).toBe(300);
  });

  it("the plan progresses only through the installments (1200 counted once)", () => {
    useAppStore.setState({ transactions: [buy()] });
    const planId = useAppStore.getState().convertTransactionToPlan("buy1", {
      provider: "تمارا", installmentAmount: 300, count: 4, firstDueDate: "2026-01-05",
    });
    const paid = () => {
      const st = useAppStore.getState();
      return planSummary(st.installmentPlans.find((p) => p.id === planId)!, st.transactions, today());
    };
    expect(paid().paid).toBe(0);
    useAppStore.getState().payNextInstallment(planId);
    useAppStore.getState().payNextInstallment(planId);
    expect(paid().paid).toBe(600);
    expect(paid().remaining).toBe(600);
    // مجموع النقد الخارج فعلاً = 600 لا 1800.
    const cash = useAppStore.getState().transactions.reduce((s, t) => s + cashOut(t), 0);
    expect(cash).toBe(600);
  });

  it("unlinking the principal makes it a normal expense again", () => {
    useAppStore.setState({ transactions: [buy()] });
    useAppStore.getState().convertTransactionToPlan("buy1", {
      provider: "تمارا", installmentAmount: 300, count: 4, firstDueDate: "2026-09-01",
    });
    useAppStore.getState().unlinkTransactionFromPlan("buy1");
    const st = useAppStore.getState();
    const tx = st.transactions.find((t) => t.id === "buy1")!;
    expect(tx.deferred).toBeUndefined();
    expect(tx.planId).toBeUndefined();
    expect(cashOut(tx)).toBe(1200);
    expect(st.installmentPlans[0].principalTxId).toBeUndefined();
  });

  it("refuses to convert a missing transaction", () => {
    expect(useAppStore.getState().convertTransactionToPlan("nope", {
      provider: "x", installmentAmount: 10, count: 2, firstDueDate: "2026-09-01",
    })).toBe("");
  });
});

describe("الطريق اليوميّ — ضغطةٌ واحدة وربطُ مصروفٍ قائم", () => {
  beforeEach(() => {
    useAppStore.setState({ transactions: [], installmentPlans: [] });
    useAppStore.getState().addInstallmentPlan(plan({ firstDueDate: "2026-01-15", count: 3, installmentAmount: 100, totalPrice: 500, downPayment: 200 }));
  });

  it("payNextInstallment pays the earliest unpaid row, then the next one", () => {
    const first = useAppStore.getState().payNextInstallment("p1");
    const t1 = useAppStore.getState().transactions.find((t) => t.id === first)!;
    expect(t1.amount).toBe(100);
    expect(t1.planInstallmentNo).toBe(1);
    expect(t1.date).toBe(today()); // تاريخ اليوم بلا سؤال
    useAppStore.getState().payNextInstallment("p1");
    const nos = useAppStore.getState().transactions.map((t) => t.planInstallmentNo).sort();
    expect(nos).toEqual([1, 2]);
  });

  it("returns an empty id once every installment is covered (nothing left to pay)", () => {
    for (let i = 0; i < 3; i++) useAppStore.getState().payNextInstallment("p1");
    expect(useAppStore.getState().payNextInstallment("p1")).toBe("");
    expect(useAppStore.getState().transactions).toHaveLength(3);
  });

  it("links an already-logged expense to a plan without creating a second one", () => {
    useAppStore.setState({ transactions: [{ id: "x1", date: today(), amount: 100, category: "c", note: "قسط تمارا" }] });
    useAppStore.getState().linkTransactionToPlan("x1", { planId: "p1", role: "installment", installmentNo: 1 });
    const st = useAppStore.getState();
    expect(st.transactions).toHaveLength(1); // لا إدخالٌ مزدوج
    const t = st.transactions[0];
    expect(t.planId).toBe("p1");
    expect(t.deferred).toBeUndefined(); // دفعةٌ نقدية فعلية — تُحتسب كالعادة
    expect(cashOut(t)).toBe(100);
    expect(planSummary(st.installmentPlans[0], st.transactions, today()).paid).toBe(100);
  });

  it("ignores a link to a plan that doesn't exist", () => {
    useAppStore.setState({ transactions: [{ id: "x1", date: today(), amount: 100, category: "c", note: "" }] });
    useAppStore.getState().linkTransactionToPlan("x1", { planId: "ghost", role: "installment" });
    expect(useAppStore.getState().transactions[0].planId).toBeUndefined();
  });
});
