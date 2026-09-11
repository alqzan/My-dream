import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  hasPin, setPin, clearPin, verifyPin, isUnlocked, markUnlocked,
  lockedForMs, LockThrottledError, PIN_LENGTH,
} from "./lock";

// ===================== محاكاةُ تخزين المتصفّح =====================
// `lock.ts` واجهةُ منصّةٍ قابلةٌ للاستبدال (راجع APP-STORE-PLAN)، فتُختبر على
// تخزينٍ صناعيّ بسيط بدل بيئةِ متصفّحٍ كاملة.
function memStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

const PIN_KEY = "madar-lock-pin";
const SLOW = 30_000; // ٢٠٠ ألف دورةٍ لكلّ اشتقاق

beforeEach(() => {
  vi.stubGlobal("localStorage", memStorage());
  vi.stubGlobal("sessionStorage", memStorage());
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("قفلُ الخصوصية — الأساس", () => {
  it("بلا رمزٍ مضبوط لا قفل، وأيُّ إدخالٍ يمرّ", async () => {
    expect(hasPin()).toBe(false);
    expect(await verifyPin("0000")).toBe(true);
  });

  it("يضبط ويتحقّق ويمحو", async () => {
    await setPin("1234");
    expect(hasPin()).toBe(true);
    expect(await verifyPin("1234")).toBe(true);
    expect(await verifyPin("4321")).toBe(false);
    clearPin();
    expect(hasPin()).toBe(false);
  }, SLOW);

  it("الرمزُ لا يُخزَّن صريحاً ولا مجزّأً بلا ملح", async () => {
    await setPin("1234");
    const raw = localStorage.getItem(PIN_KEY) ?? "";
    expect(raw).not.toContain("1234");
    // الصيغةُ القديمة كانت SHA-256 مجرّدة (٦٤ خانةً سُداسية) — تُعكَس بجدول.
    expect(/^[a-f0-9]{64}$/.test(raw)).toBe(false);
    const stored = JSON.parse(raw) as { v: number; salt: string };
    expect(stored.v).toBe(2);
    expect(stored.salt).toMatch(/^[a-f0-9]{32}$/);
  }, SLOW);

  it("ملحٌ مختلفٌ لكلّ جهاز: الرمزُ نفسُه يُنتج تجزئتين", async () => {
    await setPin("1234");
    const a = localStorage.getItem(PIN_KEY);
    vi.stubGlobal("localStorage", memStorage());
    await setPin("1234");
    expect(localStorage.getItem(PIN_KEY)).not.toBe(a);
  }, SLOW);

  it("الفتحُ يُتذكَّر للجلسة", () => {
    expect(isUnlocked()).toBe(false);
    markUnlocked();
    expect(isUnlocked()).toBe(true);
  });

  it("طولُ الرمز أربع خانات", () => {
    expect(PIN_LENGTH).toBe(4);
  });
});

describe("الترقيةُ من الصيغة القديمة (v1)", () => {
  // مالكٌ ضبط رمزَه قبل التقوية: رمزُه محفوظٌ SHA-256 مجرّدة. يجب أن يفتح كما
  // هو، وأن تُرقّى صيغتُه صامتةً عند أوّل نجاح — بلا أن يُطلب منه شيء.
  it("رمزٌ قديمٌ يفتح ثمّ يُرقّى إلى v2", async () => {
    const legacy = [...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode("1234"))
    )].map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(PIN_KEY, legacy);

    expect(hasPin()).toBe(true);
    expect(await verifyPin("9999")).toBe(false);
    expect(localStorage.getItem(PIN_KEY)).toBe(legacy); // خطأٌ لا يُرقّي

    expect(await verifyPin("1234")).toBe(true);
    const after = localStorage.getItem(PIN_KEY) ?? "";
    expect(after).not.toBe(legacy);
    expect(JSON.parse(after).v).toBe(2);
    // وبعد الترقية يفتح بالصيغة الجديدة.
    expect(await verifyPin("1234")).toBe(true);
  }, SLOW);
});

describe("التأخيرُ المتصاعد", () => {
  it("خمسُ محاولاتٍ بلا عقوبة، ثمّ يبدأ الانتظار ويتضاعف", async () => {
    await setPin("1234");
    for (let i = 0; i < 5; i++) {
      expect(await verifyPin("0000")).toBe(false);
      expect(lockedForMs()).toBe(0);
    }
    expect(await verifyPin("0000")).toBe(false);
    const first = lockedForMs();
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(1000);
  }, SLOW);

  it("محاولةٌ أثناء الانتظار تُرفض بـLockThrottledError لا بـ«رمزٌ خاطئ»", async () => {
    await setPin("1234");
    for (let i = 0; i < 6; i++) await verifyPin("0000");
    // حتى الرمزُ الصحيح ينتظر — وإلّا لكان التأخيرُ بلا معنى.
    await expect(verifyPin("1234")).rejects.toBeInstanceOf(LockThrottledError);
  }, SLOW);

  it("والانتظارُ يعيش في التخزين فلا تُسقِطه إعادةُ تحميلٍ", async () => {
    await setPin("1234");
    for (let i = 0; i < 7; i++) { try { await verifyPin("0000"); } catch { /* throttled */ } }
    expect(lockedForMs()).toBeGreaterThan(0);
    // «إعادةُ تحميل»: الوحدةُ نفسُها بلا حالةٍ في الذاكرة — القراءةُ من التخزين.
    expect(JSON.parse(localStorage.getItem("madar-lock-attempts") ?? "null").fails).toBeGreaterThan(5);
  }, SLOW);

  it("نجاحٌ واحدٌ يمحو العدّاد كلَّه", async () => {
    await setPin("1234");
    for (let i = 0; i < 4; i++) await verifyPin("0000");
    expect(await verifyPin("1234")).toBe(true);
    expect(lockedForMs()).toBe(0);
    expect(localStorage.getItem("madar-lock-attempts")).toBeNull();
  }, SLOW);
});
