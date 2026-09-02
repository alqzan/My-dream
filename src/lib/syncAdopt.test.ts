// ===================== حارسُ سباق الإقلاع =====================
// البقّة الأصلية: بين أخذ اللقطة المحلّية وتطبيق ناتج الدمج على المتجر تمرّ
// رحلةُ شبكةٍ وتنزيلُ صور. عمليةٌ يسجّلها المالك في تلك النافذة كان يمحوها
// `hydrate` المبنيّ على اللقطة الأقدم منها، ولا تصل السحابة أبداً — اختفاءٌ
// صامتٌ تامّ. هذه الاختبارات تحاكي التأخير وتُجري تعديلاً خلاله.
import { describe, it, expect } from "vitest";
import { adoptCloudSnapshot, MAX_ADOPT_ROUNDS } from "./syncAdopt";
import { EMPTY_HIFZ, EMPTY_KHATMA } from "./types";
import type { AppData, Transaction, JournalEntry } from "./types";

function base(overrides: Partial<AppData> = {}): AppData {
  return {
    transactions: [],
    books: [],
    readingLogs: [],
    journalEntries: [],
    habits: [],
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
    countdownEvents: [],
    salaryDay: 27,
    lastSalaryConfirm: null,
    readingGoal: null,
    merchantRules: {},
    deleted: {},
    fieldUpdatedAt: {},
    lastUpdated: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const tx = (o: Partial<Transaction> & { id: string }): Transaction => ({
  date: "2026-01-01", amount: 10, category: "cat", note: "", ...o,
});
// مراجعُ الوسائط السحابية (`photoRefs`/`audioRefs`) تُرافق المذكرة ولا يعلنها
// `JournalEntry` — كما في `utils.ts` (النوع الداخليّ `EntryMediaRefs`) وفي
// `mergeMedia.test.ts`. توسيعٌ محلّيٌّ للاختبار وحده، بلا مساسٍ بنوع التشغيل.
type EntryWithRefs = JournalEntry & { photoRefs?: string[]; audioRefs?: string[] };

const entry = (o: Partial<EntryWithRefs> & { id: string }): EntryWithRefs => ({
  date: "2026-01-01", content: "", ...o,
});

const ids = (d: Partial<AppData>) => (d.transactions ?? []).map((t) => t.id).sort();

/**
 * جهازٌ وهميّ: متجرٌ في الذاكرة بعدّاد تعديل، كما في `SyncProvider` تماماً —
 * الاشتراك يرفع العدّاد على التعديل المحلّي وحده.
 */
function device(initial: AppData) {
  let state = initial;
  let seq = 0;
  return {
    snapshot: () => state,
    editSeq: () => seq,
    /** تعديلٌ محليّ من المالك (يرفع العدّاد ويقدّم الختم كما يفعل غلاف `set`). */
    edit(mutate: (s: AppData) => AppData) {
      state = { ...mutate(state), lastUpdated: new Date(Date.now() + 60_000).toISOString() };
      seq++;
    },
    /** تطبيقُ ناتج التبنّي — محروسٌ فلا يرفع العدّاد (كـ`applyingRemoteRef`). */
    apply(display: Partial<AppData>) {
      state = { ...state, ...display };
    },
    get state() { return state; },
  };
}

describe("adoptCloudSnapshot — تعديلٌ محليّ أثناء انتظار الشبكة", () => {
  it("يبقى التعديل بعد الترطيب، ويدخل الناتج المدمج، ويُدفع للسحابة", async () => {
    const dev = device(base({ transactions: [tx({ id: "local-old" })] }));
    const cloud = base({
      transactions: [tx({ id: "cloud-1" })],
      lastUpdated: "2026-01-02T00:00:00.000Z",
    });

    // الترطيب يتأخّر — وفي أثنائه يسجّل المالك عمليةً (مرّةً واحدة).
    let racedOnce = false;
    const toDisplay = async (merged: AppData) => {
      await new Promise((r) => setTimeout(r, 5)); // تأخيرُ hydrateCloudPhotos
      if (!racedOnce) {
        racedOnce = true;
        dev.edit((s) => ({ ...s, transactions: [...s.transactions, tx({ id: "raced" })] }));
      }
      return merged;
    };

    const { display, save, rounds } = await adoptCloudSnapshot({
      snapshot: dev.snapshot, cloud, toDisplay, editSeq: dev.editSeq,
    });
    dev.apply(display);

    // ١) العملية المسجّلة أثناء الانتظار باقيةٌ بعد تطبيق الناتج على المتجر.
    expect(ids(dev.state)).toContain("raced");
    // ٢) وهي في الناتج المدمج، ومعها ما جاء من السحابة وما كان على الجهاز.
    expect(ids(display)).toEqual(["cloud-1", "local-old", "raced"]);
    // ٣) وفي **ما يُحفظ** في السحابة — وإلّا بقيت حبيسة الجهاز.
    expect(ids(save)).toEqual(["cloud-1", "local-old", "raced"]);
    expect(rounds).toBe(2); // جولةٌ أولى سُبقت، وثانيةٌ استقرّت
  });

  it("لا يفقد التعديل ولو تدفّق في كلّ جولة (طيُّ أحدث لقطةٍ في النهاية)", async () => {
    const dev = device(base({ transactions: [tx({ id: "seed" })] }));
    const cloud = base({ transactions: [tx({ id: "cloud-1" })], lastUpdated: "2026-01-02T00:00:00.000Z" });

    let n = 0;
    const toDisplay = async (merged: AppData) => {
      await new Promise((r) => setTimeout(r, 1));
      dev.edit((s) => ({ ...s, transactions: [...s.transactions, tx({ id: `e${++n}` })] }));
      return merged;
    };

    const { display, save, rounds } = await adoptCloudSnapshot({
      snapshot: dev.snapshot, cloud, toDisplay, editSeq: dev.editSeq,
    });
    dev.apply(display);

    expect(rounds).toBe(MAX_ADOPT_ROUNDS);
    // كلُّ ما سجّله المالك خلال الجولات باقٍ — في المتجر وفي ما يُحفظ.
    for (let i = 1; i <= n; i++) {
      expect(ids(dev.state), `e${i} في المتجر`).toContain(`e${i}`);
      expect(ids(save), `e${i} فيما يُحفظ`).toContain(`e${i}`);
    }
    expect(ids(save)).toContain("cloud-1"); // ولا تسقط السحابة مقابل ذلك
  });

  it("بلا تعديلٍ عارض: جولةٌ واحدة والناتج هو الاتحاد المعتاد", async () => {
    const dev = device(base({ transactions: [tx({ id: "a" })] }));
    const cloud = base({ transactions: [tx({ id: "b" })], lastUpdated: "2026-01-02T00:00:00.000Z" });
    let calls = 0;
    const { display, save, rounds } = await adoptCloudSnapshot({
      snapshot: dev.snapshot, cloud,
      toDisplay: async (m) => { calls++; return m; },
      editSeq: dev.editSeq,
    });
    expect(rounds).toBe(1);
    expect(calls).toBe(1); // لا ترطيبَ زائد في الحالة السويّة
    expect(ids(display)).toEqual(["a", "b"]);
    expect(ids(save)).toEqual(["a", "b"]);
  });

  it("الدمج يقع على مراجع الوسائط، والترطيب بعده — لا العكس", async () => {
    // مذكرةٌ في السحابة بمرجعِ صورة، ونسختُها على الجهاز بلا وسائط. لو رُطّبت
    // السحابة قبل الدمج لدخل الدمجَ بايتاتٌ بلا مرجع، فتيتم الصورة في R2.
    const cloudEntry = entry({ id: "j1", photoRefs: ["r2/abc"], updatedAt: 2 });
    const cloud = base({ journalEntries: [cloudEntry], lastUpdated: "2026-01-02T00:00:00.000Z" });
    const dev = device(base({ journalEntries: [entry({ id: "j1", updatedAt: 1 })] }));

    let sawRefsAtMerge = false;
    const { save } = await adoptCloudSnapshot({
      snapshot: dev.snapshot, cloud, editSeq: dev.editSeq,
      toDisplay: async (merged) => {
        // ما وصل الترطيبَ هو **ناتج الدمج** وهو ما يزال حاملاً المرجع.
        sawRefsAtMerge = (merged.journalEntries[0] as EntryWithRefs)?.photoRefs?.includes("r2/abc") ?? false;
        return { ...merged, journalEntries: merged.journalEntries.map((e) => ({ ...e, photos: ["data:png"] })) };
      },
    });

    expect(sawRefsAtMerge).toBe(true);
    // وما يُحفظ هو الغنيّ بالمراجع لا نسخةُ العرض المُرطَّبة.
    const saved = save.journalEntries[0] as EntryWithRefs;
    expect(saved.photoRefs).toEqual(["r2/abc"]);
    expect(saved.photos).toBeUndefined();
  });
});
