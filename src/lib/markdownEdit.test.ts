import { describe, expect, it } from "vitest";
import { clearFormatting, toggleBlockPrefix, toggleEmphasis } from "./markdownEdit";
import { renderMarkdown } from "./markdown";

// موضعُ الحرف في نصّ الاختبار — أوضحُ من عدّ الأحرف باليد.
const at = (text: string, needle: string) => text.indexOf(needle);

describe("toggleEmphasis", () => {
  it("يلفّ التحديد بالعلامة ويُبقيه محدَّداً", () => {
    const text = "صباحٌ هادئ اليوم";
    const out = toggleEmphasis(text, at(text, "هادئ"), at(text, "هادئ") + 4, "**");
    expect(out.text).toBe("صباحٌ **هادئ** اليوم");
    expect(out.text.slice(out.start, out.end)).toBe("**هادئ**");
  });

  it("الضغطةُ الثانية تُطفئ ولا تكوّم النجوم", () => {
    const text = "صباحٌ هادئ اليوم";
    const on = toggleEmphasis(text, at(text, "هادئ"), at(text, "هادئ") + 4, "**");
    const off = toggleEmphasis(on.text, on.start, on.end, "**");
    expect(off.text).toBe(text);
    expect(off.text).not.toContain("*");
  });

  it("يُطفئ ولو كان التحديدُ داخلَ العلامتين لا شاملاً لهما", () => {
    const text = "صباحٌ **هادئ** اليوم";
    const inner = at(text, "هادئ");
    const off = toggleEmphasis(text, inner, inner + 4, "**");
    expect(off.text).toBe("صباحٌ هادئ اليوم");
  });

  it("لا يكوّم علامةً على نصٍّ فيه علامةٌ سابقة", () => {
    const text = "**نصف** الجملة عريض";
    const out = toggleEmphasis(text, 0, text.length, "**");
    expect(out.text).toBe("**نصف الجملة عريض**");
    expect(renderMarkdown(out.text)).toContain("<strong>نصف الجملة عريض</strong>");
  });

  it("يلفّ كلّ سطرٍ على حدة فيصل التنسيقُ إلى الفقرات كلّها", () => {
    const text = "سطرٌ أوّل\nسطرٌ ثانٍ";
    const out = toggleEmphasis(text, 0, text.length, "**");
    expect(out.text).toBe("**سطرٌ أوّل**\n**سطرٌ ثانٍ**");
    const html = renderMarkdown(out.text);
    expect(html).toContain("<strong>سطرٌ أوّل</strong>");
    expect(html).toContain("<strong>سطرٌ ثانٍ</strong>");
    // والضغطةُ الثانية تُرجع النصَّ كما كان.
    expect(toggleEmphasis(out.text, out.start, out.end, "**").text).toBe(text);
  });

  it("يترك السطرَ الفارغ بلا علامتين معلّقتين", () => {
    const text = "فقرةٌ أولى\n\nفقرةٌ ثانية";
    const out = toggleEmphasis(text, 0, text.length, "**");
    expect(out.text).toBe("**فقرةٌ أولى**\n\n**فقرةٌ ثانية**");
  });

  it("يُخرج الفراغَ الملتقَط في السحب من داخل العلامتين", () => {
    const text = "كلمة أخرى";
    const out = toggleEmphasis(text, 0, text.length, "**");
    expect(out.text).toBe("**كلمة أخرى**");
    const trailing = toggleEmphasis("كلمة ", 0, 5, "**");
    expect(trailing.text).toBe("**كلمة** ");
  });

  it("يُبقي علامةَ القائمة خارج التنسيق", () => {
    const text = "- بندٌ في قائمة";
    const out = toggleEmphasis(text, 0, text.length, "**");
    expect(out.text).toBe("- **بندٌ في قائمة**");
    expect(renderMarkdown(out.text)).toContain("<li><strong>بندٌ في قائمة</strong></li>");
  });

  it("بلا تحديد: يُدرج نصّاً نائباً محدَّداً بين العلامتين", () => {
    const out = toggleEmphasis("اكتب ", 5, 5, "**");
    expect(out.text).toBe("اكتب **نص**");
    expect(out.text.slice(out.start, out.end)).toBe("نص");
    // وضغطةٌ ثانيةٌ على النائب المحدَّد تُطفئ بدل أن تُضاعف.
    expect(toggleEmphasis(out.text, out.start, out.end, "**").text).toBe("اكتب نص");
  });

  it("بلا تحديد داخل نصٍّ عريض: يُطفئ العلامتين المحيطتين", () => {
    const text = "صباحٌ **هادئ** اليوم";
    const caret = at(text, "هادئ") + 2;
    expect(toggleEmphasis(text, caret, caret, "**").text).toBe("صباحٌ هادئ اليوم");
  });

  it("المائل يعمل بالمنطق نفسه", () => {
    const text = "همسة";
    const on = toggleEmphasis(text, 0, text.length, "_");
    expect(on.text).toBe("_همسة_");
    expect(renderMarkdown(on.text)).toContain("<em>همسة</em>");
    expect(toggleEmphasis(on.text, on.start, on.end, "_").text).toBe(text);
  });
});

describe("toggleBlockPrefix", () => {
  it("يضيف العلامة ثمّ يرفعها بضغطةٍ ثانية", () => {
    const text = "عنوانُ المقطع";
    const on = toggleBlockPrefix(text, 3, 3, "## ");
    expect(on.text).toBe("## عنوانُ المقطع");
    expect(toggleBlockPrefix(on.text, on.start, on.start, "## ").text).toBe(text);
  });

  it("يستبدل علامةً بأخرى ولا يكوّمها", () => {
    const text = "## عنوان";
    const out = toggleBlockPrefix(text, 5, 5, "- ");
    expect(out.text).toBe("- عنوان");
  });

  it("يشمل كلّ أسطر التحديد ويترك الفارغ منها", () => {
    const text = "أوّل\n\nثانٍ";
    const out = toggleBlockPrefix(text, 0, text.length, "- ");
    expect(out.text).toBe("- أوّل\n\n- ثانٍ");
    expect(toggleBlockPrefix(out.text, 0, out.text.length, "- ").text).toBe(text);
  });

  it("يُبقي المؤشّر على موضعه من الكلمة", () => {
    const text = "كلمة";
    const out = toggleBlockPrefix(text, 2, 2, "> ");
    expect(out.text).toBe("> كلمة");
    expect(out.start).toBe(4);
  });
});

describe("clearFormatting", () => {
  it("يجرّد السطرَ الذي عليه المؤشّر وحده", () => {
    const text = "## عنوان\n**عريض** هنا";
    const out = clearFormatting(text, text.length - 2, text.length - 2);
    expect(out.text).toBe("## عنوان\nعريض هنا");
  });

  it("يجرّد المدى المحدَّد كلَّه: علاماتِ السطر وما في داخله", () => {
    const text = "## عنوان\n- **بند** _مائل_\n> اقتباس `شفرة`";
    const out = clearFormatting(text, 0, text.length);
    expect(out.text).toBe("عنوان\nبند مائل\nاقتباس شفرة");
  });
});
