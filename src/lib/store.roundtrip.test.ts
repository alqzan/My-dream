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
import type { AppData } from "./types";

// لقطةٌ فيها **كلّ** حقلٍ من AppData بقيمةٍ غير افتراضية. أيّ حقلٍ يُضاف لاحقاً
// ويُنسى في `hydrate` يسقط هنا فوراً: هذا ما فات في الأصول (كانت في snapshot
// والدمج والنسخة الاحتياطية، وغائبةً عن hydrate — فأصلٌ من السحابة أو من ملفٍ
// مُستعاد لا يدخل المتجر أبداً).
//
// النوع `Required<AppData>` لا `AppData`: الحقول **الاختيارية** (`assets` و
// `budgetWindow` و`frozenHabits` و`deletedMedia`…) هي بالضبط التي تنزلق بلا
// خطأ ترجمة، وهي التي وقع فيها الخلل فعلاً. بهذا لا يُترجَم الملفّ أصلاً حتى
// يُذكر الحقل الجديد هنا، ثمّ يفحص الاختبارُ عبورَه الدورة.
const FULL: Required<AppData> = {
  transactions: [{ id: "t1", date: "2026-05-01", amount: 25, category: "c1", note: "قهوة" }],
  books: [{ id: "b1", title: "ك", author: "م", totalPages: 300, currentPage: 42, status: "أقرأ" }],
  readingLogs: [{ id: "r1", bookId: "b1", date: "2026-05-01", pagesRead: 20 }],
  // `mergedFrom` مقصودٌ هنا: هو سجلّ «هذه المذكرة مدموجة ومِمَّ». لو سقط في
  // الدورة (لقطة → ترطيب → نسخة → دمج) صارت المدموجة تبدو مذكرةً عادية على
  // الجهاز الآخر — وهو بالضبط الدمج الغامض الذي تتجنّبه هذه الميزة.
  journalEntries: [{
    id: "e1", date: "2026-05-01", content: "نص",
    mergedFrom: [{ id: "e1", time: "07:10", chars: 3, photos: 0, audios: 0, mergedAt: 1 }],
  }],
  habits: [{ id: "h1", name: "مشي", icon: "🚶", color: "#000", logs: ["2026-05-01"] }],
  recurring: [{
    id: "rc1", amount: 500, category: "c1", note: "إيجار", unit: "شهري", every: 1,
    dayOfMonth: 1, anchorDate: "2026-01-01", active: true,
  }],
  installmentPlans: [{
    id: "p1", provider: "تمارا", name: "جوّال", totalPrice: 1200, downPayment: 200,
    installmentAmount: 100, count: 10, firstDueDate: "2026-02-15",
    status: "active", createdAt: "2026-02-01",
  }],
  assets: [{
    id: "a1", name: "ماك بوك", purchaseDate: "2026-07-26", purchasePrice: 5499, lifeDays: 1825,
    createdAt: "2026-07-26",
  }],
  budgets: [{ category: "c1", limit: 900 }],
  categories: [{ id: "c1", label: "قهوة", icon: "☕", color: "#c1663f" }],
  reserves: [{
    id: "f1", name: "سفرة", icon: "✈️", color: "#000", createdAt: "2026-01-01",
    deposits: [{ id: "d1", amount: 100, date: "2026-05-01" }],
  }],
  // السننُ والقيامُ داخل يوم الصلاة: لو سقطا في الدورة (لقطة → ترطيب → نسخة →
  // دمج) لعاد الجهازُ الجديد بأيامِ صلاةٍ بلا سننٍ ولا ليالٍ — وهو الانزلاقُ
  // الصامت نفسُه الذي وقع لـ`assets`.
  prayerLogs: [{
    date: "2026-05-01", prayers: { الفجر: "جماعة", الظهر: "فائتة" },
    sunan: 6, qiyam: { rakaat: 8, witr: true },
  }],
  qadaBacklog: 3,
  quranReflections: [{ id: "q1", date: "2026-05-01", text: "تأمّل", createdAt: "2026-05-01" }],
  quranHifz: {
    plan: { startId: 1, unit: "page", amount: 1, createdAt: "2026-01-01" },
    frontierId: 12, sessions: [], reviews: [], mistakes: [],
  },
  quranWird: ["2026-05-01"],
  quranKhatma: { juz: 5, completed: 2 },
  dailyBudget: { amount: 80, startDate: "2026-01-01" },
  monthlyIncome: 12000,
  futureLetters: [{ id: "l1", writtenDate: "2026-01-01", deliveryDate: "2027-01-01", content: "رسالة" }],
  countdownEvents: [{ id: "ce1", title: "اختبار CFA", date: "2027-02-20", emoji: "📘" }],
  salaryDay: 25,
  budgetWindow: "month",
  lastSalaryConfirm: "2026-05-25",
  readingGoal: 12,
  frozenHabits: ["core:reading"],
  merchantRules: { كافيه: "c1" },
  deleted: { gone: 1 },
  deletedMedia: { "e9:photos:abc": 1 },
  fieldUpdatedAt: { salaryDay: 1 },
  lastUpdated: "2026-05-30T00:00:00.000Z",
};

// حالةٌ فارغة تماماً قبل كل اختبار (كجهازٍ جديد يتبنّى السحابة).
beforeEach(() => {
  useAppStore.setState({
    transactions: [], books: [], readingLogs: [], journalEntries: [], habits: [],
    recurring: [], installmentPlans: [], assets: [], budgets: [], categories: [],
    reserves: [], prayerLogs: [], quranReflections: [], quranWird: [],
    futureLetters: [], frozenHabits: [], merchantRules: {}, deleted: {},
    deletedMedia: {}, fieldUpdatedAt: {},
  });
});

describe("snapshot ⇄ hydrate — كلّ حقلٍ في AppData يعبر الدورة", () => {
  it("hydrate ثمّ snapshot يُعيد اللقطة نفسها حقلاً حقلاً", () => {
    useAppStore.getState().hydrate(FULL);
    const out = useAppStore.getState().snapshot();
    for (const key of Object.keys(FULL) as (keyof AppData)[]) {
      expect(out[key], `الحقل ${key} لم يعبر hydrate/snapshot`).toEqual(FULL[key]);
    }
  });

  it("الأصول تصل من السحابة إلى جهازٍ جديد (0.1.298 كان يغلقها جزئياً فقط)", () => {
    expect(useAppStore.getState().assets).toEqual([]);
    useAppStore.getState().hydrate(FULL);
    expect(useAppStore.getState().assets).toEqual(FULL.assets);
  });

  it("hydrate لا يختم lastUpdated من جديد (وإلّا انهارت مقارنة الأحدث)", () => {
    useAppStore.getState().hydrate(FULL);
    expect(useAppStore.getState().lastUpdated).toBe(FULL.lastUpdated);
  });
});

describe("أختام التعديل لكل عنصر — يضعها المتجر تلقائياً", () => {
  it("تعديل كتابٍ قائم يختمه، ولا يمسّ كتاباً لم يتغيّر", () => {
    useAppStore.getState().hydrate({
      ...FULL,
      books: [...FULL.books, { id: "b2", title: "ثانٍ", author: "", totalPages: 10, currentPage: 0, status: "أقرأ" }],
    });
    const before = Date.now();
    useAppStore.getState().updateBook("b1", { currentPage: 99 });
    const books = useAppStore.getState().books;
    expect(books.find((b) => b.id === "b1")!.updatedAt).toBeGreaterThanOrEqual(before);
    expect(books.find((b) => b.id === "b2")!.updatedAt).toBeUndefined();
  });

  it("يختم العادات والصناديق والتصنيفات والرسائل والتأمّلات كذلك", () => {
    useAppStore.getState().hydrate(FULL);
    const before = Date.now();
    useAppStore.getState().updateHabit("h1", { name: "مشي 30د" });
    useAppStore.getState().updateReserve("f1", { target: 5000 });
    useAppStore.getState().updateCategory("c1", { label: "قهوة الصباح" });
    useAppStore.getState().openFutureLetter("l1");
    useAppStore.getState().updateReflection("q1", { text: "محرَّر" });
    const s = useAppStore.getState();
    for (const stamp of [
      s.habits[0].updatedAt, s.reserves[0].updatedAt,
      s.categories[0].updatedAt, s.futureLetters[0].updatedAt, s.quranReflections[0].updatedAt,
    ]) expect(stamp).toBeGreaterThanOrEqual(before);
  });

  it("حالةُ الصلاة تُختم لكلّ صلاةٍ على حدة، والسقف بطابع تصنيفه", () => {
    useAppStore.getState().hydrate(FULL);
    const before = Date.now();
    useAppStore.getState().setPrayerStatus("2026-05-01", "الظهر", "منفردة");
    useAppStore.getState().setBudget("c1", { limit: 1200 });
    const s = useAppStore.getState();
    const day = s.prayerLogs.find((p) => p.date === "2026-05-01")!;
    expect(day.prayerUpdatedAt?.الظهر).toBeGreaterThanOrEqual(before);
    // الفجر كان مسجّلاً في اللقطة ولم يُمسّ — لا طابع له من هذا التعديل.
    expect(day.prayerUpdatedAt?.الفجر).toBeUndefined();
    expect(s.budgets.find((b) => b.category === "c1")!.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("تسجيلُ يومِ عادةٍ لا يرفع طابع العادة (للسجلّات دمجُها وشواهدها)", () => {
    useAppStore.getState().hydrate(FULL);
    useAppStore.getState().updateHabit("h1", { name: "مشي 30د" });
    const stampAfterRename = useAppStore.getState().habits[0].updatedAt!;
    useAppStore.getState().toggleHabitLog("h1", "2026-05-09");
    const s = useAppStore.getState();
    expect(s.habits[0].logs).toContain("2026-05-09");
    expect(s.habits[0].updatedAt).toBe(stampAfterRename); // لم يتحرّك
  });

  it("إيداعٌ في صندوقٍ لا يرفع طابع الصندوق", () => {
    useAppStore.getState().hydrate(FULL);
    useAppStore.getState().updateReserve("f1", { target: 9000 });
    const stampAfterEdit = useAppStore.getState().reserves[0].updatedAt!;
    useAppStore.getState().addReserveDeposit("f1", { id: "d2", amount: 300, date: "2026-05-09" });
    const s = useAppStore.getState();
    expect(s.reserves[0].deposits).toHaveLength(2);
    expect(s.reserves[0].updatedAt).toBe(stampAfterEdit);
  });

  it("تعديلُ وسائط مذكرةٍ وحده لا يرفع طابع محتواها، وتعديلُ النصّ يرفعه", () => {
    useAppStore.getState().hydrate(FULL);
    useAppStore.getState().updateJournalEntry("e1", { content: "نصٌّ محرَّر" });
    const afterText = useAppStore.getState().journalEntries[0].updatedAt!;
    expect(afterText).toBeGreaterThan(0);
    useAppStore.getState().updateJournalEntry("e1", { photos: ["data:img-a"] });
    const s = useAppStore.getState();
    expect(s.journalEntries[0].photos).toEqual(["data:img-a"]);
    expect(s.journalEntries[0].updatedAt).toBe(afterText); // الوسائط لا تُعدّ تعديلاً
  });

  it("هدفُ الصفحات اليومي يُختم بمفتاحه، وتقدّمُ الختمة بمفتاحه", () => {
    useAppStore.getState().hydrate(FULL);
    useAppStore.getState().setKhatmaPageGoal(15);
    let f = useAppStore.getState().fieldUpdatedAt ?? {};
    expect(f.khatmaGoal).toBeGreaterThan(0);
    expect(f.quranKhatma).toBeUndefined(); // ضبطُ الهدف ليس تقدّماً
    useAppStore.getState().setKhatmaPage(300);
    f = useAppStore.getState().fieldUpdatedAt ?? {};
    expect(f.quranKhatma).toBeGreaterThan(0);
  });

  it("إعادةُ ترتيب التصنيفات وحدها تختم categoriesOrder", () => {
    useAppStore.getState().hydrate({
      ...FULL,
      categories: [
        { id: "c1", label: "أ", icon: "☕", color: "#000" },
        { id: "c2", label: "ب", icon: "🧺", color: "#000" },
      ],
    });
    expect(useAppStore.getState().fieldUpdatedAt?.categoriesOrder).toBeUndefined();
    useAppStore.getState().moveCategory("c2", -1);
    expect(useAppStore.getState().categories.map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(useAppStore.getState().fieldUpdatedAt?.categoriesOrder).toBeGreaterThan(0);
  });

  it("تعلّمُ تاجرٍ يختم مفتاحه في fieldUpdatedAt", () => {
    useAppStore.getState().hydrate(FULL);
    useAppStore.getState().rememberMerchant("ستاربكس فرع الملز", "c1");
    const stamps = useAppStore.getState().fieldUpdatedAt ?? {};
    const keys = Object.keys(stamps).filter((k) => k.startsWith("merchant:"));
    expect(keys.length).toBeGreaterThan(0);
    expect(stamps[keys[0]]).toBeGreaterThan(0);
  });
});
