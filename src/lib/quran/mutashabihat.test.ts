import { describe, it, expect } from "vitest";
import { discriminationDecoy, type SimMap } from "./mutashabihat";

describe("discriminationDecoy — أيُّ النظائر يُسأل عنه", () => {
  const text: string[] = [];
  text[10] = "فبأي آلاء ربكما تكذبان";
  text[11] = "فبأي آلاء ربكما تكذبان"; // مطابقةٌ حرفاً
  text[20] = "وما الله بغافل عما تعملون";
  text[21] = "وما الله بغافل عما يعملون"; // تختلف في كلمة
  text[22] = "إن الله بما تعملون خبير وما الله بغافل عما تعملون أبدا"; // تشترك في عبارة

  it("المتطابقان نصّاً لا يُسأل عنهما", () => {
    expect(discriminationDecoy({ "10": [11] } as SimMap, text, 10)).toBeNull();
  });

  it("يختار الأقربَ نصّاً من النظائر المختلفة", () => {
    expect(discriminationDecoy({ "20": [22, 21] } as SimMap, text, 20)).toBe(21);
  });

  it("لا خريطة أو لا نظائر ⇒ لا سؤال", () => {
    expect(discriminationDecoy(null, text, 20)).toBeNull();
    expect(discriminationDecoy({}, text, 20)).toBeNull();
  });
});
