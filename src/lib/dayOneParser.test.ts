// حارس محلّل Day One.
//
// كانت التغطية على **مستوى المتجر** وحده (`dayOneImport.batch.test.ts` و
// `dayOneImport.store.test.ts`): تتحقّق أنّ ما خرج من المحلّل يُدمج ويُختم
// ويُزال تكرارُه صحيحاً. أمّا المحلّل نفسه — 501 سطراً تقرأ ملفاً **من خارج
// التطبيق** بصيغةٍ لا نتحكّم فيها — فلم يكن عليه اختبارٌ واحد.
//
// ما يُختبر هنا هو `parseDayOneJson` وما تحته من تنظيفِ نصٍّ وتواريخ ووسوم.
// (مسارُ الـZIP يحتاج فكّ ضغطٍ وDOM ومعالجةَ صور، ويغطّيه اختبارا الدفعات
// والمتجر.)
import { describe, it, expect } from "vitest";
import { parseDayOneJson } from "./dayOneParser";
import { today } from "./utils";

const wrap = (entries: unknown[]) => JSON.stringify({ entries });

const entry = (over: Record<string, unknown> = {}) => ({
  uuid: "U1",
  creationDate: "2026-03-14T09:30:00Z",
  text: "نصّ المذكرة.",
  ...over,
});

describe("parseDayOneJson — الملفّ نفسه", () => {
  it("يرفض ملفاً مضغوطاً مرفوعاً كنصّ برسالةٍ مفهومة", () => {
    expect(() => parseDayOneJson("PK ...")).toThrow(/مضغوط/);
  });

  it("يرفض JSON غير صالح", () => {
    expect(() => parseDayOneJson("{ليس json}")).toThrow(/غير صالح/);
  });

  it("يرفض ملفاً بلا مصفوفة entries", () => {
    expect(() => parseDayOneJson(JSON.stringify({ foo: 1 }))).toThrow(/مدخلات/);
    expect(() => parseDayOneJson(JSON.stringify({ entries: "لا مصفوفة" }))).toThrow(/مدخلات/);
  });

  it("ملفٌّ بلا مدخلات ينجح بصفر", () => {
    const r = parseDayOneJson(wrap([]));
    expect(r.entries).toHaveLength(0);
    expect(r.totalInFile).toBe(0);
    expect(r.skippedEmpty).toBe(0);
  });
});

describe("parseDayOneJson — الهويّة والتكرار", () => {
  it("المعرّف مشتقٌّ من UUID فيثبت عبر الأجهزة وإعادات الاستيراد", () => {
    const a = parseDayOneJson(wrap([entry()])).entries[0];
    const b = parseDayOneJson(wrap([entry()])).entries[0];
    expect(a.id).toBe("do-U1");
    expect(b.id).toBe(a.id);
    expect(a.dayOneUUID).toBe("U1");
    expect(a.source).toBe("dayOne");
  });

  it("مدخلةٌ بلا UUID تأخذ معرّفاً احتياطياً لا تتصادم به", () => {
    const r = parseDayOneJson(wrap([entry({ uuid: undefined, text: "أ" }), entry({ uuid: undefined, text: "ب" })]));
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0].id).not.toBe(r.entries[1].id);
  });
});

describe("parseDayOneJson — التاريخ والوقت", () => {
  it("يقرأ التاريخ والوقت بمنطقة المدخلة لا بالـUTC", () => {
    // 2026-03-14T22:30Z في الرياض (UTC+3) هو اليوم التالي 01:30.
    const r = parseDayOneJson(
      wrap([entry({ creationDate: "2026-03-14T22:30:00Z", timeZone: "Asia/Riyadh" })])
    );
    expect(r.entries[0].date).toBe("2026-03-15");
    expect(r.entries[0].time).toBe("01:30");
  });

  it("بلا منطقةٍ زمنية يبقى التاريخ صالحاً", () => {
    const r = parseDayOneJson(wrap([entry({ creationDate: "2026-03-14T09:30:00Z" })]));
    expect(r.entries[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("منطقةٌ زمنية مجهولة لا ترمي — يسقط إلى تاريخ النصّ", () => {
    const r = parseDayOneJson(
      wrap([entry({ creationDate: "2026-03-14T09:30:00Z", timeZone: "Mars/Olympus" })])
    );
    expect(r.entries[0].date).toBe("2026-03-14");
  });

  it("تاريخٌ مشوّه لا يرمي — يسقط إلى اليوم", () => {
    const r = parseDayOneJson(wrap([entry({ creationDate: "ليس تاريخاً" })]));
    expect(r.entries[0].date).toBe(today());
  });

  it("غياب creationDate لا يرمي", () => {
    const r = parseDayOneJson(wrap([entry({ creationDate: undefined })]));
    expect(r.entries[0].date).toBe(today());
  });

  it("منتصفُ الليل يعني «بلا وقت» فلا يُخزَّن 00:00", () => {
    // تدوينةُ يومٍ كامل في Day One تحمل منتصف ليل منطقتها — لا الساعة ١٢ ليلاً.
    const r = parseDayOneJson(
      wrap([entry({ creationDate: "2021-08-11T21:00:00Z", timeZone: "Asia/Riyadh" })])
    );
    expect(r.entries[0].date).toBe("2021-08-12");
    expect(r.entries[0].time).toBeUndefined();
  });
});

describe("parseDayOneJson — العنوان بلا رموز", () => {
  it("عنوانٌ من ترويسةٍ مهروبة يصل نظيفاً", () => {
    const r = parseDayOneJson(
      wrap([entry({ text: "###### اليوم بسوي \\.\\.\\.\\.\\.\n وكتبت عن يومي كلّه بتفصيل." })])
    );
    expect(r.entries[0].title).toBe("اليوم بسوي .....");
  });
});

describe("parseDayOneJson — تنظيف النصّ", () => {
  it("يُسقط تضمينات الوسائط ولا يتركها نصّاً حرفياً", () => {
    const r = parseDayOneJson(
      wrap([entry({ text: "قبل\n![](dayone-moment://ABC123)\nبعد" })])
    );
    expect(r.entries[0].content).not.toMatch(/dayone-moment/);
    expect(r.entries[0].content).toContain("قبل");
    expect(r.entries[0].content).toContain("بعد");
  });

  it("يُسقط روابط dayone العارية أيضاً", () => {
    const r = parseDayOneJson(wrap([entry({ text: "نصّ (dayone-audio://XYZ) تكملة" })]));
    expect(r.entries[0].content).not.toMatch(/dayone-audio/);
  });

  it("العنوان العربي الأول يصير عنواناً لا جزءاً من النصّ", () => {
    const r = parseDayOneJson(wrap([entry({ text: "## يومٌ هادئ\nثمّ جاء المساء وكتبت." })]));
    expect(r.entries[0].title).toBe("يومٌ هادئ");
    expect(r.entries[0].content).not.toContain("يومٌ هادئ");
    expect(r.entries[0].content).toContain("المساء");
  });

  it("عنوانُ «Daily Prompt» الإنجليزي يُحذف ولا يصير عنواناً", () => {
    const r = parseDayOneJson(
      wrap([entry({ text: "###### What made you smile today?\nكتبت عن يومي." })])
    );
    expect(r.entries[0].title).toBeUndefined();
    expect(r.entries[0].content).toBe("كتبت عن يومي.");
  });

  it("سطرٌ أوّل قصير بلا ترقيمٍ نهائي يُقرأ عنواناً", () => {
    const r = parseDayOneJson(
      wrap([entry({ text: "رحلة الطائف\nخرجنا فجراً وكان الجوّ بارداً، ووصلنا قبل الظهر بقليل." })])
    );
    expect(r.entries[0].title).toBe("رحلة الطائف");
    expect(r.entries[0].content).toMatch(/^خرجنا/);
  });

  it("سطرٌ أوّل ينتهي بترقيمٍ ليس عنواناً", () => {
    const r = parseDayOneJson(
      wrap([entry({ text: "كان اليوم جميلاً.\nثمّ خرجنا في المساء وتمشّينا طويلاً في الحيّ." })])
    );
    expect(r.entries[0].title).toBeUndefined();
    expect(r.entries[0].content).toMatch(/^كان اليوم/);
  });

  it("يقرأ richText حين لا يوجد text", () => {
    const richText = JSON.stringify({
      contents: [{ text: "من " }, { text: "النصّ الغنيّ." }],
    });
    const r = parseDayOneJson(wrap([entry({ text: undefined, richText })]));
    expect(r.entries[0].content).toBe("من النصّ الغنيّ.");
  });

  it("richText مشوّه لا يرمي", () => {
    const r = parseDayOneJson(
      wrap([entry({ text: undefined, richText: "{ليس json}", tags: ["وسم"] })])
    );
    // بلا نصٍّ ولا عنوان → تُتخطّى بوصفها فارغة، والمهمّ ألّا ترمي.
    expect(r.totalInFile).toBe(1);
    expect(r.skippedEmpty).toBe(1);
  });
});

describe("parseDayOneJson — الوسوم والتمييز والفيديو", () => {
  it("يُزيل تكرار الوسوم ويقلّم الفراغ", () => {
    const r = parseDayOneJson(wrap([entry({ tags: [" سفر ", "سفر", "عائلة", "  "] })]));
    expect(r.entries[0].tags).toEqual(["سفر", "عائلة"]);
  });

  it("بلا وسوم لا يُكتب الحقل أصلاً", () => {
    expect(parseDayOneJson(wrap([entry()])).entries[0].tags).toBeUndefined();
  });

  it("starred يُنقل حين يكون true فقط", () => {
    expect(parseDayOneJson(wrap([entry({ starred: true })])).entries[0].starred).toBe(true);
    expect(parseDayOneJson(wrap([entry({ starred: false })])).entries[0].starred).toBeUndefined();
  });

  it("الفيديو إشارةٌ خفيفة لا ملفّاً", () => {
    const r = parseDayOneJson(
      wrap([entry({ videos: [{ type: "mov", duration: 12.5 }, { type: "mp4" }] })])
    );
    expect(r.entries[0].videoRefs).toEqual([{ type: "mov", duration: 12.5 }, { type: "mp4" }]);
  });

  it("مدخلةٌ بلا نصّ لكن بفيديو تُحفظ ولا تُعدّ فارغة", () => {
    const r = parseDayOneJson(wrap([entry({ text: "", videos: [{ type: "mov" }] })]));
    expect(r.entries).toHaveLength(1);
    expect(r.skippedEmpty).toBe(0);
  });
});

describe("parseDayOneJson — المحاسبة الصادقة", () => {
  it("يعدّ المتخطّى الفارغ ولا يخلطه بالمستورد", () => {
    const r = parseDayOneJson(wrap([entry({ uuid: "A" }), entry({ uuid: "B", text: "   " }), entry({ uuid: "C" })]));
    expect(r.totalInFile).toBe(3);
    expect(r.entries).toHaveLength(2);
    expect(r.skippedEmpty).toBe(1);
  });

  it("استيراد JSON نصّيٌّ بالتصميم: لا يدّعي وسائط", () => {
    // الصور والصوت تعيش في الـZIP؛ لو ادّعى هذا المسار استيرادها لظهر
    // استيرادٌ ناقص على أنّه نجاحٌ نظيف.
    const r = parseDayOneJson(wrap([entry({ photos: [{ md5: "x", type: "jpeg" }] })]));
    expect(r.photosReferenced).toBe(0);
    expect(r.photosImported).toBe(0);
    expect(r.audiosReferenced).toBe(0);
    expect(r.audiosImported).toBe(0);
  });
});
