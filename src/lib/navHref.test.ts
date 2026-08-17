import { describe, expect, it } from "vitest";
import { isPlainClick, nativeNavHref } from "./navHref";

describe("nativeNavHref", () => {
  it("keeps root-hosted routes under the static export root", () => {
    expect(nativeNavHref("/journal")).toBe("/journal/");
    expect(nativeNavHref("/")).toBe("/");
  });

  it("adds the GitHub Pages project path", () => {
    expect(nativeNavHref("/journal", "/My-dream")).toBe("/My-dream/journal/");
    expect(nativeNavHref("/", "/My-dream/")).toBe("/My-dream/");
  });
});

// نقرةُ التبويب تُحوَّل إلى تنقّلٍ داخليّ حتى لا يُعاد إقلاع التطبيق (ترطيبُ
// IndexedDB + دورةُ مزامنةٍ كاملة) عند كلّ ضغطة. لكنّ الاعتراض لا يجوز أن يبتلع
// سلوكَ الرابط الذي يملكه المستخدم.
describe("isPlainClick", () => {
  const click = (over: Partial<Parameters<typeof isPlainClick>[0]> = {}) => ({
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...over,
  });

  it("الضغطةُ العاديّة على الزرّ الأيسر نتولّاها", () => {
    expect(isPlainClick(click())).toBe(true);
  });

  it("«فتحٌ في تبويب جديد» يبقى للمتصفّح", () => {
    expect(isPlainClick(click({ metaKey: true }))).toBe(false);
    expect(isPlainClick(click({ ctrlKey: true }))).toBe(false);
    expect(isPlainClick(click({ shiftKey: true }))).toBe(false);
    expect(isPlainClick(click({ altKey: true }))).toBe(false);
    expect(isPlainClick(click({ button: 1 }))).toBe(false);
  });

  it("نقرةٌ سبقنا إليها غيرُنا لا نبني عليها", () => {
    expect(isPlainClick(click({ defaultPrevented: true }))).toBe(false);
  });
});
