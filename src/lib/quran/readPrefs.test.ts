import { describe, it, expect } from "vitest";
import { readPrefsFrom, skinFrom, clampZoom, DEFAULT_READ_PREFS } from "./readPrefs";

// تفضيلاتُ القراءة تُقرأ من تخزينٍ كتبته نسخةٌ أقدم (أو يدٌ عابثة) — فالحارس
// هنا أنّ كلَّ قيمةٍ لا تُعرف تعود إلى الافتراضيّ بدل أن تصل صنفَ CSS لا وجود
// له (`mushaf-skin-undefined`) فيخرج الوجه بلا ورقٍ ولا حبر.
describe("readPrefsFrom", () => {
  it("يعود إلى الافتراضيّ حين لا تخزين", () => {
    expect(readPrefsFrom(null)).toEqual(DEFAULT_READ_PREFS);
    expect(readPrefsFrom("ورق")).toEqual(DEFAULT_READ_PREFS);
  });

  it("يقرأ النموذج المعروف ويردّ المجهول إلى الافتراضيّ", () => {
    expect(readPrefsFrom({ skin: "night" }).skin).toBe("night");
    expect(readPrefsFrom({ skin: "zebra" }).skin).toBe(DEFAULT_READ_PREFS.skin);
    expect(readPrefsFrom({ skin: 7 }).skin).toBe(DEFAULT_READ_PREFS.skin);
    expect(skinFrom(undefined)).toBe(DEFAULT_READ_PREFS.skin);
  });

  it("يقرأ ملء الطول منطقياً وحده", () => {
    expect(readPrefsFrom({ fill: false }).fill).toBe(false);
    expect(readPrefsFrom({ fill: "نعم" }).fill).toBe(DEFAULT_READ_PREFS.fill);
  });

  it("يحفظ التكبير مع النموذج ولا يمحو أحدهما الآخر", () => {
    expect(readPrefsFrom({ zoom: 1.5, skin: "plain", fill: false }))
      .toEqual({ zoom: 1.5, skin: "plain", fill: false });
  });

  // التفضيل القديم (حجمُ خطٍّ وتباعد) يُترجَم تكبيراً — ومعه نموذجٌ افتراضيّ.
  it("يترجم التفضيل القديم ولا يفقد النموذج", () => {
    expect(readPrefsFrom({ size: 33 })).toEqual({ zoom: clampZoom(33 / 22), skin: "warm", fill: true });
    expect(readPrefsFrom({ size: 33, skin: "madina" }).skin).toBe("madina");
  });
});
