import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AppData, JournalEntry } from "./types";
import { EMPTY_HIFZ, EMPTY_KHATMA } from "./types";

// ===================== Mocks =====================
// كتابةُ شرائح المذكرات: شهرٌ واحدٌ يفشل — ماذا يحدث للبقيّة؟
//
// `mapWithConcurrency` يبني على `Promise.all`، وهي ترفض عند **أوّل** رافض.
// وبلا `try/catch` داخل كلّ شهر يتبع ذلك أمران:
//  • **البصماتُ تضيع كلُّها**: السطرُ الذي يحفظها بعد الانتظار لا يُنفَّذ أصلاً،
//    فشهرٌ أُودِع فعلاً يُعاد إيداعُه في الحفظ التالي بلا داعٍ.
//  • **والإنجازُ غيرُ حتميّ** حين تزيد الشهورُ على حدّ التوازي: العمّالُ
//    الباقون يسحبون من الطابور ويكتبون **بعد** أن رمى المنادي ومضى.
// (لا رفضٌ بلا مُمسِك: `Promise.all` تُراقب وعودَ العمّال كلَّها. الاختبارُ
//  الثالث يثبّت ذلك لا أكثر.)

const setDocMock = vi.fn(async () => {});
const getDocMock = vi.fn(async (..._a: unknown[]) => ({ exists: () => false }) as unknown);

// شهرٌ بعينه يُفشِل معاملتَه؛ الباقي يمرّ.
let failShard: string | null = null;
const shardOf = (ref: unknown): string => {
  const args = (ref as { __doc?: unknown[] })?.__doc ?? [];
  return String(args[args.length - 1] ?? "");
};

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) => ({ __doc: args }),
  collection: (...args: unknown[]) => ({ __col: args }),
  getDoc: (...a: unknown[]) => getDocMock(...(a as [])),
  setDoc: (...a: unknown[]) => setDocMock(...(a as [])),
  getDocs: async () => ({ docs: [], forEach: () => {} }),
  onSnapshot: vi.fn(),
  deleteDoc: vi.fn(async () => {}),
  runTransaction: async (_db: unknown, fn: (txn: unknown) => Promise<unknown>) =>
    fn({
      get: async (ref: unknown) => {
        if (failShard && shardOf(ref) === failShard) throw new Error("permission-denied-ish");
        return getDocMock(ref);
      },
      set: (...a: unknown[]) => { setDocMock(...(a as [])); },
    }),
}));

vi.mock("./firebase", () => ({ db: { __db: true }, getSyncSpace: () => "space" }));
vi.mock("idb-keyval", () => {
  const store = new Map<string, unknown>();
  return { get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => { store.set(k, v); } };
});
vi.mock("@/components/ui/UndoToast", () => ({ showToast: vi.fn() }));

// بصماتُ الشرائح حالةٌ على مستوى الوحدة (تمنع إعادةَ كتابة شهرٍ لم يتغيّر)،
// فكلُّ اختبارٍ يبدأ بوحدةٍ جديدة وإلّا رأى الثاني آثارَ الأوّل فلم يكتب شيئاً.
let sync: typeof import("./sync");

function appData(journalEntries: JournalEntry[]): AppData {
  return {
    transactions: [], books: [], readingLogs: [], journalEntries, habits: [],
    budgets: [], categories: [], reserves: [], prayerLogs: [], quranReflections: [],
    quranHifz: structuredClone(EMPTY_HIFZ), quranWird: [],
    quranKhatma: structuredClone(EMPTY_KHATMA), dailyBudget: null, monthlyIncome: null,
    futureLetters: [], salaryDay: 27, lastSalaryConfirm: null, readingGoal: null,
    merchantRules: {}, deleted: {}, lastUpdated: "2026-01-01T00:00:00.000Z",
  };
}

const entry = (id: string, date: string): JournalEntry =>
  ({ id, date, content: `نصّ ${id}`, updatedAt: 1 }) as JournalEntry;

// كلُّ شهرٍ في المذكرات شريحةٌ باسم YYYY-MM.
const FOUR_MONTHS = [
  entry("e1", "2026-01-05"),
  entry("e2", "2026-02-05"),
  entry("e3", "2026-03-05"),
  entry("e4", "2026-04-05"),
];

const journalShardWrites = () =>
  setDocMock.mock.calls
    .map((c) => shardOf(c[0]))
    .filter((sid) => /^\d{4}-\d{2}$/.test(sid));

let unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => { unhandled.push(e); };

beforeEach(async () => {
  vi.resetModules();
  process.env.NEXT_PUBLIC_R2_WORKER_URL = "https://worker.example";
  sync = await import("./sync");
  setDocMock.mockClear();
  getDocMock.mockClear();
  failShard = null;
  unhandled = [];
  process.on("unhandledRejection", onUnhandled);
  global.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
});

describe("writeJournalShards — فشلُ شهرٍ لا يُسقِط البقيّة بلا مراقِب", () => {
  it("يكتب الشهور الأربعة حين لا يفشل شيء", async () => {
    await sync.saveUserData("space-ok", appData(FOUR_MONTHS));
    expect(journalShardWrites().sort()).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
  });

  it("شهرٌ يفشل: الثلاثةُ الباقية تُكتب، والخطأ يصل للمنادي", async () => {
    failShard = "2026-02";
    await expect(sync.saveUserData("space-fail", appData(FOUR_MONTHS))).rejects.toThrow();
    // لا خروجَ مبكراً: بقيّةُ الشهور أُنجزت قبل أن يُرمى الخطأ.
    expect(journalShardWrites().sort()).toEqual(["2026-01", "2026-03", "2026-04"]);
  });

  // أكثرُ من حدّ التوازي (4) — حيث يسحب العمّالُ من طابور. تثبيتُ الحتمية:
  // حين يصل الخطأ يكون كلُّ شهرٍ قابلٍ للكتابة قد كُتب. (بمحاكاةٍ متزامنة
  // كهذه ينطبق على الكاتب القديم أيضاً؛ المقصودُ تثبيتُ العقد لا كشفُ عطل.)
  it("شهورٌ أكثرُ من حدّ التوازي: كلُّها تُنجَز قبل أن يصل الخطأ", async () => {
    const months = ["01", "02", "03", "04", "05", "06", "07", "08"];
    const many = months.map((m, i) => entry(`m${i}`, `2026-${m}-05`));
    failShard = "2026-05";
    await expect(sync.saveUserData("space-many", appData(many))).rejects.toThrow();
    expect(journalShardWrites().sort()).toEqual(
      months.filter((m) => m !== "05").map((m) => `2026-${m}`)
    );
  });

  // `Promise.all` تُراقب وعودَ العمّال كلَّها، فلا رفضَ يتيم. تثبيتٌ لا كشف.
  it("ولا يبقى رفضٌ بلا مُمسِك", async () => {
    failShard = "2026-03";
    await expect(sync.saveUserData("space-unhandled", appData(FOUR_MONTHS))).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(unhandled).toEqual([]);
  });

  it("الشهرُ الفاشل يُعاد في الحفظ التالي، والناجحُ لا يُعاد", async () => {
    // الحفظان في نفس الوحدة عمداً: السؤال هو ما تتذكّره البصماتُ بينهما.
    failShard = "2026-02";
    await expect(sync.saveUserData("space-retry", appData(FOUR_MONTHS))).rejects.toThrow();
    setDocMock.mockClear();
    failShard = null;
    await sync.saveUserData("space-retry", appData(FOUR_MONTHS));
    // بصماتُ الناجحين حُفظت، فلم تُعَد كتابتُهم؛ والفاشلُ وحده أُعيد.
    expect(journalShardWrites().sort()).toEqual(["2026-02"]);
  });
});
