import { describe, it, expect } from "vitest";
import {
  replaceTombstones, mergeAppData, applyTombstones,
  budgetTombKey, depositTombKey, habitLogTombKey, wirdTombKey,
} from "./merge";
import { EMPTY_HIFZ, EMPTY_KHATMA } from "./types";
import type { AppData, Transaction, ReserveFund, Habit, Budget } from "./types";

// ===== «استبدل كل بياناتي» يجب أن ينتشر =====
// المسار يمرّ بـ`hydrate` الذي يستعمل `rawSet` عمداً (كي لا يُختم `lastUpdated`
// فتُفسد مقارنةُ «الأحدث يفوز»)، وثمنُ ذلك أنّ حلقةَ الشواهد التلقائية في غلاف
// `set` لا تعمل. فبلا هذه الدالّة كان الاستبدالُ يبدو ناجحاً ثمّ **ينتقض بصمت**:
// أوّلُ دمجٍ مع جهازٍ ما زال يحمل نسخَه يعيد كلَّ ما أسقطته النسخة.

const tx = (id: string): Transaction =>
  ({ id, date: "2026-09-01", amount: 10, category: "c", note: "" });

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

describe("replaceTombstones يرصد كلَّ ما أسقطته النسخة", () => {
  it("عناصرُ المجموعات المفتاحُها id", () => {
    const before = base({ transactions: [tx("a"), tx("b"), tx("c")] });
    const after = base({ transactions: [tx("b")] });
    const tombs = replaceTombstones(before, after, 1000);
    expect(Object.keys(tombs).sort()).toEqual(["a", "c"]);
    expect(tombs.a).toBe(1000);
  });

  it("والسقفُ مفتاحُه القسم لا id", () => {
    const budget = (category: string): Budget => ({ category, limit: 100 });
    const tombs = replaceTombstones(
      base({ budgets: [budget("cat-a"), budget("cat-b")] }),
      base({ budgets: [budget("cat-a")] })
    );
    expect(tombs).toHaveProperty(budgetTombKey("cat-b"));
    expect(tombs).not.toHaveProperty(budgetTombKey("cat-a"));
  });

  it("والمجموعاتُ الداخلية لأبٍ باقٍ: إيداعاتٌ وسجلّاتُ عادة", () => {
    const fund = (deposits: string[]): ReserveFund => ({
      id: "f1", name: "ف", icon: "💰", color: "#000",
      deposits: deposits.map((id) => ({ id, date: "2026-09-01", amount: 10 })),
    });
    const habit = (logs: string[]): Habit => ({ id: "h1", name: "ع", icon: "🏃", color: "#000", logs });
    const tombs = replaceTombstones(
      base({ reserves: [fund(["d1", "d2"])], habits: [habit(["2026-09-01", "2026-09-02"])] }),
      base({ reserves: [fund(["d1"])], habits: [habit(["2026-09-01"])] })
    );
    expect(tombs).toHaveProperty(depositTombKey("d2"));
    expect(tombs).not.toHaveProperty(depositTombKey("d1"));
    expect(tombs).toHaveProperty(habitLogTombKey("h1", "2026-09-02"));
  });

  it("وأبٌ ذهب كلُّه يكفيه شاهدُه — بلا شواهدَ لكلّ إيداعٍ فيه", () => {
    const fund: ReserveFund = {
      id: "f1", name: "ف", icon: "💰", color: "#000",
      deposits: [{ id: "d1", date: "2026-09-01", amount: 10 }],
    };
    const tombs = replaceTombstones(base({ reserves: [fund] }), base({ reserves: [] }));
    expect(tombs).toHaveProperty("f1");
    expect(tombs).not.toHaveProperty(depositTombKey("d1"));
  });

  it("والوِردُ تواريخُ لا معرّفات", () => {
    const tombs = replaceTombstones(
      base({ quranWird: ["2026-09-01", "2026-09-02"] }),
      base({ quranWird: ["2026-09-01"] })
    );
    expect(tombs).toHaveProperty(wirdTombKey("2026-09-02"));
  });

  it("ونسخةٌ لم تُسقط شيئاً لا تُخلّف شاهداً", () => {
    const d = base({ transactions: [tx("a")] });
    expect(replaceTombstones(d, d)).toEqual({});
  });
});

describe("الأثرُ الحقيقيّ: الجهازُ الآخر لا يُعيد ما حُذف", () => {
  // السيناريو: المالك استعاد نسخةً لا تحمل `b`، وجهازٌ آخر ما زال يحمله.
  const restored = base({ transactions: [tx("a")] });
  const otherDevice = base({ lastUpdated: 9999, transactions: [tx("a"), tx("b")] });

  it("بلا شواهد يعود `b` عند أوّل دمج — وهو العطل", () => {
    const merged = mergeAppData(restored, otherDevice);
    expect(merged.transactions.map((t) => t.id).sort()).toEqual(["a", "b"]);
  });

  it("وبالشواهد يبقى محذوفاً على الجهازين", () => {
    const before = base({ transactions: [tx("a"), tx("b")] });
    const withTombs = { ...restored, deleted: replaceTombstones(before, restored) };
    const merged = mergeAppData(withTombs, otherDevice);
    expect(merged.transactions.map((t) => t.id)).toEqual(["a"]);
    // والجهازُ الآخر يطبّقها على نفسه حين تصله الخريطة مع اللقطة.
    const arrived = applyTombstones({ ...otherDevice, deleted: merged.deleted });
    expect(arrived.transactions.map((t) => t.id)).toEqual(["a"]);
  });

  it("والتراجعُ يرفعها: لقطةُ ما قبل الاستبدال تحمل خريطتَها القديمة", () => {
    const before = base({ transactions: [tx("a"), tx("b")] }); // deleted: {}
    const withTombs = { ...restored, deleted: replaceTombstones(before, restored) };
    expect(Object.keys(withTombs.deleted)).toEqual(["b"]);
    expect(Object.keys(before.deleted)).toEqual([]); // العودةُ إليها تُسقط الشواهد
  });
});
