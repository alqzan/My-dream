import { describe, it, expect } from "vitest";
import { renderMarkdown, stripMarkdown, plainTitle, wordCount } from "./markdown";

// النصّ كما يخرج من Day One فعلاً: مربّعات مهام، فواصل ---، سؤالٌ يوميّ
// بستّة #، ونقاطٌ مهروبة (\.) — كلّها كانت تظهر حرفيّة قبل هذا.
const DAY_ONE = [
  "- [ ] صليت العشاء؟",
  "وصلنا اذان العشاء تقريبا.",
  "",
  "---",
  "",
  "- [x] هل تركت امس؟",
  "",
  "---",
  "",
  "###### ممتن اليوم لـ\\.\\.\\.\\.",
].join("\n");

describe("renderMarkdown", () => {
  it("يرسم مربّع المهمة بدل [ ] الحرفية", () => {
    const html = renderMarkdown("- [ ] صليت العشاء؟");
    expect(html).not.toContain("[ ]");
    expect(html).toContain("صليت العشاء؟");
    expect(html).toContain("list-none");
  });

  it("يميّز المهمة المنجزة بعلامة وشطب", () => {
    const html = renderMarkdown("- [x] صليت الفجر");
    expect(html).toContain("✓");
    expect(html).toContain("line-through");
  });

  it("لا يخلط قائمة المهام بقائمة النقاط", () => {
    const html = renderMarkdown("- [ ] مهمة\n- نقطة عادية");
    expect(html).toContain("list-disc");
    expect(html).toContain("list-none");
    expect((html.match(/<ul/g) || []).length).toBe(2);
    expect((html.match(/<\/ul>/g) || []).length).toBe(2);
  });

  it("يحوّل --- إلى فاصلٍ أفقيّ لا نصّاً", () => {
    const html = renderMarkdown("سطر\n\n---\n\nسطر آخر");
    expect(html).toContain("<hr");
    expect(html).not.toContain("---");
  });

  it("يدعم العناوين حتى ###### ويعرض السؤال اليوميّ كشارة", () => {
    const html = renderMarkdown("###### ممتن اليوم لـ");
    expect(html).not.toContain("#");
    expect(html).toContain("ممتن اليوم لـ");
    expect(html).toContain("rounded-xl");
  });

  it("لا يولّد وسماً غير صالح للعناوين العميقة", () => {
    const html = renderMarkdown("#### عنوان رابع\n##### عنوان خامس");
    expect(html).toMatch(/<h6 [^>]*>عنوان رابع<\/h6>/);
    expect(html).toMatch(/<h6 [^>]*>عنوان خامس<\/h6>/);
    expect(html).not.toMatch(/<h[78]/);
  });

  it("يفكّ الهروب \\. فلا تظهر الشرطات المائلة", () => {
    const html = renderMarkdown("ممتن اليوم لـ\\.\\.\\.");
    expect(html).not.toContain("\\");
    expect(html).toContain("ممتن اليوم لـ...");
  });

  it("الهروب يمنع تفسير الرمز تنسيقاً", () => {
    const html = renderMarkdown("\\*\\*ليس عريضاً\\*\\*");
    expect(html).not.toContain("<strong>");
    expect(html).toContain("**ليس عريضاً**");
  });

  it("يبقى التنسيق العاديّ يعمل", () => {
    const html = renderMarkdown("**عريض** *مائل* ~~مشطوب~~");
    expect(html).toContain("<strong>عريض</strong>");
    expect(html).toContain("<em>مائل</em>");
    expect(html).toContain("line-through");
  });

  it("يهرب HTML فلا يُحقن وسمٌ من النصّ", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("مذكرة Day One كاملة: لا رموز خام باقية", () => {
    const html = renderMarkdown(DAY_ONE);
    expect(html).not.toContain("[ ]");
    expect(html).not.toContain("[x]");
    expect(html).not.toContain("######");
    expect(html).not.toContain("\\.");
    expect(html).toContain("<hr");
  });

  it("يتجاهل رمز الحارس لو ورد في النصّ", () => {
    const html = renderMarkdown("نصّ" + "\u0000" + " عاديّ");
    expect(html).not.toContain("\u0000");
    expect(html).toContain("نصّ عاديّ");
  });
});

describe("stripMarkdown", () => {
  it("يعطي معاينةً نظيفة لنصّ Day One", () => {
    const plain = stripMarkdown(DAY_ONE);
    expect(plain).not.toContain("[ ]");
    expect(plain).not.toContain("###");
    expect(plain).not.toContain("---");
    expect(plain).not.toContain("\\.");
    expect(plain).toContain("☐ صليت العشاء؟");
    expect(plain).toContain("☑ هل تركت امس؟");
    expect(plain).toContain("ممتن اليوم لـ....");
  });

  it("يبقي النصّ العاديّ كما هو", () => {
    expect(stripMarkdown("يومٌ هادئ")).toBe("يومٌ هادئ");
  });
});

describe("plainTitle", () => {
  it("ينظّف عنوان Day One المهروب", () => {
    expect(plainTitle("اليوم بسوي \\.\\.\\.\\.")).toBe("اليوم بسوي ....");
  });

  it("يزيل علامات العنوان والتنسيق", () => {
    expect(plainTitle("### **رحلة** الطائف")).toBe("رحلة الطائف");
  });

  it("بلا عنوان ⇒ نصٌّ فارغ", () => {
    expect(plainTitle(undefined)).toBe("");
    expect(plainTitle("   ")).toBe("");
  });
});

describe("wordCount", () => {
  it("يعدّ الكلمات", () => {
    expect(wordCount("كلمة واحدة فقط")).toBe(3);
    expect(wordCount("   ")).toBe(0);
  });
});
