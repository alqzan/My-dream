import { describe, it, expect, vi, beforeEach } from "vitest";

// المتجرُ المحفوظ يكلّم IndexedDB عبر idb-keyval؛ نُبدله ليُقلع في Node بلا متصفّح.
const idb = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => { idb.set(k, v); },
  del: async (k: string) => { idb.delete(k); },
}));

import { useAppStore } from "./store";
import { today, reserveBalance } from "./utils";
import { SURPLUS_FUND_NAME } from "./types";
import { RECONCILE_NOTE, holdings } from "./reconcile";

const surplus = (amount: number) => ({
  id: "f-surplus", name: SURPLUS_FUND_NAME, icon: "✨", color: "#c9852a",
  deposits: amount ? [{ id: "d0", date: "2026-01-01", amount }] : [],
  createdAt: "2026-01-01",
});

beforeEach(() => {
  useAppStore.setState({
    transactions: [], reserves: [], reconciles: [], deleted: {},
    dailyBudget: { amount: 100, startDate: today() },
  });
});

describe("recordReconcile — الفرقُ يُسجَّل تسويةً", () => {
  it("الواقعُ أقلّ: «الفوائض» تنزل بالفرق، والقيدُ يُحفظ", () => {
    useAppStore.setState({ reserves: [surplus(1000)] });
    const before = holdings(useAppStore.getState()).expected; // ١٠٠٠ + يوميّةُ اليوم
    const rec = useAppStore.getState().recordReconcile(before - 250)!;

    expect(rec.delta).toBe(-250);
    expect(rec.expected).toBe(before);
    const s = useAppStore.getState();
    expect(reserveBalance(s.reserves[0], s.transactions)).toBe(750);
    expect(s.reconciles).toHaveLength(1);
    // تسويةٌ لا صرف: لا معاملةَ تدخل السجلّ ولا تستهلك سقفاً.
    expect(s.transactions).toHaveLength(0);
  });

  it("الواقعُ أكثر: كاش‌باكٌ رجع ولم يُسجَّل — الفوائض ترتفع", () => {
    useAppStore.setState({ reserves: [surplus(1000)] });
    const before = holdings(useAppStore.getState()).expected;
    useAppStore.getState().recordReconcile(before + 400);
    const s = useAppStore.getState();
    expect(reserveBalance(s.reserves[0], s.transactions)).toBe(1400);
  });

  it("الفرقُ يحمل نصَّ التسوية فيُعرف في سجلّ الصندوق", () => {
    useAppStore.setState({ reserves: [surplus(1000)] });
    const before = holdings(useAppStore.getState()).expected;
    useAppStore.getState().recordReconcile(before - 100);
    expect(useAppStore.getState().reserves[0].deposits[0].note).toBe(RECONCILE_NOTE);
  });

  it("المطابِقةُ تُسجَّل ولا تُحرّك ريالاً — هي التي تُعيد ضبط العدّاد", () => {
    useAppStore.setState({ reserves: [surplus(1000)] });
    const before = holdings(useAppStore.getState()).expected;
    const rec = useAppStore.getState().recordReconcile(before)!;
    expect(rec.delta).toBe(0);
    const s = useAppStore.getState();
    expect(s.reconciles).toHaveLength(1);
    expect(s.reserves[0].deposits).toHaveLength(1); // الإيداعُ الأصليّ وحده
  });

  it("ينشئ «الفوائض» إن لم تكن — كما يفعل ترحيلُ الراتب", () => {
    useAppStore.setState({ reserves: [] });
    const before = holdings(useAppStore.getState()).expected;
    useAppStore.getState().recordReconcile(before + 300);
    const s = useAppStore.getState();
    expect(s.reserves).toHaveLength(1);
    expect(s.reserves[0].name).toBe(SURPLUS_FUND_NAME);
    expect(reserveBalance(s.reserves[0], s.transactions)).toBe(300);
  });

  it("رصيدٌ سالبٌ خبرٌ صحيح لا عطل: صرفتَ من مالٍ لم يُسجَّل", () => {
    useAppStore.setState({ reserves: [surplus(100)] });
    const before = holdings(useAppStore.getState()).expected;
    useAppStore.getState().recordReconcile(before - 500);
    const s = useAppStore.getState();
    expect(reserveBalance(s.reserves[0], s.transactions)).toBe(-400);
  });

  it("رقمٌ مشوّه لا يُسجَّل قيداً ولا يمسّ شيئاً", () => {
    useAppStore.setState({ reserves: [surplus(1000)] });
    expect(useAppStore.getState().recordReconcile(Number.NaN)).toBeNull();
    expect(useAppStore.getState().reconciles).toHaveLength(0);
  });
});

describe("confirmSalary — صدقُ الفائض المرحَّل", () => {
  // دورةٌ بدأت قبل ثلاثة أيام بلا صرف ⇒ رصيدٌ متراكم ٤٠٠ (٤ يوميّات).
  // تُعاد بين النداءين لا في `beforeEach` وحدَه: التأكيدُ نفسُه يُصفّر الدورة،
  // فنداءٌ ثانٍ بعده يقرأ صفراً لا الحالةَ التي نختبرها.
  const freshCycle = () => {
    const start = new Date();
    start.setDate(start.getDate() - 3);
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    useAppStore.setState({
      transactions: [], reserves: [], reconciles: [],
      dailyBudget: { amount: 100, startDate: key },
      lastSalaryConfirm: null,
    });
  };
  beforeEach(freshCycle);

  it("بلا تصحيحٍ يُرحَّل المحسوب كما هو", () => {
    const moved = useAppStore.getState().confirmSalary();
    expect(moved).toBe(400);
  });

  it("التصحيحُ نزولاً يُرحّل ما أدخله المالك لا ما حسبه التطبيق", () => {
    const moved = useAppStore.getState().confirmSalary(120);
    expect(moved).toBe(120);
    const s = useAppStore.getState();
    expect(reserveBalance(s.reserves[0], s.transactions)).toBe(120);
  });

  it("«ما عندي فائض أصلاً» يعني صفراً — ولا يُنشأ صندوقٌ بلا مال", () => {
    const moved = useAppStore.getState().confirmSalary(0);
    expect(moved).toBe(0);
    expect(useAppStore.getState().reserves).toHaveLength(0);
  });

  it("التصحيحُ صعوداً لا يخترع مالاً — يُقصّ على المحسوب", () => {
    expect(useAppStore.getState().confirmSalary(9999)).toBe(400);
  });

  it("رقمٌ سالبٌ أو مشوّه يُقرأ «بلا تصحيح»", () => {
    expect(useAppStore.getState().confirmSalary(-50)).toBe(400);
    freshCycle();
    expect(useAppStore.getState().confirmSalary(Number.NaN)).toBe(400);
  });
});
