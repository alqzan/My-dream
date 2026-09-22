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
import { today, computeDailyBudgetStatus, reserveBalance } from "./utils";
import { GENERAL_FUND_NAME, SURPLUS_FUND_NAME } from "./types";

beforeEach(() => {
  useAppStore.setState({ transactions: [], deleted: {} });
});

describe("pullFromReserve — الفوائض ترجع لليومية", () => {
  const fund = (deposits: { id: string; date: string; amount: number }[]) => ({
    id: "f-surplus", name: SURPLUS_FUND_NAME, icon: "✨", color: "#c9852a",
    deposits, createdAt: "2026-01-01",
  });

  beforeEach(() => {
    useAppStore.setState({
      transactions: [], reserves: [],
      dailyBudget: { amount: 100, startDate: today() },
    });
  });

  it("يرفع رصيد اليومية بمقدار المسحوب بالضبط وينقص الصندوق مثله", () => {
    useAppStore.setState({ reserves: [fund([{ id: "d1", date: "2026-01-01", amount: 500 }])] });
    const before = computeDailyBudgetStatus(useAppStore.getState().dailyBudget!, []).balance;
    const added = useAppStore.getState().pullFromReserve("f-surplus", 200);
    expect(added).toBe(200);
    const s = useAppStore.getState();
    expect(computeDailyBudgetStatus(s.dailyBudget!, s.transactions).balance).toBe(before + 200);
    expect(reserveBalance(s.reserves[0], s.transactions)).toBe(300);
    // تحريك رصيدٍ بين وعاءين — لا معاملة صرف.
    expect(s.transactions).toHaveLength(0);
  });

  it("صرفُ اليوم يبقى محتسَباً بعد السحب (الدورة لا تُعاد من الصفر)", () => {
    useAppStore.setState({
      reserves: [fund([{ id: "d1", date: "2026-01-01", amount: 500 }])],
      transactions: [{ id: "t1", date: today(), amount: 40, category: "cat-essentials", note: "قهوة" }],
    });
    useAppStore.getState().pullFromReserve("f-surplus", 200);
    const s = useAppStore.getState();
    const status = computeDailyBudgetStatus(s.dailyBudget!, s.transactions);
    expect(status.spent).toBe(40);
    expect(status.balance).toBe(260); // 100 يوميّة + 200 فوائض − 40 صرف
  });

  it("لا يخرج من الصندوق أكثر مما فيه", () => {
    useAppStore.setState({ reserves: [fund([{ id: "d1", date: "2026-01-01", amount: 120 }])] });
    expect(useAppStore.getState().pullFromReserve("f-surplus", 500)).toBe(120);
    const s = useAppStore.getState();
    expect(reserveBalance(s.reserves[0], s.transactions)).toBe(0);
    expect(computeDailyBudgetStatus(s.dailyBudget!, s.transactions).balance).toBe(220);
  });

  it("بلا ميزانية يومية (أو بصندوقٍ فارغ أو مبلغٍ غير موجب) لا يسحب شيئاً", () => {
    useAppStore.setState({
      reserves: [fund([{ id: "d1", date: "2026-01-01", amount: 500 }])],
      dailyBudget: null,
    });
    expect(useAppStore.getState().pullFromReserve("f-surplus", 100)).toBe(0);
    useAppStore.setState({ dailyBudget: { amount: 100, startDate: today() } });
    expect(useAppStore.getState().pullFromReserve("f-surplus", 0)).toBe(0);
    expect(useAppStore.getState().pullFromReserve("f-surplus", -50)).toBe(0);
    expect(useAppStore.getState().pullFromReserve("مفقود", 50)).toBe(0);
    useAppStore.setState({ reserves: [fund([])] });
    expect(useAppStore.getState().pullFromReserve("f-surplus", 50)).toBe(0);
    const s = useAppStore.getState();
    expect(s.reserves[0].deposits).toHaveLength(0);
  });

  it("الترحيل ثمّ الإرجاع يعيد الرصيد كما كان (رحلة كاملة)", () => {
    useAppStore.setState({
      reserves: [fund([])],
      dailyBudget: { amount: 100, startDate: today(), carryAdjust: -300 }, // رصيد 400
    });
    const before = computeDailyBudgetStatus(useAppStore.getState().dailyBudget!, []).balance;
    expect(before).toBe(400);
    useAppStore.getState().sweepToReserve("f-surplus", 400);
    let s = useAppStore.getState();
    expect(computeDailyBudgetStatus(s.dailyBudget!, s.transactions).balance).toBe(0);
    useAppStore.getState().pullFromReserve("f-surplus", 400);
    s = useAppStore.getState();
    expect(computeDailyBudgetStatus(s.dailyBudget!, s.transactions).balance).toBe(before);
    expect(reserveBalance(s.reserves[0], s.transactions)).toBe(0);
  });
});

describe("startTrip — المظاريف العامة تبقى أوعيةً لا رحلات", () => {
  it("لا يضيف رحلة إلى «عام» أو «الفوائض»", () => {
    const general = { id: "f-general", name: GENERAL_FUND_NAME, icon: "🏠", color: "#000", deposits: [], createdAt: today() };
    const surplus = { id: "f-surplus", name: SURPLUS_FUND_NAME, icon: "✨", color: "#000", deposits: [], createdAt: today() };
    useAppStore.setState({ reserves: [general, surplus] });
    useAppStore.getState().startTrip(general.id);
    useAppStore.getState().startTrip(surplus.id);
    expect(useAppStore.getState().reserves.map((f) => f.trips)).toEqual([undefined, undefined]);
  });

  it("لا يغلق رحلة مظروف مخصّص عند محاولة البدء من مظروف محمي", () => {
    const general = { id: "f-general", name: GENERAL_FUND_NAME, icon: "🏠", color: "#000", deposits: [], createdAt: today() };
    const tripFund = {
      id: "f-trip", name: "رحلة", icon: "✈️", color: "#000", deposits: [], createdAt: today(),
      trips: [{ id: "trip-1", startedAt: today() }],
    };
    useAppStore.setState({ reserves: [general, tripFund] });
    useAppStore.getState().startTrip(general.id);
    expect(useAppStore.getState().reserves[1].trips).toEqual(tripFund.trips);
  });
});

describe("deleteReserve — يحمي أوعية الحساب وينظف وجهة الكاش باك", () => {
  it("hydrate يطبّع هوية المظاريف والتقسيمات القديمة قبل عرضها", () => {
    useAppStore.getState().hydrate({
      reserves: [{ id: "legacy", name: SURPLUS_FUND_NAME, icon: "✨", color: "#000", deposits: [], createdAt: today() }],
      transactions: [{
        id: "t", date: today(), amount: 100, category: "cat-essentials", note: "",
        reserveSplits: [{ fundId: "legacy", pct: 60 }, { fundId: "legacy", pct: 20 }],
      }],
    });
    const s = useAppStore.getState();
    expect(s.reserves[0].role).toBe("surplus");
    expect(s.transactions[0].reserveSplits).toEqual([{ fundId: "legacy", pct: 80 }]);
  });

  it("لا يحذف «عام» أو «الفوائض» لأنهما جزء من دفتر المال", () => {
    const general = { id: "f-general", name: GENERAL_FUND_NAME, icon: "🏠", color: "#000", deposits: [], createdAt: today() };
    const surplus = { id: "f-surplus", name: SURPLUS_FUND_NAME, icon: "✨", color: "#000", deposits: [], createdAt: today() };
    useAppStore.setState({ reserves: [general, surplus] });

    useAppStore.getState().deleteReserve(general.id);
    useAppStore.getState().deleteReserve(surplus.id);

    expect(useAppStore.getState().reserves.map((fund) => fund.id)).toEqual([general.id, surplus.id]);
  });

  it("يحافظ على دور الحساب المحجوز عند محاولة إعادة تسميته", () => {
    const surplus = { id: "f-surplus", name: SURPLUS_FUND_NAME, role: "surplus" as const, icon: "✨", color: "#000", deposits: [], createdAt: today() };
    useAppStore.setState({ reserves: [surplus] });
    useAppStore.getState().updateReserve(surplus.id, { name: "رحلة" });
    expect(useAppStore.getState().reserves[0]).toMatchObject({ role: "surplus", name: SURPLUS_FUND_NAME });
  });

  it("يحمي المظروف القديم بالاسم حتى قبل اكتمال التطبيع", () => {
    const legacy = { id: "legacy-surplus", name: SURPLUS_FUND_NAME, icon: "✨", color: "#000", deposits: [], createdAt: today() };
    useAppStore.setState({ reserves: [legacy] });
    useAppStore.getState().updateReserve(legacy.id, { name: "رحلة" });
    expect(useAppStore.getState().reserves[0]).toMatchObject({ role: "surplus", name: SURPLUS_FUND_NAME });
  });

  it("يبقي إعادة تسمية المظروف العادي متاحة", () => {
    const fund = { id: "f-custom", name: "سفر", icon: "✈️", color: "#000", deposits: [], createdAt: today() };
    useAppStore.setState({ reserves: [fund] });
    useAppStore.getState().updateReserve(fund.id, { name: "رحلة المدينة" });
    expect(useAppStore.getState().reserves[0].name).toBe("رحلة المدينة");
  });

  it("يعطّل الكاش باك إذا حُذف الظرف المعيّن له", () => {
    const cashback = { id: "f-cashback", name: "كاش باك", icon: "💳", color: "#000", deposits: [], createdAt: today() };
    const other = { id: "f-other", name: "سفر", icon: "✈️", color: "#000", deposits: [], createdAt: today() };
    useAppStore.setState({
      reserves: [cashback, other],
      cashbackEnabled: true,
      cashbackEnvelopeId: cashback.id,
      transactions: [{
        id: "t1", date: today(), amount: 10, category: "cat-essentials", note: "عملية",
        reserveSplits: [{ fundId: cashback.id, pct: 100 }],
      }],
    });

    useAppStore.getState().deleteReserve(cashback.id);
    const state = useAppStore.getState();
    expect(state.cashbackEnabled).toBe(false);
    expect(state.cashbackEnvelopeId).toBeUndefined();
    expect(state.reserves.map((fund) => fund.id)).toEqual([other.id]);
    expect(state.transactions[0].reserveSplits).toEqual([]);
  });
});
