import { describe, it, expect, vi, beforeEach } from "vitest";

// المخزن الوهمي: نفس شكل idb-keyval الذي يكتب فيه sync.ts#localMediaPut.
const idbStore = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idbStore.get(k),
  set: async (k: string, v: unknown) => { idbStore.set(k, v); },
}));

const {
  MEDIA_CACHE_PREFIX, peekMedia, requestMedia, subscribeMedia,
  __resetMediaCache, __memBytes, setRemoteMediaFetcher,
} = await import("./mediaCache");

const put = (hash: string, bytes: number) =>
  idbStore.set(MEDIA_CACHE_PREFIX + hash, "data:image/jpeg;base64," + "A".repeat(bytes));

/** ينتظر إشعاراً واحداً من المخبّأ (القراءة غير متزامنة). */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  idbStore.clear();
  __resetMediaCache();
});

describe("mediaCache — القراءة عند العرض", () => {
  it("لا شيء حاضرٌ قبل الطلب، ويحضر بعده", async () => {
    put("h1", 100);
    expect(peekMedia("h1")).toBeNull();
    requestMedia("h1", "photos");
    await settle();
    expect(peekMedia("h1")).toContain("data:image/jpeg");
  });

  it("يُشعر المشتركين لحظة وصول البايتات", async () => {
    put("h1", 100);
    const cb = vi.fn();
    subscribeMedia(cb);
    requestMedia("h1", "photos");
    await settle();
    expect(cb).toHaveBeenCalled();
  });

  it("هاشٌ غائبٌ عن المخزن لا يُسأل عنه مرّتين", async () => {
    requestMedia("ghost", "photos");
    await settle();
    const before = idbStore.size;
    requestMedia("ghost", "photos"); // في كل رسمٍ لاحق — يجب أن يكون خاملاً
    await settle();
    expect(peekMedia("ghost")).toBeNull();
    expect(idbStore.size).toBe(before);
  });
});

// **هذه هي الضمانة التي تمنع عودة العطل**: مخبّأٌ بلا حدّ في الذاكرة يعيد
// إنتاج قتلِ التبويب نفسه (2113 وسيطاً ≈ 692 ميغابايت) بعد بضع لفّات تمرير.
describe("mediaCache — سقف الذاكرة", () => {
  it("لا يتجاوز الميزانية مهما طُلب، ويُخرج الأقدم استعمالاً", async () => {
    const MB = 1024 * 1024;
    // 60 وسيطاً × 1 ميغابايت = 60 ميغابايت، والسقف 32.
    for (let i = 0; i < 60; i++) put(`h${i}`, MB);
    for (let i = 0; i < 60; i++) {
      requestMedia(`h${i}`, "photos");
      await settle();
    }
    expect(__memBytes()).toBeLessThanOrEqual(32 * MB);
    // الأحدث باقٍ، والأقدم أُخرج — وإخراجه ليس فقداً: بايتاته في المخزن.
    expect(peekMedia("h59")).not.toBeNull();
    expect(peekMedia("h0")).toBeNull();
    expect(idbStore.has(MEDIA_CACHE_PREFIX + "h0")).toBe(true);
  });

  it("القراءة تُنعش العنصر فلا يُخرَج قبل غيره", async () => {
    const MB = 1024 * 1024;
    for (let i = 0; i < 20; i++) put(`h${i}`, 2 * MB);
    // خمسة عشر × 2 ميغابايت = 30 ميغابايت — تحت السقف بهامشٍ يكفي، فلا يقع
    // إخراجٌ قبل أن نصل إلى ما نقيسه فعلاً.
    for (let i = 0; i < 15; i++) { requestMedia(`h${i}`, "photos"); await settle(); }
    peekMedia("h0"); // استُعمل للتوّ → ينتقل للمؤخّرة
    requestMedia("h15", "photos"); // السادس عشر يتجاوز السقف → يُخرِج واحداً من المقدّمة
    await settle();
    expect(peekMedia("h0")).not.toBeNull(); // نجا …
    expect(peekMedia("h1")).toBeNull(); // … وأُخرج الذي صار أقدم منه
  });

  it("وسيطٌ أكبر من الميزانية وحده لا يُخزَّن فلا يُفرغ المخبّأ", async () => {
    const MB = 1024 * 1024;
    put("small", MB);
    requestMedia("small", "photos");
    await settle();
    put("huge", 40 * MB);
    requestMedia("huge", "photos");
    await settle();
    expect(peekMedia("small")).not.toBeNull(); // لم يُدهس لأجل عملاقٍ لا يسع
    expect(peekMedia("huge")).toBeNull();
    expect(__memBytes()).toBeLessThanOrEqual(32 * MB);
  });
});

// الجالب الاحتياطي: مرجعٌ بايتاته ليست على الجهاز بعد (جهازٌ جديد، أو وسيطٌ
// تجاوز ميزانية الترطيب) يجب أن يظهر لا أن يختفي صامتاً.
describe("mediaCache — الجالب الاحتياطي من R2", () => {
  it("يجلب ما ليس على الجهاز، ولا يعيد الرحلة بعد النجاح", async () => {
    const fetcher = vi.fn(async () => "data:image/jpeg;base64,REMOTE");
    setRemoteMediaFetcher(fetcher);
    requestMedia("far", "photos");
    await settle();
    expect(peekMedia("far")).toBe("data:image/jpeg;base64,REMOTE");
    requestMedia("far", "photos");
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("يمرّر النوع الصحيح — الصوت لا يُطلب من مساحة الصور", async () => {
    const fetcher = vi.fn(async () => null);
    setRemoteMediaFetcher(fetcher);
    requestMedia("snd", "audios");
    await settle();
    expect(fetcher).toHaveBeenCalledWith("snd", "audios");
  });

  it("المحليّ أولاً — وجودُ البايتات محلياً لا يستدعي الشبكة إطلاقاً", async () => {
    put("local", 100);
    const fetcher = vi.fn(async () => "data:remote");
    setRemoteMediaFetcher(fetcher);
    requestMedia("local", "photos");
    await settle();
    expect(peekMedia("local")).toContain("data:image/jpeg");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("تسجيلُ الجالب يُعيد فتح بابِ مرجعٍ فشل قبل الاتصال", async () => {
    requestMedia("later", "photos"); // لا جالب بعد → يُسجَّل غائباً
    await settle();
    expect(peekMedia("later")).toBeNull();
    setRemoteMediaFetcher(async () => "data:arrived");
    requestMedia("later", "photos"); // يُسأل مجدداً لا يُتجاهل
    await settle();
    expect(peekMedia("later")).toBe("data:arrived");
  });
});
