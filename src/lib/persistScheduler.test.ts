// حارسُ التخزين المؤجَّل. الخطر الذي يحرسه ليس البطء بل **الفقد**: التأجيل
// يوسّع نافذة الضياع عند الإغلاق المفاجئ، فكلّ ما يضمن نزول آخر قيمةٍ إلى
// القرص يجب أن يكون مختبَراً — لا مفترضاً.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDeferredStorage, PERSIST_DEBOUNCE_MS } from "./persistScheduler";
import type { StateStorage } from "zustand/middleware";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** تخزينٌ وهميّ يعدّ الكتابات ويحتفظ بالقيم. */
function fakeStore() {
  const data = new Map<string, string>();
  const writes: string[] = [];
  const removes: string[] = [];
  const storage: StateStorage = {
    getItem: async (n) => data.get(n) ?? null,
    setItem: async (n, v) => { writes.push(v); data.set(n, v); },
    removeItem: async (n) => { removes.push(n); data.delete(n); },
  };
  return { storage, data, writes, removes };
}

const K = "my-dream-store";

describe("createDeferredStorage — تجميع الكتابات", () => {
  it("رشقةُ كتاباتٍ تنزل كتابةً واحدة بآخر قيمة", async () => {
    const f = fakeStore();
    const s = createDeferredStorage(f.storage);
    await s.setItem(K, "a");
    await s.setItem(K, "b");
    await s.setItem(K, "c");
    expect(f.writes).toHaveLength(0); // لم تنقضِ المهلة
    await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
    // واحدةٌ لا ثلاث — وهذا كلّ المكسب.
    expect(f.writes).toEqual(["c"]);
    expect(f.data.get(K)).toBe("c");
  });

  it("لا تكتب قبل انقضاء المهلة", async () => {
    const f = fakeStore();
    const s = createDeferredStorage(f.storage, { delayMs: 1000 });
    await s.setItem(K, "a");
    await vi.advanceTimersByTimeAsync(999);
    expect(f.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.writes).toEqual(["a"]);
  });

  it("كلّ كتابةٍ جديدة تُعيد بدء المهلة", async () => {
    const f = fakeStore();
    const s = createDeferredStorage(f.storage, { delayMs: 1000 });
    await s.setItem(K, "a");
    await vi.advanceTimersByTimeAsync(800);
    await s.setItem(K, "b");
    await vi.advanceTimersByTimeAsync(800);
    expect(f.writes).toHaveLength(0); // أُعيد ضبطها
    await vi.advanceTimersByTimeAsync(200);
    expect(f.writes).toEqual(["b"]);
  });
});

describe("createDeferredStorage — الإفراغ (ما يمنع الفقد)", () => {
  it("flush تُنزل المعلّق فوراً بلا انتظار المهلة", async () => {
    const f = fakeStore();
    const s = createDeferredStorage(f.storage);
    await s.setItem(K, "a");
    await s.flush();
    expect(f.writes).toEqual(["a"]);
  });

  it("flush خاملةٌ إن لم يكن ثمّ شيء — فإخفاءان يُنتجان إفراغاً واحداً", async () => {
    const f = fakeStore();
    const s = createDeferredStorage(f.storage);
    await s.setItem(K, "a");
    await s.flush();
    // visibilitychange ثمّ pagehide في الانتقال الواحد على iOS.
    await s.flush();
    await s.flush();
    expect(f.writes).toEqual(["a"]);
  });

  it("لا كتابةَ من العدم حين لا شيء معلّق أصلاً", async () => {
    const f = fakeStore();
    const s = createDeferredStorage(f.storage);
    await s.flush();
    expect(f.writes).toHaveLength(0);
  });

  it("بعد الإفراغ لا ينطلق المؤقّت فيكتب مرّةً ثانية", async () => {
    const f = fakeStore();
    const s = createDeferredStorage(f.storage);
    await s.setItem(K, "a");
    await s.flush();
    await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
    expect(f.writes).toEqual(["a"]);
    expect(s.pending()).toBe(false);
  });
});

describe("createDeferredStorage — القراءة لا ترجع للخلف", () => {
  it("getItem تُرجع القيمة المعلّقة لا القديمة على القرص", async () => {
    const f = fakeStore();
    f.data.set(K, "قديم");
    const s = createDeferredStorage(f.storage);
    await s.setItem(K, "جديد");
    // لم تنزل بعد، ومع ذلك يجب أن يراها القارئ.
    expect(await s.getItem(K)).toBe("جديد");
    await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
    expect(await s.getItem(K)).toBe("جديد");
  });

  it("getItem تفوّض إلى الداخل حين لا شيء معلّق", async () => {
    const f = fakeStore();
    f.data.set(K, "على القرص");
    const s = createDeferredStorage(f.storage);
    expect(await s.getItem(K)).toBe("على القرص");
    expect(await s.getItem("مفتاح لا وجود له")).toBeNull();
  });
});

describe("createDeferredStorage — الحذف", () => {
  it("removeItem فوريّ ويُسقط كتابةً معلّقةً لنفس المفتاح", async () => {
    const f = fakeStore();
    const s = createDeferredStorage(f.storage);
    await s.setItem(K, "a");
    await s.removeItem(K);
    expect(f.removes).toEqual([K]);
    // لا تُحيي الكتابةُ المعلّقة ما حُذف.
    await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
    expect(f.writes).toHaveLength(0);
    expect(await s.getItem(K)).toBeNull();
  });
});

describe("createDeferredStorage — مفاتيح متعدّدة", () => {
  it("لا يخلط مفتاحين", async () => {
    const f = fakeStore();
    const s = createDeferredStorage(f.storage);
    await s.setItem("أ", "1");
    await s.setItem("ب", "2");
    await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
    expect(f.data.get("أ")).toBe("1");
    expect(f.data.get("ب")).toBe("2");
  });
});

describe("createDeferredStorage — التفكيك", () => {
  it("dispose تكتب ما عليها ثمّ تتوقّف", async () => {
    const f = fakeStore();
    const s = createDeferredStorage(f.storage);
    await s.setItem(K, "a");
    await s.dispose();
    expect(f.writes).toEqual(["a"]);
    await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS * 2);
    expect(f.writes).toEqual(["a"]);
  });

  it("كتابةٌ بعد dispose تنزل فوراً بلا تأجيل (لا تُبتلع صامتة)", async () => {
    const f = fakeStore();
    const s = createDeferredStorage(f.storage);
    await s.dispose();
    await s.setItem(K, "متأخّرة");
    expect(f.writes).toEqual(["متأخّرة"]);
  });
});

describe("createDeferredStorage — تعديلٌ أثناء الكتابة", () => {
  it("ما يقع أثناء كتابةٍ بطيئة لا يضيع", async () => {
    // كتابةٌ بطيئة نُمسك وعدها بيدنا، فنُدخل تعديلاً في منتصفها.
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const writes: string[] = [];
    let first = true;
    const inner: StateStorage = {
      getItem: async () => null,
      setItem: async (_n, v) => {
        writes.push(v);
        if (first) { first = false; await gate; }
      },
      removeItem: async () => {},
    };
    const s = createDeferredStorage(inner, { delayMs: 100 });

    await s.setItem(K, "أولى");
    await vi.advanceTimersByTimeAsync(100); // بدأت الكتابة الأولى وتوقّفت
    expect(writes).toEqual(["أولى"]);

    // تعديلٌ وقع والكتابة الأولى ما زالت معلّقة.
    await s.setItem(K, "ثانية");
    release();
    await vi.advanceTimersByTimeAsync(100);

    // الثانية نزلت أيضاً — لم تبتلعها الجولة الجارية.
    expect(writes).toEqual(["أولى", "ثانية"]);
    expect(s.pending()).toBe(false);
  });
});
