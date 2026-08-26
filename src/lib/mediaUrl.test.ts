import { describe, expect, it } from "vitest";
import { isSafeMediaUrl } from "./mediaUrl";

describe("isSafeMediaUrl — بوابة روابط المرفقات", () => {
  it("يقبل الوسائط الثنائية التي ينشئها مدار", () => {
    expect(isSafeMediaUrl("data:application/pdf;base64,JVBERi0x")).toBe(true);
    expect(isSafeMediaUrl("data:image/png;base64,AAAA")).toBe(true);
    expect(isSafeMediaUrl("data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,AAAA")).toBe(true);
    expect(isSafeMediaUrl("https://media.example/file.pdf")).toBe(true);
    expect(isSafeMediaUrl("blob:https://example.test/id")).toBe(true);
  });

  it("يرفض النصوص والأنظمة التي قد تحوّل الاستعادة إلى تنقّلٍ خطِر", () => {
    expect(isSafeMediaUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeMediaUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafeMediaUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isSafeMediaUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeMediaUrl("/relative/file.pdf")).toBe(false);
  });
});
