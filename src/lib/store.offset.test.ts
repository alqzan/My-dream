import { describe, it, expect, vi, beforeEach } from "vitest";

// المتجر المحفوظ يكتب في IndexedDB عبر idb-keyval — نُبدّله ليقلع في Node.
const idb = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => { idb.set(k, v); },
  del: async (k: string) => { idb.delete(k); },
}));

import { useAppStore } from "./store";
import { today, computeDailyBudgetStatus, reserveBalance } from "./utils";
import { SURPLUS_FUND_NAME } from "./types";
import type { Transaction } from "./types";

const T = today();
const surplusFund = (amount: number) => ({
  id: "f-surplus", name: SURPLUS_FUND_NAME, icon: "✨", color: "#c9852a",
  deposits: amount ? [{ id: "d1", date: T, amount }] : [], createdAt: T,
});
const tx = (id: string, amount: number): Transaction => ({ id, date: T, amount, category: "cat-x", note: "" });
const balance = () => {
  const s = useAppStore.getState();
  return computeDailyBudgetStatus(s.dailyBudget!, s.transactions).balance;
};

beforeEach(() => {
  useAppStore.setState({
    transactions: [], reserves: [], deleted: {}, autoOffset: true,
    dailyBudget: { amount: 100, startDate: T },
  });
});

describe("autoOffsetDeficit — المقاصة التلقائية", () => {
  it("تُعيد الرصيد إلى الصفر بمقدار العجز بالضبط وتخصمه من الفوائض", () => {
    useAppStore.setState({ reserves: [surplusFund(900)], transactions: [tx("t1", 250)] });
    expect(balance()).toBe(-150);
    const moved = useAppStore.getState().autoOffsetDeficit();
    expect(moved).toBe(150);
    expect(balance()).toBe(0);
    const s = useAppStore.getState();
    expect(reserveBalance(s.reserves[0], s.transactions)).toBe(750);
  });

  it("ساكنة: النداء الثاني لا يحرّك شيئاً (لا حلقة مع المراقب)", () => {
    useAppStore.setState({ reserves: [surplusFund(900)], transactions: [tx("t1", 250)] });
    useAppStore.getState().autoOffsetDeficit();
    expect(useAppStore.getState().autoOffsetDeficit()).toBe(0);
    expect(balance()).toBe(0);
  });

  it("**تقف** عند عجزٍ أكبر من ثلاث يوميّات — حدثٌ يحتاج قراراً لا مقاصةً صامتة", () => {
    useAppStore.setState({ reserves: [surplusFund(5000)], transactions: [tx("trip", 2000)] });
    expect(useAppStore.getState().autoOffsetDeficit()).toBe(0);
    expect(balance()).toBe(-1900);
    const s = useAppStore.getState();
    expect(reserveBalance(s.reserves[0], s.transactions)).toBe(5000); // لم تُمسّ الفوائض
  });

  it("تغطّي ما تسمح به الفوائض حين تقلّ عن العجز", () => {
    useAppStore.setState({ reserves: [surplusFund(60)], transactions: [tx("t1", 250)] });
    expect(useAppStore.getState().autoOffsetDeficit()).toBe(60);
    expect(balance()).toBe(-90);
  });

  it("موقوفةً من الإعدادات لا تتحرّك", () => {
    useAppStore.setState({ autoOffset: false, reserves: [surplusFund(900)], transactions: [tx("t1", 250)] });
    expect(useAppStore.getState().autoOffsetDeficit()).toBe(0);
    expect(balance()).toBe(-150);
  });

  it("بلا صندوق فوائض — ولا بميزانيةٍ يومية — لا شيء يحدث", () => {
    useAppStore.setState({ transactions: [tx("t1", 250)] });
    expect(useAppStore.getState().autoOffsetDeficit()).toBe(0);
    useAppStore.setState({ dailyBudget: null, reserves: [surplusFund(900)] });
    expect(useAppStore.getState().autoOffsetDeficit()).toBe(0);
  });

  it("المصروف الموسوم «خارج الميزانيات» لا يصنع عجزاً تُقاصّه", () => {
    useAppStore.setState({
      reserves: [surplusFund(900)],
      transactions: [{ ...tx("exam", 1200), offBudget: true }],
    });
    expect(useAppStore.getState().autoOffsetDeficit()).toBe(0);
    expect(balance()).toBe(100);
  });
});

describe("transferBetweenReserves — تمويل مظروف حدثٍ من الفوائض", () => {
  const trip = { id: "f-trip", name: "رحلة المدينة", icon: "🎒", color: "#8a6fb0", deposits: [], createdAt: T };

  it("ينقل المبلغ بين المظروفين ولا يمسّ الميزانية اليومية", () => {
    useAppStore.setState({ reserves: [surplusFund(900), trip] });
    const before = balance();
    expect(useAppStore.getState().transferBetweenReserves("f-surplus", "f-trip", 600)).toBe(600);
    const s = useAppStore.getState();
    expect(reserveBalance(s.reserves[0], s.transactions)).toBe(300);
    expect(reserveBalance(s.reserves[1], s.transactions)).toBe(600);
    expect(balance()).toBe(before);
  });

  it("لا يخرج من المصدر أكثر مما فيه", () => {
    useAppStore.setState({ reserves: [surplusFund(200), trip] });
    expect(useAppStore.getState().transferBetweenReserves("f-surplus", "f-trip", 1000)).toBe(200);
    const s = useAppStore.getState();
    expect(reserveBalance(s.reserves[0], s.transactions)).toBe(0);
    expect(reserveBalance(s.reserves[1], s.transactions)).toBe(200);
  });

  it("يرفض المصدر الفارغ والمظروف نفسه والمبالغ غير الصالحة", () => {
    useAppStore.setState({ reserves: [surplusFund(0), trip] });
    expect(useAppStore.getState().transferBetweenReserves("f-surplus", "f-trip", 100)).toBe(0);
    useAppStore.setState({ reserves: [surplusFund(500), trip] });
    expect(useAppStore.getState().transferBetweenReserves("f-surplus", "f-surplus", 100)).toBe(0);
    expect(useAppStore.getState().transferBetweenReserves("f-surplus", "f-trip", 0)).toBe(0);
    expect(useAppStore.getState().transferBetweenReserves("f-surplus", "f-ghost", 100)).toBe(0);
  });

  // المظروفُ يصير سالباً حين يصرف أكثر مما مُوّل به — وهذا **مقصود**: عجزُ
  // الحدث يبقى في مظروفه (يُغطّى من الراتب القادم) لا في البدل اليومي.
  it("صرفٌ فوق التمويل يترك العجز في المظروف لا في اليومية", () => {
    useAppStore.setState({ reserves: [surplusFund(900), trip] });
    useAppStore.getState().transferBetweenReserves("f-surplus", "f-trip", 500);
    useAppStore.setState({
      transactions: [{ ...tx("trip-1", 2000), reserveSplits: [{ fundId: "f-trip", pct: 100 }] }],
    });
    const s = useAppStore.getState();
    expect(reserveBalance(s.reserves[1], s.transactions)).toBe(-1500);
    expect(balance()).toBe(100); // البدل اليومي سليم
  });
});
