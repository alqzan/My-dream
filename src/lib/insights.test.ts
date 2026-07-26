import { describe, it, expect } from "vitest";
import { generateInsights, prevMonthPrefix, type Insight } from "./insights";
import { filterInsights, snoozeUntilDate, type InsightPrefs } from "./insightPrefs";
import { today } from "./utils";
import { pageRange } from "./quran/meta";
import { installmentDueDates } from "./installments";
import { toDateStr } from "./utils";
import type { HifzState, HifzRating, InstallmentPlan } from "./types";

// نفس منطق daysAgo داخل المحرّك (نسبةً لليوم الحقيقي) لبناء معاملاتٍ محدَّدة اليوم.
function ago(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateStr(d);
}
const tx = (date: string, i = 0) => ({ id: `t${date}-${i}`, date, amount: 5, category: "", note: "x" });

function baseData(over: Partial<Parameters<typeof generateInsights>[0]> = {}) {
  return {
    transactions: [], journalEntries: [], readingLogs: [], books: [], habits: [],
    budgets: [], categories: [], reserves: [], prayerLogs: [],
    dailyBudget: null, monthlyIncome: null, futureLetters: [], installmentPlans: [],
    quranHifz: null, quranKhatma: null, lastBackup: null,
    ...over,
  };
}
function hz(o: Partial<HifzState> = {}): HifzState {
  return { plan: { startId: 1, unit: "page", amount: 1, createdAt: "2026-01-01" }, frontierId: 0, sessions: [], reviews: [], mistakes: [], ...o };
}
let n = 0;
const ev = (fromId: number, toId: number, date: string, rating?: HifzRating) => ({ id: `e${n++}`, fromId, toId, date, rating });

describe("generateInsights — structured model", () => {
  it("every insight has a dedupeKey, and keys are unique", () => {
    const p2 = pageRange(2);
    const list = generateInsights(baseData({
      quranHifz: hz({ frontierId: p2.end, sessions: [ev(1, p2.end, "2026-01-01")] }),
    }));
    const keys = list.map((i) => i.dedupeKey);
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    // id mirrors dedupeKey
    expect(list.every((i) => i.id === i.dedupeKey)).toBe(true);
  });

  it("surfaces a Quran due-review action when pages are due", () => {
    const p2 = pageRange(2);
    // pages memorized long ago and never reviewed → due
    const list = generateInsights(baseData({
      quranHifz: hz({ frontierId: p2.end, sessions: [ev(1, p2.end, "2026-01-01")] }),
    }));
    const due = list.find((i) => i.dedupeKey === "quran:due-review");
    expect(due).toBeTruthy();
    expect(due!.domain).toBe("quran");
    expect(due!.href).toBe("/quran");
    expect(due!.actionLabel).toBeTruthy();
  });

  it("the backup insight carries an href (no text.includes needed downstream)", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `t${i}`, date: "2026-07-01", amount: 5, category: "", note: "x",
    }));
    const list = generateInsights(baseData({ transactions: many }));
    const backup = list.find((i) => i.dedupeKey === "data:backup");
    expect(backup?.href).toBe("/settings");
  });

  it("is sorted by priority (highest first)", () => {
    const p2 = pageRange(2);
    const list = generateInsights(baseData({
      quranHifz: hz({ frontierId: p2.end, sessions: [ev(1, p2.end, "2026-01-01")] }),
    }));
    for (let i = 1; i < list.length; i++) expect(list[i - 1].priority).toBeGreaterThanOrEqual(list[i].priority);
  });
});

describe("prevMonthPrefix — safe month subtraction (no Date.setMonth overflow)", () => {
  it("subtracts a month and crosses the year boundary", () => {
    expect(prevMonthPrefix("2026-03")).toBe("2026-02"); // 29–31 يوم: كان يفيض قديماً
    expect(prevMonthPrefix("2026-07")).toBe("2026-06");
    expect(prevMonthPrefix("2026-01")).toBe("2025-12");
    expect(prevMonthPrefix("2026-12")).toBe("2026-11");
  });
  it("is day-independent (only the month key matters)", () => {
    // البرهان: لا يوجد يومٌ في المدخل أصلاً، فلا فيضان مهما كان تاريخ اليوم.
    for (let m = 1; m <= 12; m++) {
      const key = `2026-${String(m).padStart(2, "0")}`;
      const prev = prevMonthPrefix(key);
      expect(prev).not.toBe(key); // never returns the same month
    }
  });
});

describe('generateInsights — "أيام بلا صرف" distinguishes no-spend from no-record', () => {
  // متتبّع منتظم: سجّل في ≥12 يوماً من آخر 30، وله فجوتان داخليتان هذا الأسبوع.
  function activeTracker() {
    const days = [0, 1, 3, 5, 6, 8, 10, 12, 14, 16, 18, 20]; // 12 يوماً مميّزاً
    return days.map((d, i) => tx(ago(d), i));
  }

  it("praises genuine interior no-spend days for an active tracker", () => {
    const list = generateInsights(baseData({ transactions: activeTracker() }));
    const ns = list.find((i) => i.dedupeKey === "finance:no-spend");
    expect(ns).toBeTruthy();
    expect(ns!.body).toContain("يومان"); // اليومان الداخليان (قبل ٤ و٢ أيام)
  });

  it("does NOT praise a week with no recording at all (was falsely praised before)", () => {
    // كثير من المعاملات لكن كلها قديمة — لا تسجيل هذا الأسبوع.
    const old = Array.from({ length: 20 }, (_, i) => tx(ago(40 + i), i));
    const list = generateInsights(baseData({ transactions: old }));
    expect(list.find((i) => i.dedupeKey === "finance:no-spend")).toBeFalsy();
  });
});

describe("filterInsights — validUntil / snooze / dismiss (device-local)", () => {
  const ins = (over: Partial<Insight>): Insight => ({
    id: "k", dedupeKey: "k", domain: "journal", icon: "•", title: "t", body: "b",
    tone: "tip", priority: 10, dismissible: true, ...over,
  });

  it("drops insights past their validUntil", () => {
    const list = [ins({ dedupeKey: "a", validUntil: "2026-01-01" })];
    expect(filterInsights(list, {}, "2026-01-02")).toHaveLength(0);
    expect(filterInsights(list, {}, "2026-01-01")).toHaveLength(1); // same-day still shows
  });

  it("hides dismissed insights", () => {
    const prefs: InsightPrefs = { a: { dismissed: true } };
    expect(filterInsights([ins({ dedupeKey: "a" })], prefs, "2026-01-10")).toHaveLength(0);
  });

  it("hides snoozed insights until the snooze date passes", () => {
    const prefs: InsightPrefs = { a: { snoozedUntil: "2026-01-10" } };
    expect(filterInsights([ins({ dedupeKey: "a" })], prefs, "2026-01-09")).toHaveLength(0); // still snoozed
    expect(filterInsights([ins({ dedupeKey: "a" })], prefs, "2026-01-10")).toHaveLength(1); // reappears
  });

  it("snoozeUntilDate advances by the chosen span", () => {
    expect(snoozeUntilDate("today", "2026-01-01")).toBe("2026-01-02");
    expect(snoozeUntilDate("tomorrow", "2026-01-01")).toBe("2026-01-03");
    expect(snoozeUntilDate("week", "2026-01-01")).toBe("2026-01-09");
  });
});

describe("الأقساط في بوصلة مدار — تنبيهٌ واحد فقط", () => {
  const plan = (over: Partial<InstallmentPlan> = {}): InstallmentPlan => ({
    id: "p1", provider: "تمارا", name: "جوّال", totalPrice: 1200, downPayment: 0,
    installmentAmount: 300, count: 4, firstDueDate: ago(1), // قسطٌ فات بالأمس
    status: "active", createdAt: ago(40), ...over,
  });
  const instKeys = (list: Insight[]) => list.filter((i) => i.dedupeKey.startsWith("finance:installment-due"));

  it("raises exactly one installment insight even with several overdue plans", () => {
    const list = generateInsights(baseData({
      installmentPlans: [plan(), plan({ id: "p2", name: "أثاث", firstDueDate: ago(3) })],
    }));
    const inst = instKeys(list);
    expect(inst).toHaveLength(1);
    expect(inst[0].tone).toBe("warning");
    expect(inst[0].href).toBe("/finance#installments");
  });

  it("keys the insight to the plan AND the due date, so hiding one doesn't silence the rest", () => {
    const due = ago(1);
    const list = generateInsights(baseData({ installmentPlans: [plan({ firstDueDate: due })] }));
    expect(instKeys(list)[0].dedupeKey).toBe(`finance:installment-due:p1:${due}`);
  });

  it("warns a week ahead (not only three days)", () => {
    const inSixDays = new Date();
    inSixDays.setDate(inSixDays.getDate() + 6);
    const list = generateInsights(baseData({ installmentPlans: [plan({ firstDueDate: toDateStr(inSixDays) })] }));
    expect(instKeys(list)).toHaveLength(1);
    expect(instKeys(list)[0].tone).toBe("tip"); // قريبٌ لا متأخّر
  });

  it("stays quiet for an installment that is still far away", () => {
    const far = new Date();
    far.setDate(far.getDate() + 20);
    const list = generateInsights(baseData({ installmentPlans: [plan({ firstDueDate: toDateStr(far) })] }));
    expect(instKeys(list)).toHaveLength(0);
  });

  it("stays quiet once the plan is settled or cancelled", () => {
    for (const status of ["settled", "cancelled"] as const) {
      const list = generateInsights(baseData({ installmentPlans: [plan({ status })] }));
      expect(instKeys(list)).toHaveLength(0);
    }
  });

  it("says nothing at all when there are no plans (the default)", () => {
    expect(instKeys(generateInsights(baseData()))).toHaveLength(0);
  });

  it("dismissing this month's installment does NOT hide next month's", () => {
    const t = today();
    // قسطان فائتان: الأول قبل شهرٍ وشهرٍ (لأنّ الجدول شهريّ) والثاني قريب — فيصحّ
    // أن ينتقل التنبيه للثاني ضمن نافذة الأسبوع بعد دفع الأول.
    const p = plan({ firstDueDate: ago(31), count: 4 });
    const dues = installmentDueDates(p.firstDueDate, p.count);
    const first = dues[0];
    const key1 = `finance:installment-due:p1:${first}`;
    const prefs: InsightPrefs = { [key1]: { dismissed: true } };

    // القسط الأول مُخفى → لا تنبيه.
    const shown = filterInsights(generateInsights(baseData({ installmentPlans: [p] })), prefs, t);
    expect(shown.filter((i) => i.dedupeKey.startsWith("finance:installment-due"))).toHaveLength(0);

    // دُفع القسط الأول → التنبيه ينتقل للقسط الثاني بمفتاحٍ آخر، فيظهر رغم الإخفاء.
    const paidFirst = [{
      id: "pay1", date: t, amount: 300, category: "", note: "", planId: "p1",
      planRole: "installment" as const, planInstallmentNo: 1,
    }];
    const next = filterInsights(
      generateInsights(baseData({ installmentPlans: [p], transactions: paidFirst })),
      prefs,
      t
    ).filter((i) => i.dedupeKey.startsWith("finance:installment-due"));
    expect(next).toHaveLength(1);
    expect(next[0].dedupeKey).not.toBe(key1);
  });

  it("snoozing an installment hides only that one, and it returns after the snooze", () => {
    const t = today();
    const due = ago(1);
    const p = plan({ firstDueDate: due });
    const key = `finance:installment-due:p1:${due}`;
    const list = generateInsights(baseData({ installmentPlans: [p] }));

    const snoozed: InsightPrefs = { [key]: { snoozedUntil: snoozeUntilDate("tomorrow", t) } };
    expect(filterInsights(list, snoozed, t).some((i) => i.dedupeKey === key)).toBe(false);
    // بعد انقضاء التأجيل يعود (التاريخ صار ماضياً).
    const past: InsightPrefs = { [key]: { snoozedUntil: ago(1) } };
    expect(filterInsights(list, past, t).some((i) => i.dedupeKey === key)).toBe(true);
  });
})
