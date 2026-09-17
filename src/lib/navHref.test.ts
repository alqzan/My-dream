import { describe, expect, it } from "vitest";
import {
  IMPATIENT_RETAP_MS,
  SOFT_NAV_DEADLINE_MS,
  isImpatientRetap,
  isPlainClick,
  nativeNavHref,
  normNavPath,
  remainingSoftNavMs,
  shouldHardNavigate,
} from "./navHref";

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

describe("shouldHardNavigate", () => {
  const base = { pending: "/journal/", target: "/journal/", currentPath: "/", visible: true };

  it("يسقط على الانتقال الأصلي إن بقيت النقرة معلّقة ولم نصل", () => {
    expect(shouldHardNavigate(base)).toBe(true);
  });

  it("لا يقطع تنقّلاً وصل ولو تأخّر", () => {
    expect(shouldHardNavigate({ ...base, currentPath: "/journal" })).toBe(false);
    expect(shouldHardNavigate({ ...base, currentPath: "/journal/" })).toBe(false);
  });

  it("لا يعمل بعد نقرةٍ أحدث أو حين تغيب الصفحة", () => {
    expect(shouldHardNavigate({ ...base, pending: "/prayers/" })).toBe(false);
    expect(shouldHardNavigate({ ...base, pending: null })).toBe(false);
    expect(shouldHardNavigate({ ...base, visible: false })).toBe(false);
  });
});

// العطلُ الذي وُلدت منه هذه الثلاثة (٠٫١٫٤٣١): حمولةُ المسار لا تصل،
// و`router.push` بلا مهلة — فالشاشةُ لا تتحرّك. والشبكةُ كانت تُستأنف مع كلّ
// نقرة، فمن يضغط كلَّ ثانيتين لا تنقضي عنده المهلةُ أبداً.
describe("سقفُ التنقّل الداخليّ", () => {
  it("أوّلُ نقرةٍ تأخذ السقف كاملاً", () => {
    expect(remainingSoftNavMs(null, 10_000)).toBe(SOFT_NAV_DEADLINE_MS);
  });

  it("النقرةُ التالية تُكمل ما بقي ولا تبدأ سقفاً جديداً", () => {
    // نقرةٌ أولى عند 0، وثانيةٌ عند 1000 ⇒ يبقى 5000 لا 6000.
    expect(remainingSoftNavMs(0, 1_000)).toBe(SOFT_NAV_DEADLINE_MS - 1_000);
  });

  it("سقفٌ انقضى لا يعود سالباً", () => {
    expect(remainingSoftNavMs(0, 99_000)).toBe(0);
  });
});

describe("النقرةُ الثانية على شاشةٍ لم تتحرّك", () => {
  it("لا شيءَ معلّقٌ ⇒ ليست ضغطةً ثانية", () => {
    expect(isImpatientRetap(null, 10_000)).toBe(false);
  });

  it("ضغطتان متلاحقتان ⇒ نقرٌ مزدوج لا نفادُ صبر، فلا نُعيد التحميل", () => {
    expect(isImpatientRetap(0, IMPATIENT_RETAP_MS - 1)).toBe(false);
  });

  it("ضغطةٌ بعد صمتٍ كافٍ ⇒ خبرٌ بأنّ الداخليّ لم يقع", () => {
    expect(isImpatientRetap(0, IMPATIENT_RETAP_MS)).toBe(true);
    expect(isImpatientRetap(0, 5_000)).toBe(true);
  });
});

describe("normNavPath", () => {
  it("يُسقط الشرطةَ الأخيرة إلا على الجذر", () => {
    expect(normNavPath("/journal/")).toBe("/journal");
    expect(normNavPath("/journal")).toBe("/journal");
    expect(normNavPath("/")).toBe("/");
  });
});
