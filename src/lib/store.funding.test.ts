import { describe, it, expect, vi, beforeEach } from "vitest";

const idb = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => { idb.set(k, v); },
  del: async (k: string) => { idb.delete(k); },
}));

import { useAppStore } from "./store";
import { today, reserveBalance, computeDailyBudgetStatus } from "./utils";
import { cycleLength, salaryCycleKey } from "./budgetCycle";
import { fundingPerDay } from "./fundPlan";
import { SURPLUS_FUND_NAME } from "./types";
import type { ReserveFund } from "./types";

const T = today();
const SALARY_DAY = 27;
// طول الدورة كما يحسبه المتجر — لا نثبّت ٣٠ فيكذب الاختبار في الأشهر القصيرة.
const CYCLE_LEN = cycleLength(SALARY_DAY, T);

const fund = (over: Partial<ReserveFund> & { id: string; name: string }): ReserveFund => ({
  icon: "📦", color: "#000", deposits: [], createdAt: T, ...over,
});
const surplus = (amount: number) =>
  fund({ id: "f-surplus", name: SURPLUS_FUND_NAME, deposits: amount ? [{ id: "d0", date: T, amount }] : [] });

const state = () => useAppStore.getState();
const balanceOf = (id: string) => {
  const s = state();
  return reserveBalance(s.reserves.find((f) => f.id === id)!, s.transactions);
};
// Confirming twice on one local day is intentionally idempotent. To model the
// next salary cycle in a unit test, advance the persisted cycle marker.
const confirmNextCycle = () => {
  const current = useAppStore.getState();
  // The production key is the salary date of the cycle (salaryCycleKey). Keep the test clock
  // fixed and move prior synthetic-cycle ids out of the current date instead.
  useAppStore.setState({
    lastSalaryConfirm: null,
    reserves: current.reserves.map((fund) => ({
      ...fund,
      deposits: fund.deposits.map((deposit, index) =>
        deposit.id.startsWith(`salary:${salaryCycleKey(SALARY_DAY, T)}:`) ? { ...deposit, id: `historical:${index}:${deposit.id}` } : deposit
      ),
    })),
  });
  return state().confirmSalary();
};

beforeEach(() => {
  useAppStore.setState({
    transactions: [], reserves: [], deleted: {}, autoOffset: true,
    salaryDay: SALARY_DAY, lastSalaryConfirm: null,
    // رصيد اليومية صفرٌ عند البدء (carryAdjust = بدلُ اليوم)، فلا يخلط ترحيلُ
    // الفائض عند تأكيد الراتب أرقامَ المظاريف التي نقيسها هنا.
    dailyBudget: { amount: 100, startDate: T, carryAdjust: 100 },
  });
});

describe("تمويل المظاريف عند «نزل الراتب»", () => {
  it("تأكيد الراتب مرتين في اليوم نفسه لا يكرر الترحيل أو التمويل", () => {
    useAppStore.setState({
      reserves: [fund({ id: "f-rent", name: "الإيجار", funding: { perCycle: 200, source: "salary" } })],
    });
    expect(state().confirmSalary()).toBe(0);
    const once = state();
    const depositsAfterFirst = once.reserves.flatMap((f) => f.deposits);
    expect(state().confirmSalary()).toBe(0);
    const twice = state();
    expect(twice.lastSalaryConfirm).toBe(T);
    expect(twice.reserves.flatMap((f) => f.deposits)).toEqual(depositsAfterFirst);
  });

  it("يولد نفس معرفات الإيداع على جهازين يؤكدان الدورة نفسها", () => {
    const initial = {
      transactions: [], reserves: [fund({ id: "f-rent", name: "الإيجار", funding: { perCycle: 200, source: "salary" } })],
      dailyBudget: { amount: 100, startDate: T, carryAdjust: 100 },
      lastSalaryConfirm: null,
    };
    useAppStore.setState(initial);
    state().confirmSalary();
    const deviceA = state().reserves.flatMap((f) => f.deposits).map((d) => d.id).sort();
    useAppStore.setState(initial);
    state().confirmSalary();
    const deviceB = state().reserves.flatMap((f) => f.deposits).map((d) => d.id).sort();
    expect(deviceB).toEqual(deviceA);
  });

  it("الإيجار (خطة مستمرّة من الراتب): يُموَّل كل دورة وينزل البدل بقطرته", () => {
    useAppStore.setState({
      reserves: [fund({ id: "f-rent", name: "الإيجار", funding: { perCycle: 2000, source: "salary" } })],
    });
    state().confirmSalary();

    expect(balanceOf("f-rent")).toBe(2000);
    const s = state();
    const perDay = fundingPerDay(2000, CYCLE_LEN);
    expect(s.dailyBudget!.fundingPerDay).toBe(perDay);
    const st = computeDailyBudgetStatus(s.dailyBudget!, s.transactions);
    expect(st.rate).toBe(Math.max(0, Math.round((100 - perDay) * 100) / 100));
    // والرصيد يبدأ الدورة من الصفر بالضبط (لا سالباً بفعل الخصم)
    expect(st.balance).toBe(0);
    // والخطة المستمرّة تبقى قائمة للدورة القادمة
    expect(s.reserves[0].funding?.perCycle).toBe(2000);
  });

  it("خطة السداد: تأخذ ما يلزم للتصفير، ثمّ **ترفع نفسها**", () => {
    useAppStore.setState({
      reserves: [
        fund({
          id: "f-trip", name: "رحلة المدينة",
          deposits: [{ id: "d1", date: T, amount: -900 }], // مظروفٌ صُرف منه ولم يُموَّل
          funding: { perCycle: 500, source: "salary", stop: "zero" },
        }),
      ],
    });
    expect(balanceOf("f-trip")).toBe(-900);

    confirmNextCycle();
    expect(balanceOf("f-trip")).toBe(-400);
    expect(state().reserves[0].funding?.perCycle).toBe(500); // ما زال هناك عجز

    confirmNextCycle();
    expect(balanceOf("f-trip")).toBe(0); // آخر دورة تنقل الباقي (٤٠٠) لا ٥٠٠
    expect(state().reserves[0].funding).toBeUndefined(); // ارتفعت الخطة وحدها
    // وقطرةُ هذه الدورة تعكس الدفعة الأخيرة (٤٠٠) لأنّها صُرفت فعلاً فيها…
    expect(state().dailyBudget!.fundingPerDay).toBe(fundingPerDay(400, CYCLE_LEN));
    // …ثمّ يعود البدل كاملاً في الدورة التالية بلا أيّ تدخّل
    confirmNextCycle();
    expect(state().dailyBudget!.fundingPerDay).toBeUndefined();
    expect(computeDailyBudgetStatus(state().dailyBudget!, state().transactions).rate).toBe(100);
  });

  it("المموَّل من الفوائض لا يمسّ البدل اليومي إطلاقاً", () => {
    useAppStore.setState({
      reserves: [
        surplus(3000),
        fund({ id: "f-car", name: "السيارة", target: 5000, funding: { perCycle: 800, source: "surplus", stop: "target" } }),
      ],
    });
    state().confirmSalary();

    expect(balanceOf("f-car")).toBe(800);
    expect(balanceOf("f-surplus")).toBe(2200);
    expect(state().dailyBudget!.fundingPerDay).toBeUndefined();
    expect(computeDailyBudgetStatus(state().dailyBudget!, state().transactions).rate).toBe(100);
  });

  it("ولا يخرج من الفوائض أكثر مما فيها", () => {
    useAppStore.setState({
      reserves: [
        surplus(300),
        fund({ id: "f-car", name: "السيارة", funding: { perCycle: 800, source: "surplus" } }),
      ],
    });
    state().confirmSalary();
    expect(balanceOf("f-car")).toBe(300);
    expect(balanceOf("f-surplus")).toBe(0);
  });

  it("خطّتان معاً: القطرة مجموعُ ما يُموَّل من الراتب وحده", () => {
    useAppStore.setState({
      reserves: [
        surplus(1000),
        fund({ id: "f-rent", name: "الإيجار", funding: { perCycle: 1200, source: "salary" } }),
        fund({ id: "f-gift", name: "هدية", funding: { perCycle: 300, source: "salary" } }),
        fund({ id: "f-car", name: "السيارة", funding: { perCycle: 400, source: "surplus" } }),
      ],
    });
    state().confirmSalary();
    expect(state().dailyBudget!.fundingPerDay).toBe(fundingPerDay(1500, CYCLE_LEN));
    expect(balanceOf("f-car")).toBe(400);
  });

  it("بلا خطط: لا قطرة ولا إيداع (السلوك القديم كما هو)", () => {
    useAppStore.setState({ reserves: [surplus(500)] });
    state().confirmSalary();
    expect(state().dailyBudget!.fundingPerDay).toBeUndefined();
    expect(balanceOf("f-surplus")).toBe(500);
  });
});

// ٠٫١٫٤٧٢: جوّالٌ أكّد ٢٣:٥٥ يوم الراتب، وآيبادٌ أكّد ٠٠:١٠ من الغد قبل أن يتزامن —
// كانا حدثين بمعرّفين فيُرحَّل الفائضُ مرّتين. الآن الدورةُ هي المعرّف.
describe("تأكيدُ الراتب مرّةً واحدة للدورة", () => {
  it("تأكيدٌ ثانٍ للدورة نفسِها في اليوم التالي لا يرحّل ولا يموّل ثانيةً", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(2026, 8, 27, 23, 55));
      useAppStore.setState({
        salaryDay: 27, lastSalaryConfirm: "2026-08-27",
        dailyBudget: { amount: 100, startDate: "2026-09-20", carryAdjust: 0 },
        reserves: [fund({ id: "f-rent", name: "إيجار", funding: { perCycle: 500, source: "salary" } })],
      });
      state().confirmSalary();
      const once = state().reserves.flatMap((f) => f.deposits.map((d) => d.id)).sort();
      expect(once.some((id) => id.startsWith("salary:2026-09-27:"))).toBe(true);

      vi.setSystemTime(new Date(2026, 8, 28, 0, 10));
      state().confirmSalary();
      const twice = state().reserves.flatMap((f) => f.deposits.map((d) => d.id)).sort();
      expect(twice).toEqual(once);
    } finally {
      vi.useRealTimers();
    }
  });
});


describe("سحبُ المقاصة: حذفُه يرجع من اليومية، وإعادتُه لا يُسقطها شاهدٌ قديم", () => {
  it("٠٫١٫٤٧٢", async () => {
    const { offsetDepositId } = await import("./budgetFlow");
    const { depositTombKey } = await import("./merge");
    useAppStore.setState({ reserves: [surplus(500)], dailyBudget: { amount: 100, startDate: T, carryAdjust: 0 } });
    const id = offsetDepositId("f-surplus", T);
    state().pullFromReserve("f-surplus", 40, "مقاصة", id);
    expect(state().dailyBudget!.carryAdjust).toBe(-40);

    state().deleteReserveDeposit("f-surplus", id);
    expect(state().dailyBudget!.carryAdjust).toBe(0);
    expect(balanceOf("f-surplus")).toBe(500);

    state().pullFromReserve("f-surplus", 25, "مقاصة", id);
    expect(state().deleted?.[depositTombKey(id)]).toBeUndefined();
    expect(state().dailyBudget!.carryAdjust).toBe(-25);
    expect(balanceOf("f-surplus")).toBe(475);
  });
});
