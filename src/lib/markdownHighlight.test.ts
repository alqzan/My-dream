import { describe, it, expect } from "vitest";
import { markdownPieces, type MarkKind } from "./markdownHighlight";

const join = (text: string) => markdownPieces(text).map((p) => p.text).join("");
const kindsOf = (text: string, piece: string): MarkKind[] | undefined =>
  markdownPieces(text).find((p) => p.text === piece)?.kinds;

describe("مرآةُ الماركداون — حرفاً بحرف", () => {
  // المرآةُ فوق الحقل: أيُّ فرقٍ في الأحرف يُزيح النصَّ عن مؤشّر الكتابة.
  it.each([
    "",
    "نصٌّ عاديّ بلا تنسيق",
    "**عريض** ثمّ _مائل_ ثمّ ~~مشطوب~~",
    "## عنوان فيه **عريض**\n- بند\n> اقتباس\n1. مرقّم",
    "**نجمتان بلا إغلاق\n\n\n  - بند مُزاح",
    "- [x] مهمة منجزة\n* بند بنجمة",
    "a*b*c و snake_case_name",
  ])("يعيد النصَّ كما هو: %j", (text) => {
    expect(join(text)).toBe(text);
  });

  it("العريضُ عريضٌ وعلامتاه باهتتان", () => {
    const pieces = markdownPieces("قال **مهمّ** جداً");
    expect(pieces.map((p) => [p.text, p.kinds.join("+")])).toEqual([
      ["قال ", ""],
      ["**", "mark"],
      ["مهمّ", "bold"],
      ["**", "mark"],
      [" جداً", ""],
    ]);
  });

  it("العنوانُ: العلامةُ باهتة والسطرُ عنوان، وما فيه من عريضٍ يبقى عريضاً", () => {
    expect(kindsOf("## يومٌ طويل", "## ")).toEqual(["mark"]);
    expect(kindsOf("## يومٌ طويل", "يومٌ طويل")).toEqual(["head"]);
    expect(kindsOf("## يوم **طويل**", "طويل")).toEqual(["head", "bold"]);
  });

  it("القائمةُ والاقتباس", () => {
    expect(kindsOf("- بند", "- ")).toEqual(["bullet"]);
    expect(kindsOf("1. أوّل", "1. ")).toEqual(["bullet"]);
    expect(kindsOf("> قالها", "> ")).toEqual(["mark"]);
    expect(kindsOf("> قالها", "قالها")).toEqual(["quote"]);
  });

  it("نجمتان بلا إغلاق ونجمةٌ وسطَ كلمة تبقيان نصّاً عاديّاً — كما يعرضهما العارض", () => {
    expect(markdownPieces("**بلا إغلاق").every((p) => p.kinds.length === 0)).toBe(true);
    expect(markdownPieces("snake_case_name").every((p) => p.kinds.length === 0)).toBe(true);
  });

  it("التنسيقُ لا يعبر سطراً", () => {
    expect(markdownPieces("**أوّل\nثانٍ**").every((p) => p.kinds.length === 0)).toBe(true);
  });
});
