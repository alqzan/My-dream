import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSaveScheduler, SAVE_DEBOUNCE_MS, RETRY_BASE_MS, RETRY_MAX_MS } from "./saveScheduler";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** حافظٌ وهميّ يُمسك الوعد بيده، فنقرّر متى ينتهي وكيف. */
function deferredSaver() {
  const calls: { resolve: () => void; reject: (e?: unknown) => void }[] = [];
  const save = () =>
    new Promise<void>((resolve, reject) => { calls.push({ resolve, reject }); });
  return {
    save,
    get count() { return calls.length; },
    settle: async (i = calls.length - 1) => { calls[i].resolve(); await vi.advanceTimersByTimeAsync(0); },
    fail: async (i = calls.length - 1) => { calls[i].reject(new Error("offline")); await vi.advanceTimersByTimeAsync(0); },
  };
}

describe("createSaveScheduler — الحفظ المؤجّل", () => {
  it("يجمع رشقةَ تعديلاتٍ في حفظٍ واحد بعد المهلة", async () => {
    const s = deferredSaver();
    const sch = createSaveScheduler({ save: s.save });
    sch.schedule();
    sch.schedule();
    sch.schedule();
    expect(s.count).toBe(0); // لم تنقضِ المهلة بعد
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(s.count).toBe(1);
    await s.settle();
    expect(sch.pending()).toBe(false);
  });

  it("لا يحفظ من العدم: إفراغٌ بلا تعديلٍ معلّق لا يفعل شيئاً", async () => {
    const s = deferredSaver();
    const sch = createSaveScheduler({ save: s.save });
    sch.flush();
    sch.flush();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 3);
    expect(s.count).toBe(0);
  });
});

describe("إخفاء الصفحة", () => {
  it("يُفرِغ الحفظ المؤجّل فوراً بدل انتظار المهلة", async () => {
    const s = deferredSaver();
    const sch = createSaveScheduler({ save: s.save });
    sch.schedule();
    sch.flush(); // visibilitychange → hidden
    expect(s.count).toBe(1); // بلا تقديمِ أيّ مؤقّت
  });

  it("visibilitychange ثمّ pagehide = إفراغٌ واحد لا اثنان", async () => {
    const s = deferredSaver();
    const sch = createSaveScheduler({ save: s.save });
    sch.schedule();
    sch.flush(); // visibilitychange
    sch.flush(); // pagehide — تقعان معاً في الانتقال الواحد على iOS
    sch.flush();
    expect(s.count).toBe(1);
  });

  // **البقّة الأصلية**: كان `saveTimer.current` يبقى محمّلاً برقم مؤقّتٍ انتهى،
  // فيرى `flush` «حفظاً معلّقاً» لا وجود له، فيحفظ مع كلّ إخفاءٍ للصفحة بلا سبب.
  it("لا يُعيد الحفظ عند كلّ إخفاءٍ بعد أن انطلق المؤقّت وانتهى", async () => {
    const s = deferredSaver();
    const sch = createSaveScheduler({ save: s.save });
    sch.schedule();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS); // انطلق المؤقّت
    expect(s.count).toBe(1);
    await s.settle();

    sch.flush(); // إخفاءٌ بعد أن استقرّ كلّ شيء
    sch.flush();
    sch.flush();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 3);
    expect(s.count).toBe(1); // لا حفظَ ثانٍ من شبح مؤقّت
  });
});

describe("لا حفظين متوازيين", () => {
  it("تعديلٌ أثناء حفظٍ جارٍ لا يُطلق حفظاً موازياً", async () => {
    const s = deferredSaver();
    const sch = createSaveScheduler({ save: s.save });
    sch.schedule();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(s.count).toBe(1);

    sch.schedule(); // تعديلٌ والحفظ الأوّل ما زال في الطريق
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 2);
    expect(s.count).toBe(1); // ولا واحدٌ إضافيّ بجانبه
  });

  it("ويُحفظ بعد انتهائه (رايةُ dirty لا تسقط)", async () => {
    const s = deferredSaver();
    const sch = createSaveScheduler({ save: s.save });
    sch.schedule();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    sch.schedule(); // تعديلٌ أثناء الحفظ — لم تشمله الرحلة الجارية
    await s.settle();
    expect(sch.pending()).toBe(true);
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(s.count).toBe(2); // حفظٌ ثانٍ يحمل التعديل الذي فات
    await s.settle();
    expect(sch.pending()).toBe(false);
  });

  it("والإفراغ أثناء حفظٍ جارٍ لا يشقّ حفظاً ثانياً", async () => {
    const s = deferredSaver();
    const sch = createSaveScheduler({ save: s.save });
    sch.schedule();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    sch.schedule();
    sch.flush();
    expect(s.count).toBe(1);
  });
});

describe("إعادة المحاولة بتباعدٍ متضاعف", () => {
  it("تعيد المحاولة بعد الفشل، وتضاعف المهلة، وتُبلّغ مرّةً لكلّ فشل", async () => {
    const s = deferredSaver();
    const onError = vi.fn();
    const sch = createSaveScheduler({ save: s.save, onError });
    sch.schedule();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    await s.fail();
    expect(onError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RETRY_BASE_MS - 1);
    expect(s.count).toBe(1); // لم تحن بعد
    await vi.advanceTimersByTimeAsync(1);
    expect(s.count).toBe(2);

    await s.fail();
    await vi.advanceTimersByTimeAsync(RETRY_BASE_MS * 2 - 1);
    expect(s.count).toBe(2); // التباعد تضاعف
    await vi.advanceTimersByTimeAsync(1);
    expect(s.count).toBe(3);
    await s.settle();
    expect(sch.pending()).toBe(false);
  });

  it("لا يتجاوز التباعدُ سقفَه", async () => {
    const s = deferredSaver();
    const sch = createSaveScheduler({ save: s.save });
    sch.schedule();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    for (let i = 0; i < 8; i++) {
      await s.fail();
      await vi.advanceTimersByTimeAsync(RETRY_MAX_MS);
    }
    const before = s.count;
    await vi.advanceTimersByTimeAsync(RETRY_MAX_MS + 1);
    expect(s.count).toBe(before); // آخرُ محاولةٍ ما زالت في الطريق، ولا سيلَ محاولات
  });

  it("تعديلٌ جديد يُلغي إعادةَ المحاولة المعلّقة (لقطتُه تشملها)", async () => {
    const s = deferredSaver();
    const sch = createSaveScheduler({ save: s.save });
    sch.schedule();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    await s.fail();

    sch.schedule(); // تعديلٌ جديد قبل موعد إعادة المحاولة
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(s.count).toBe(2);
    await vi.advanceTimersByTimeAsync(RETRY_MAX_MS);
    expect(s.count).toBe(2); // ولا إعادةَ محاولةٍ يتيمة تنطلق فوقه
  });

  it("والإفراغ عند الإخفاء يقدّم إعادةَ المحاولة المعلّقة", async () => {
    const s = deferredSaver();
    const sch = createSaveScheduler({ save: s.save });
    sch.schedule();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    await s.fail();
    sch.flush();
    expect(s.count).toBe(2);
  });
});

describe("التفكيك", () => {
  it("يوقف كلّ مؤقّتٍ معلّق فلا يحفظ بعد إزالة المكوّن", async () => {
    const s = deferredSaver();
    const sch = createSaveScheduler({ save: s.save });
    sch.schedule();
    sch.dispose();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 3);
    expect(s.count).toBe(0);
    sch.schedule();
    sch.flush();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 3);
    expect(s.count).toBe(0);
  });

  it("ولا يجدول إعادةَ محاولةٍ لفشلٍ وصل بعد التفكيك", async () => {
    const s = deferredSaver();
    const sch = createSaveScheduler({ save: s.save });
    sch.schedule();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    sch.dispose();
    await s.fail();
    await vi.advanceTimersByTimeAsync(RETRY_MAX_MS * 2);
    expect(s.count).toBe(1);
  });
});
