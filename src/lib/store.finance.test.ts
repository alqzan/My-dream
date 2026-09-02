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
import { SURPLUS_FUND_NAME } from "./types";

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
