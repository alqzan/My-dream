import { describe, it, expect, beforeEach } from "vitest";
import {
  CRASH_THRESHOLD,
  __resetBootGuardForTests,
  beginBoot,
  bootReport,
  exitRescueMode,
  exitSafeMode,
  isSafeMode,
  isStoreRescue,
  storeKeyFor,
  markBootPhase,
  markBootStable,
  recordStoreBytes,
} from "./bootGuard";

// إقلاعٌ = وحدةٌ تُحمَّل من جديد، فنصفّر حالة الوحدة ونُبقي `localStorage`
// (ما ينجو من قتل العمليّة فعلاً).
function relaunch(): boolean {
  __resetBootGuardForTests();
  return beginBoot();
}

// بيئةُ الاختبار بلا DOM: مخزنٌ في الذاكرة يقوم مقام `localStorage`.
const memory = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, String(v)),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
};

describe("حارسُ حلقة الانهيار", () => {
  beforeEach(() => {
    memory.clear();
    __resetBootGuardForTests();
  });

  it("إقلاعاتٌ مستقرّة لا تدخل الوضع الآمن أبداً", () => {
    for (let i = 0; i < 5; i++) {
      expect(relaunch()).toBe(false);
      markBootStable();
    }
  });

  it("انهياران متتاليان ⇒ الإقلاعُ الثالث آمن، ويحمل طورَ الانهيار", () => {
    relaunch();
    markBootPhase("sync:merge");
    for (let i = 1; i < CRASH_THRESHOLD; i++) {
      expect(relaunch()).toBe(false);
      markBootPhase("sync:merge");
    }
    expect(relaunch()).toBe(true);
    expect(isSafeMode()).toBe(true);
    expect(bootReport().crashPhase).toBe("sync:merge");
  });

  it("انهيارٌ واحد ثمّ استقرار لا يتراكم", () => {
    relaunch(); // انهار
    relaunch();
    markBootStable();
    expect(relaunch()).toBe(false);
  });

  it("الوضع الآمن لازمٌ رغم الاستقرار حتى يُخرَج منه صراحةً", () => {
    for (let i = 0; i <= CRASH_THRESHOLD; i++) relaunch();
    markBootStable();
    expect(relaunch()).toBe(true);
    exitSafeMode();
    expect(relaunch()).toBe(false);
  });

  it("يسجّل حجم كتلة المتجر", () => {
    recordStoreBytes(123_456);
    expect(bootReport().storeBytes).toBe(123_456);
  });

  it("النداءُ المتكرّر في إقلاعٍ واحد لا يعدّ انهياراً", () => {
    beginBoot();
    beginBoot();
    beginBoot();
    expect(relaunch()).toBe(false);
  });
});

describe("الإنقاذ: الانهيارُ داخل قراءة المتجر", () => {
  beforeEach(() => {
    memory.clear();
    __resetBootGuardForTests();
  });

  it("انهياران في `store:*` ⇒ مفتاحٌ مجاور، والمزامنة لا تُوقف", () => {
    relaunch();
    markBootPhase("store:parse");
    relaunch();
    markBootPhase("store:parse");
    relaunch();
    expect(isStoreRescue()).toBe(true);
    expect(isSafeMode()).toBe(false);
    expect(storeKeyFor("my-dream-store")).toBe("my-dream-store:rescue");
  });

  it("الإنقاذ لازم: الإقلاعُ المستقرّ بعده لا يعود إلى الكتلة القديمة", () => {
    relaunch(); markBootPhase("store:read");
    relaunch(); markBootPhase("store:read");
    relaunch(); markBootStable();
    relaunch();
    expect(storeKeyFor("my-dream-store")).toBe("my-dream-store:rescue");
  });

  it("انهيارٌ بعد القراءة لا يعزل المتجر", () => {
    relaunch(); markBootPhase("sync:merge");
    relaunch(); markBootPhase("sync:merge");
    relaunch();
    expect(isStoreRescue()).toBe(false);
    expect(storeKeyFor("my-dream-store")).toBe("my-dream-store");
  });

  it("انهيارٌ في الرسم بعد `store-ready` لا يُصنَّف `store:*` ولا يعزل المتجر", () => {
    // طورُ نجاح القراءة عمداً بلا بادئة `store:` — انهيارٌ بعده وقع في الرسم
    // (`idbStorage.ts`)، فلا يُحال إلى الإنقاذ.
    relaunch(); markBootPhase("store-ready");
    relaunch(); markBootPhase("store-ready");
    relaunch();
    expect(isStoreRescue()).toBe(false);
    expect(isSafeMode()).toBe(true);
    expect(bootReport().crashPhase).toBe("store-ready");
  });

  it("exitRescueMode يخرج من الإنقاذ ويبدأ العدّ من صفر بلا مسّ بياناتٍ", () => {
    relaunch(); markBootPhase("store:parse");
    relaunch(); markBootPhase("store:parse");
    relaunch();
    expect(isStoreRescue()).toBe(true);
    exitRescueMode();
    expect(relaunch()).toBe(false);
    expect(isStoreRescue()).toBe(false);
    expect(storeKeyFor("my-dream-store")).toBe("my-dream-store");
  });
});
