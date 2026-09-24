import { describe, it, expect } from "vitest";
import { offsetDepositId, isOffsetDepositId, OFFSET_NOTE } from "./budgetFlow";
import { mergeAppData } from "./merge";
import { reserveBalance } from "./utils";
import { EMPTY_HIFZ, EMPTY_KHATMA } from "./types";
import type { AppData, ReserveFund, ReserveDeposit } from "./types";

// ===== المقاصة التلقائية محايدةُ التكرار عبر الأجهزة =====
// المراقبُ يعمل على **كلّ** جهازٍ مفتوح بعد أيّ تغيّرٍ في المعاملات — ومنه دمجُ
// لقطة السحابة. فجهازان مفتوحان يريان المعاملةَ المسبِّبة للعجز نفسَها ويسحبان
// كلاهما. وبمعرّفٍ عشوائيّ كان السحبان ينجوان معاً في الدمج (الإيداعات تتّحد
// بالمعرّف) بينما `carryAdjust` مفردٌ يُحسم مرّة: «الفوائض» تُخصم مرّتين
// والميزانية تُرصَد مرّة — خطأُ مالٍ دائم لا يصالحه شيء.

function base(over: Partial<AppData> = {}): AppData {
  return {
    transactions: [], books: [], readingLogs: [], journalEntries: [], habits: [],
    budgets: [], categories: [], reserves: [], prayerLogs: [], quranReflections: [],
    quranHifz: structuredClone(EMPTY_HIFZ), quranWird: [],
    quranKhatma: structuredClone(EMPTY_KHATMA), dailyBudget: null, monthlyIncome: null,
    futureLetters: [], salaryDay: 27, lastSalaryConfirm: null, readingGoal: null,
    merchantRules: {}, deleted: {}, deletedMedia: {}, fieldUpdatedAt: {},
    countdownEvents: [], knowledgeSources: [], benefits: [], qadaBacklog: 0,
    ...over,
  } as AppData;
}

const FUND = "f-surplus";
const DAY = "2026-09-14";

const withdrawal = (amount: number): ReserveDeposit =>
  ({ id: offsetDepositId(FUND, DAY), date: DAY, amount: -amount, note: OFFSET_NOTE });

const fund = (deposits: ReserveDeposit[]): ReserveFund => ({
  id: FUND, name: "الفوائض", icon: "💰", color: "#000",
  deposits: [...deposits, { id: "seed", date: "2026-09-01", amount: 1000 }],
});

describe("معرّفُ إيداع المقاصة مشتقٌّ لا عشوائيّ", () => {
  it("نفسُ المظروف ونفسُ اليوم ⇒ نفسُ المعرّف", () => {
    expect(offsetDepositId(FUND, DAY)).toBe(offsetDepositId(FUND, DAY));
    expect(offsetDepositId(FUND, DAY)).not.toBe(offsetDepositId(FUND, "2026-09-15"));
    expect(offsetDepositId(FUND, DAY)).not.toBe(offsetDepositId("other", DAY));
  });

  it("ويُعرَف من غيره", () => {
    expect(isOffsetDepositId(offsetDepositId(FUND, DAY))).toBe(true);
    expect(isOffsetDepositId("abc123")).toBe(false);
  });
});

describe("جهازان يقاصّان العجزَ نفسَه ⇒ خصمٌ واحد", () => {
  it("السحبان ينهاران إلى واحد بدل أن يتضاعفا", () => {
    const iphone = base({ lastUpdated: 9000, reserves: [fund([withdrawal(120)])] });
    const ipad = base({ lastUpdated: 100, reserves: [fund([withdrawal(120)])] });
    for (const merged of [mergeAppData(iphone, ipad), mergeAppData(ipad, iphone)]) {
      const deposits = merged.reserves[0].deposits;
      const offsets = deposits.filter((d) => isOffsetDepositId(d.id));
      expect(offsets).toHaveLength(1);                       // لا سطران
      expect(offsets[0].amount).toBe(-120);
      expect(reserveBalance(merged.reserves[0], [])).toBe(880); // ١٠٠٠ − ١٢٠ مرّةً واحدة
    }
  });

  it("ومن رأى عجزاً أكبر في اليوم نفسِه هو الذي يفوز", () => {
    // الآيفون رأى معاملةً ثانيةً فكبّر سحبَ اليوم؛ الآيباد ما زال على الأولى.
    const iphone = base({ lastUpdated: 100, reserves: [fund([withdrawal(200)])] });
    const ipad = base({ lastUpdated: 9000, reserves: [fund([withdrawal(120)])] });
    for (const merged of [mergeAppData(iphone, ipad), mergeAppData(ipad, iphone)]) {
      const offsets = merged.reserves[0].deposits.filter((d) => isOffsetDepositId(d.id));
      expect(offsets).toHaveLength(1);
      expect(offsets[0].amount).toBe(-200); // الأكبر — لا الأوّل ولا الأحدث ختماً
    }
  });

  it("ويومان مختلفان سطران — الانهيارُ لليوم الواحد لا للمظروف", () => {
    const a = withdrawal(50);
    const b = { ...withdrawal(70), id: offsetDepositId(FUND, "2026-09-15"), date: "2026-09-15" };
    const iphone = base({ lastUpdated: 9000, reserves: [fund([a, b])] });
    const ipad = base({ lastUpdated: 100, reserves: [fund([a])] });
    const merged = mergeAppData(iphone, ipad);
    expect(merged.reserves[0].deposits.filter((d) => isOffsetDepositId(d.id))).toHaveLength(2);
  });

  it("والسحبُ اليدويّ (معرّفٌ عشوائيّ) يبقى حدثين مستقلّين", () => {
    const manual = (id: string): ReserveDeposit =>
      ({ id, date: DAY, amount: -30, note: "إلى الميزانية اليومية" });
    const iphone = base({ lastUpdated: 9000, reserves: [fund([manual("m1")])] });
    const ipad = base({ lastUpdated: 100, reserves: [fund([manual("m2")])] });
    const merged = mergeAppData(iphone, ipad);
    const manuals = merged.reserves[0].deposits.filter((d) => d.id === "m1" || d.id === "m2");
    expect(manuals).toHaveLength(2); // سحبان يدويّان في يومٍ واحد حدثان
  });
});

// ٠٫١٫٤٧٢: الإيداعُ يُحسم بالأكبر و`carryAdjust` بآخر ضابط — فكانا يفترقان.
describe("اليوميةُ تطابق إيداعَ المقاصة المدموج", () => {
  const budget = (carryAdjust: number) => ({ amount: 100, startDate: "2026-09-01", carryAdjust });
  const phone = () => base({
    reserves: [fund([withdrawal(50)])], dailyBudget: budget(-50),
    fieldUpdatedAt: { dailyBudget: 1_000 }, lastUpdated: "2026-09-14T10:00:00.000Z",
  });
  const ipad = () => base({
    reserves: [fund([withdrawal(30)])], dailyBudget: budget(-30),
    fieldUpdatedAt: { dailyBudget: 2_000 }, lastUpdated: "2026-09-14T09:00:00.000Z",
  });

  it("الجوّال سحب ٥٠ والآيباد ٣٠ (ضبطُه أحدث) ⇒ الإيداعُ ٥٠ واليوميةُ −٥٠", () => {
    for (const merged of [mergeAppData(phone(), ipad()), mergeAppData(ipad(), phone())]) {
      const w = merged.reserves[0].deposits.find((d) => isOffsetDepositId(d.id))!;
      expect(w.amount).toBe(-50);
      expect(merged.dailyBudget?.carryAdjust).toBe(-50);
    }
  });

  it("الدمجُ المتكرّر لا يُراكم التصحيح", () => {
    const once = mergeAppData(phone(), ipad());
    const twice = mergeAppData(once, ipad());
    expect(twice.dailyBudget?.carryAdjust).toBe(-50);
    expect(mergeAppData(twice, once).dailyBudget?.carryAdjust).toBe(-50);
  });
});
