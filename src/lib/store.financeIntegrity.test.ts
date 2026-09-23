import { describe, it, expect, vi, beforeEach } from "vitest";

// المتجرُ المحفوظ يكلّم IndexedDB عبر idb-keyval؛ نُبدله ليُقلع في Node بلا متصفّح.
const idb = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => { idb.set(k, v); },
  del: async (k: string) => { idb.delete(k); },
}));

import { useAppStore } from "./store";
import { mergeAppData } from "./merge";
import { parseBankSmsEvent, type SmsParseEventResult } from "./bankParser";
import { today, reserveBalance } from "./utils";
import { cycleLength } from "./budgetCycle";
import { SURPLUS_FUND_NAME } from "./types";
import type { Account, ReserveFund } from "./types";
import { holdings } from "./reconcile";

const T = today();
const state = () => useAppStore.getState();

const fund = (over: Partial<ReserveFund> & { id: string; name: string }): ReserveFund => ({
  icon: "📦", color: "#000", deposits: [], createdAt: T, ...over,
});

beforeEach(() => {
  useAppStore.setState({
    transactions: [], reserves: [], deleted: {}, reconciles: [],
    inboxEvents: [], inboxDecisions: [], accounts: [], obligations: [],
    observedBalances: [], settlements: [], settlementResolutions: [],
    salaryDay: 27, lastSalaryConfirm: null, fieldUpdatedAt: {},
    dailyBudget: { amount: 100, startDate: T, carryAdjust: 100 },
  });
});

describe("confirmSalary — سحبُ «الفوائض» لكلّ مظروفٍ على حدة", () => {
  it("مظروفان ممَوَّلان من الفوائض: يُسحب المجموعُ كلُّه ولا يُخلق مال", () => {
    useAppStore.setState({
      reserves: [
        fund({ id: "f-surplus", name: SURPLUS_FUND_NAME, role: "surplus", deposits: [{ id: "d0", date: T, amount: 1000 }] }),
        fund({ id: "a", name: "أ", funding: { perCycle: 200, source: "surplus" } }),
        fund({ id: "b", name: "ب", funding: { perCycle: 300, source: "surplus" } }),
      ],
    });
    expect(cycleLength(27, T)).toBeGreaterThan(0);
    state().confirmSalary(0);
    const s = state();
    const bal = (id: string) => reserveBalance(s.reserves.find((f) => f.id === id)!, s.transactions);
    expect(bal("a")).toBe(200);
    expect(bal("b")).toBe(300);
    expect(bal("f-surplus")).toBe(500);
    expect(bal("f-surplus") + bal("a") + bal("b")).toBe(1000);
    // والتأكيدُ الثاني في اليوم نفسِه لا يسحب مرّةً أخرى.
    useAppStore.setState({ lastSalaryConfirm: null });
    state().confirmSalary(0);
    expect(reserveBalance(state().reserves.find((f) => f.id === "f-surplus")!, state().transactions)).toBe(500);
  });
});

describe("الشواهد — معرّفٌ انتقل بين مجموعتين لم يُحذف", () => {
  it("رسالةٌ اعتُمدت بعد المراجعة تبقى معاملةً بعد الدمج", () => {
    const ev = parseBankSmsEvent("شراء\nمبلغ: SAR 55\nلدى: كافيه", "2026-09-20", { sourceId: "src1", sourceIndex: 0 })!;
    expect(ev).toBeTruthy();
    expect(state().importInboxEvents([ev]).reviewed).toBe(1);
    state().confirmInboxEvent(ev);
    expect(state().transactions.some((t) => t.id === ev.eventId)).toBe(true);
    const snap = state().snapshot();
    expect(snap.deleted?.[ev.eventId!]).toBeUndefined();
    expect(mergeAppData(snap, snap).transactions.some((t) => t.id === ev.eventId)).toBe(true);
  });

  it("حذفُ معاملةٍ مستوردة يبقى حذفاً ويُختم شاهده", () => {
    const ev = parseBankSmsEvent("شراء\nمبلغ: SAR 55\nلدى: كافيه", "2026-09-20", { sourceId: "src1", sourceIndex: 0 })!;
    state().importInboxEvents([ev]);
    state().confirmInboxEvent(ev);
    state().deleteTransaction(ev.eventId!);
    const snap = state().snapshot();
    expect(snap.deleted?.[ev.eventId!]).toBeDefined();
    // نسخةٌ قديمة على جهازٍ آخر ما زالت تحمل المعاملة — لا تُبعث.
    const stale = { ...snap, transactions: [{ id: ev.eventId!, date: "2026-09-20", amount: 55, category: "cat-essentials", note: "كافيه", updatedAt: 1 }] };
    expect(mergeAppData(snap, stale).transactions.some((t) => t.id === ev.eventId)).toBe(false);
  });

  it("حذفُ معاملةٍ يدوية ما زال يختم شاهداً", () => {
    useAppStore.setState({ transactions: [{ id: "m1", date: T, amount: 10, category: "cat-essentials", note: "x" }] });
    state().deleteTransaction("m1");
    expect(state().deleted?.m1).toBeDefined();
  });
});

const accountEvent = (over: Partial<SmsParseEventResult> = {}): SmsParseEventResult => ({
  eventId: "e1", rawText: "شراء بطاقة 1234", amount: 20, kind: "purchase", direction: "out",
  category: "cat-essentials", note: "متجر", date: "2026-09-20", confidence: "template",
  bank: "bank", account: "1234", accountId: "bank:card:1234", ...over,
} as SmsParseEventResult);

describe("الحسابات — التحديث الآليّ لا يغلب تعديل المالك", () => {
  const owned: Account = {
    id: "bank:card:1234", bank: "bank", last4: "1234", kind: "card", fundingKind: "debit",
    label: "بطاقتي", isOwn: true, firstSeen: "2026-09-01", lastSeen: "2026-09-01", updatedAt: 1000,
  };

  it("رسالةٌ جديدة لا ترفع طابعَ الحساب ولا تكتب فوق طبيعة تمويله", () => {
    useAppStore.setState({ accounts: [owned] });
    state().importInboxEvents([accountEvent({ balanceKind: "credit_available", balanceAfter: 500 })], { confirmed: true });
    const acc = state().accounts!.find((a) => a.id === owned.id)!;
    expect(acc.fundingKind).toBe("debit");
    expect(acc.lastSeen).toBe("2026-09-20");
    expect(acc.updatedAt).toBe(1000);
  });

  it("المجهولُ وحده يملؤه الدليلُ الآليّ", () => {
    useAppStore.setState({ accounts: [{ ...owned, fundingKind: "unknown" }] });
    state().importInboxEvents([accountEvent({ balanceKind: "credit_available", balanceAfter: 500 })], { confirmed: true });
    expect(state().accounts!.find((a) => a.id === owned.id)!.fundingKind).toBe("credit");
  });

  it("الدمج: تسميةُ المالك تغلب، و«آخرُ ظهور» يُؤخذ من الأحدث", () => {
    const base = state().snapshot();
    const renamed = { ...base, accounts: [{ ...owned, label: "الجديدة", updatedAt: 2000 }] };
    const imported = { ...base, accounts: [{ ...owned, lastSeen: "2026-09-20", updatedAt: 1000 }] };
    const merged = mergeAppData(renamed, imported).accounts!.find((a) => a.id === owned.id)!;
    expect(merged.label).toBe("الجديدة");
    expect(merged.lastSeen).toBe("2026-09-20");
  });
});

describe("رسائل الأقساط لا تُنشئ التزامات", () => {
  it("قسطٌ مستورد يُسجَّل مصروفاً ولا يلمس `obligations`", () => {
    const old = { id: "legacy", kind: "loan" as const, source: "bank", label: "قديم", outstanding: 1, perPeriod: 1, observedAt: "2026-01-01" };
    useAppStore.setState({ obligations: [old] });
    state().importInboxEvents([accountEvent({ eventId: "inst1", kind: "installment", amount: 900, debtRemaining: 9000 })], { confirmed: true });
    expect(state().transactions.some((t) => t.id === "inst1")).toBe(true);
    expect(state().obligations).toEqual([old]);
  });
});

describe("startTrip — هدفٌ غير صالح لا يغيّر شيئاً", () => {
  it("لا يختم الإعدادات المفردة ولا lastUpdated", () => {
    useAppStore.setState({ lastUpdated: "2026-01-01T00:00:00.000Z", fieldUpdatedAt: {} });
    state().startTrip("missing");
    expect(state().lastUpdated).toBe("2026-01-01T00:00:00.000Z");
    expect(state().fieldUpdatedAt).toEqual({});
  });
});

describe("المطابقة والقرارات — معرّفاتٌ ثابتة", () => {
  it("مطابقةٌ ثانية في اليوم نفسِه لا تُضيف تسويةً ثانية", () => {
    useAppStore.setState({
      reserves: [fund({ id: "f-surplus", name: SURPLUS_FUND_NAME, role: "surplus", deposits: [{ id: "d0", date: "2026-01-01", amount: 1000 }] })],
      dailyBudget: { amount: 100, startDate: T },
    });
    const expected = holdings(state()).expected;
    const first = state().recordReconcile(expected - 250)!;
    const second = state().recordReconcile(expected - 600)!;
    expect(second.id).toBe(first.id);
    expect(first.id).toBe(`reconcile:${T}`);
    const s = state();
    expect(s.reconciles).toHaveLength(1);
    expect(reserveBalance(s.reserves[0], s.transactions)).toBe(750);
  });

  it("قرارُ تسويةٍ بمعرّفٍ مسجَّل لا يُعاد ولا يُستبدل", () => {
    useAppStore.setState({
      accounts: [{ id: "bank:card:9", bank: "bank", last4: "9", kind: "card", fundingKind: "credit", isOwn: true, firstSeen: "2026-01-01", lastSeen: "2026-01-01" }],
      reserves: [fund({ id: "f-surplus", name: SURPLUS_FUND_NAME, role: "surplus", deposits: [{ id: "d0", date: "2026-01-01", amount: 10000 }] })],
    });
    state().addCardSettlement({ id: "set1", cardId: "bank:card:9", amount: 1000, date: "2026-01-02" });
    const res = { id: "resolution:set1:opening_debt", cardId: "bank:card:9", kind: "opening_debt" as const, amount: 400, date: "2026-01-02", settlementIds: ["set1"] };
    state().resolveSettlement(res);
    state().resolveSettlement({ ...res, amount: 600 });
    const s = state();
    expect(s.settlementResolutions).toHaveLength(1);
    expect(s.settlementResolutions![0].amount).toBe(400);
    expect(s.transactions.filter((t) => t.kind === "opening_debt").map((t) => t.amount)).toEqual([400]);
  });
});
