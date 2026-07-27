import { describe, it, expect } from "vitest";
import { decideAdoptCloud, shouldAdoptCloud, hasData, cloudHasUnseen } from "./syncDecision";
import { EMPTY_HIFZ, EMPTY_KHATMA } from "./types";
import type { AppData, Transaction } from "./types";

function base(over: Partial<AppData> = {}): AppData {
  return {
    transactions: [],
    books: [],
    readingLogs: [],
    journalEntries: [],
    habits: [],
    recurring: [],
    installmentPlans: [],
    assets: [],
    budgets: [],
    categories: [],
    reserves: [],
    prayerLogs: [],
    quranReflections: [],
    quranHifz: structuredClone(EMPTY_HIFZ),
    quranWird: [],
    quranKhatma: structuredClone(EMPTY_KHATMA),
    dailyBudget: null,
    monthlyIncome: null,
    futureLetters: [],
    salaryDay: 27,
    lastSalaryConfirm: null,
    readingGoal: null,
    merchantRules: {},
    deleted: {},
    deletedMedia: {},
    fieldUpdatedAt: {},
    lastUpdated: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

const tx = (over: Partial<Transaction> & { id: string }): Transaction => ({
  date: "2026-07-01", amount: 10, category: "cat", note: "", ...over,
});

describe("decideAdoptCloud — تعديلُ عنصرٍ قائم لا يضيع بسبب ساعةٍ متأخّرة", () => {
  it("adopts a genuinely newer snapshot", () => {
    expect(decideAdoptCloud({
      cloudLastUpdated: "2026-07-02T00:00:00.000Z",
      localLastUpdated: "2026-07-01T00:00:00.000Z",
      cloudRevision: 5, lastRevision: 5, hasUnseen: false,
    })).toEqual({ adopt: true, reason: "newer" });
  });

  it("adopts on a higher revision even when the stamp looks OLDER and nothing is new", () => {
    // الحالة التي كانت تُسقَط: الجهاز الآخر عدّل معاملةً **قائمة** وساعته متأخّرة —
    // لا معرّف جديد، ولا شاهد حذف جديد، وختمه أقدم. revision وحده يكشف الكتابة.
    const d = decideAdoptCloud({
      cloudLastUpdated: "2026-06-20T00:00:00.000Z",
      localLastUpdated: "2026-07-01T00:00:00.000Z",
      cloudRevision: 9, lastRevision: 8, hasUnseen: false,
    });
    expect(d).toEqual({ adopt: true, reason: "revision" });
  });

  it("adopts on unseen content when neither the stamp nor the revision moved", () => {
    expect(decideAdoptCloud({
      cloudLastUpdated: "2026-06-20T00:00:00.000Z",
      localLastUpdated: "2026-07-01T00:00:00.000Z",
      cloudRevision: 4, lastRevision: 4, hasUnseen: true,
    })).toEqual({ adopt: true, reason: "unseen" });
  });

  it("ignores our own echo: same revision, older stamp, nothing unseen", () => {
    expect(shouldAdoptCloud({
      cloudLastUpdated: "2026-06-20T00:00:00.000Z",
      localLastUpdated: "2026-07-01T00:00:00.000Z",
      cloudRevision: 7, lastRevision: 7, hasUnseen: false,
    })).toBe(false);
  });

  it("never adopts on a revision that went backwards (a stale listener frame)", () => {
    expect(shouldAdoptCloud({
      cloudLastUpdated: "2026-06-20T00:00:00.000Z",
      localLastUpdated: "2026-07-01T00:00:00.000Z",
      cloudRevision: 3, lastRevision: 7, hasUnseen: false,
    })).toBe(false);
  });

  it("treats legacy docs without a revision as 0 (falls back to stamp/unseen)", () => {
    expect(shouldAdoptCloud({
      cloudLastUpdated: "2026-06-20T00:00:00.000Z",
      localLastUpdated: "2026-07-01T00:00:00.000Z",
      hasUnseen: false,
    })).toBe(false);
  });
});

describe("the edited-transaction scenario end to end", () => {
  it("an edited (not new) transaction with an older stamp is adopted, and the merge keeps it", () => {
    const local = base({
      transactions: [tx({ id: "t1", amount: 10, updatedAt: 1000 })],
      lastUpdated: "2026-07-01T00:00:00.000Z",
    });
    // نفس المعرّف بمبلغٍ معدّل وطابعِ عنصرٍ أحدث، لكن ختم المستند أقدم.
    const cloud = base({
      transactions: [tx({ id: "t1", amount: 55, updatedAt: 2000 })],
      lastUpdated: "2026-06-20T00:00:00.000Z",
    });
    expect(cloudHasUnseen(cloud, local)).toBe(false); // لا شيء «جديد» يُكتشف
    expect(shouldAdoptCloud({
      cloudLastUpdated: cloud.lastUpdated,
      localLastUpdated: local.lastUpdated,
      cloudRevision: 12, lastRevision: 11,
      hasUnseen: cloudHasUnseen(cloud, local),
    })).toBe(true);
  });
});

describe("hasData — يشمل خطط الأقساط", () => {
  it("counts a device that only holds an installment plan as non-empty", () => {
    expect(hasData(base())).toBe(false);
    expect(hasData(base({
      installmentPlans: [{
        id: "p1", provider: "تمارا", name: "جوّال", totalPrice: 1200, downPayment: 0,
        installmentAmount: 100, count: 12, firstDueDate: "2026-08-01",
        status: "active", createdAt: "2026-07-26",
      }],
    }))).toBe(true);
  });
});

describe("cloudHasUnseen — يرى خطة أقساطٍ جديدة", () => {
  it("detects a plan the cloud has and this device doesn't", () => {
    const local = base();
    const cloud = base({
      installmentPlans: [{
        id: "p9", provider: "تابي", name: "أثاث", totalPrice: 3000, downPayment: 0,
        installmentAmount: 250, count: 12, firstDueDate: "2026-08-01",
        status: "active", createdAt: "2026-07-26",
      }],
    });
    expect(cloudHasUnseen(cloud, local)).toBe(true);
    expect(cloudHasUnseen(local, cloud)).toBe(false);
  });
});

// حارسُ الإغفال: `assets` أُضيفت لـAppData في 0.1.295 ونُسيت في `hasData`
// و`cloudHasUnseen` معاً، فبقي جهازان مختلفين بلا سببٍ ظاهر. الاختباران هنا
// يمنعان تكرار ذلك — وكل مجموعةٍ جديدة تستحقّ مثلهما.
const asset = (id: string) => ({
  id, name: "ماك بوك", purchaseDate: "2026-07-26", purchasePrice: 5499, lifeDays: 1825,
});

describe("hasData — يشمل الأصول", () => {
  it("counts a device that only holds an asset as non-empty", () => {
    expect(hasData(base())).toBe(false);
    expect(hasData(base({ assets: [asset("a1")] }))).toBe(true);
  });
});

describe("cloudHasUnseen — يرى أصلاً جديداً", () => {
  it("detects an asset the cloud has and this device doesn't", () => {
    const local = base();
    const cloud = base({ assets: [asset("a9")] });
    expect(cloudHasUnseen(cloud, local)).toBe(true);
    expect(cloudHasUnseen(local, cloud)).toBe(false);
  });
});
