// Device-local privacy lock. A 4-digit PIN gates opening the app. The PIN is
// never stored in the clear, it never syncs anywhere, and an unlock is
// remembered for the browsing session (sessionStorage) so it isn't re-asked on
// every navigation.
//
// ===================== ما يحميه هذا القفل وما لا يحميه =====================
// أربعُ خاناتٍ = عشرةُ آلاف احتمال. لا شيء يجعل ذلك سرّاً أمام من يملك الجهاز
// **ويفتح أدوات المطوّر**: البياناتُ نفسها في IndexedDB بلا تشفير، فمن يقدر
// على الأدوات يقرؤها بلا حاجةٍ إلى الرمز أصلاً. القفلُ إذن سترٌ في وجه من
// يمسك جوّالك لحظةً — لا خزنةٌ في وجه خصمٍ يعرف ما يفعل، ولا يُدّعى غيرُ ذلك.
//
// وفي هذا الحدّ نفسِه تُرفع الكلفةُ حيث تُجدي:
//  • **`PBKDF2` لا `SHA-256` مجرّدة**: التجزئةُ المجرّدة تُعكَس بجدولٍ لعشرة
//    آلاف قيمة في لحظة. ٢٠٠ ألف دورةٍ تجعل مسحَ المجال الكامل عملاً محسوساً.
//  • **ملحٌ لكلّ جهاز**: فجدولٌ محسوبٌ مسبقاً لا يصلح لجهازين.
//  • **تأخيرٌ متصاعد بعد المحاولات الخاطئة**: يُخزَّن مع الرمز فلا يُتجاوَز
//    بإعادة تحميل الصفحة. خمسُ محاولاتٍ ثمّ الانتظار يتضاعف حتى دقيقة.
// وكلُّ ذلك **على الجهاز** ولا يُزامَن، فبقاؤه محلّياً جزءٌ من تعريفه.
//
// لا مسارَ استرجاع: التطبيق بلا حسابٍ ولا خادم، فرمزٌ منسيٌّ لا يُمحى إلّا
// بمسح بيانات الموقع. وهذا ثمنُ قفلٍ لا يجيب أحداً غير صاحب الجهاز.

const PIN_KEY = "madar-lock-pin";
const UNLOCK_KEY = "madar-unlocked";
const THROTTLE_KEY = "madar-lock-attempts";

export const PIN_LENGTH = 4;
const ITERATIONS = 200_000;
const FREE_ATTEMPTS = 5; // قبلها لا تأخير — الخطأُ العابر لا يُعاقَب
const MAX_DELAY_MS = 60_000;

interface StoredPin {
  v: 2;
  salt: string; // hex
  hash: string; // hex
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** التجزئةُ القديمة (v1): SHA-256 مجرّدة بلا ملح. تبقى للقراءة وحدها حتى
 *  يُدخِل المالكُ رمزَه مرّةً فيُرقّى تلقائياً إلى v2 — لا يُطلب منه شيء. */
async function legacyHash(pin: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin)));
}

async function derive(pin: string, salt: Uint8Array): Promise<string> {
  const baseKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    256
  );
  return toHex(bits);
}

/** مقارنةٌ بزمنٍ ثابت — لا تكشف كم خانةً طابقت. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(PIN_KEY);
  } catch {
    return null;
  }
}

function parseStored(raw: string | null): StoredPin | { v: 1; hash: string } | null {
  if (!raw) return null;
  if (/^[a-f0-9]{64}$/.test(raw)) return { v: 1, hash: raw }; // الصيغة القديمة
  try {
    const p = JSON.parse(raw) as StoredPin;
    return p && p.v === 2 && typeof p.salt === "string" && typeof p.hash === "string" ? p : null;
  } catch {
    return null;
  }
}

export function hasPin(): boolean {
  return !!parseStored(readRaw());
}

async function writePin(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const stored: StoredPin = { v: 2, salt: toHex(salt.buffer as ArrayBuffer), hash: await derive(pin, salt) };
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(stored));
  } catch {
    /* storage unavailable — ignore */
  }
}

export async function setPin(pin: string): Promise<void> {
  await writePin(pin);
  clearThrottle();
  markUnlocked();
}

export function clearPin(): void {
  try {
    localStorage.removeItem(PIN_KEY);
  } catch {
    /* ignore */
  }
  clearThrottle();
}

// ===================== التأخير المتصاعد =====================
// يعيش في `localStorage` لا في الذاكرة: تأخيرٌ يُمحى بإعادة تحميل الصفحة ليس
// تأخيراً. ويُمحى عند أوّل نجاح، فالمالكُ لا يدفع ثمنَ خطئه أكثر من مرّة.

interface Throttle { fails: number; until: number }

function readThrottle(): Throttle {
  try {
    const t = JSON.parse(localStorage.getItem(THROTTLE_KEY) || "null") as Throttle | null;
    if (t && Number.isFinite(t.fails) && Number.isFinite(t.until)) return t;
  } catch {
    /* ignore */
  }
  return { fails: 0, until: 0 };
}

function writeThrottle(t: Throttle): void {
  try {
    localStorage.setItem(THROTTLE_KEY, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

function clearThrottle(): void {
  try {
    localStorage.removeItem(THROTTLE_KEY);
  } catch {
    /* ignore */
  }
}

/** مِلّي ثانيةً باقيةً قبل السماح بمحاولةٍ أخرى (صفرٌ = جرّب الآن). */
export function lockedForMs(now = Date.now()): number {
  return Math.max(0, readThrottle().until - now);
}

function penalize(now: number): void {
  const t = readThrottle();
  const fails = t.fails + 1;
  const over = fails - FREE_ATTEMPTS;
  // 1s ثمّ 2 ثمّ 4 … حتى دقيقة.
  const delay = over <= 0 ? 0 : Math.min(MAX_DELAY_MS, 1000 * 2 ** (over - 1));
  writeThrottle({ fails, until: now + delay });
}

/**
 * هل هذا هو الرمز؟ ترقّي الصيغةَ القديمة عند أوّل نجاح، وتُصعّد التأخير عند
 * الخطأ. ترمي `LockThrottledError` إن كان الانتظارُ لم ينتهِ بعد — فالمنادي
 * يعرض المدّة بدل أن يبتلع المحاولة صامتاً.
 */
export async function verifyPin(pin: string): Promise<boolean> {
  const stored = parseStored(readRaw());
  if (!stored) return true; // لا قفلَ مضبوط

  const now = Date.now();
  const waitMs = lockedForMs(now);
  if (waitMs > 0) throw new LockThrottledError(waitMs);

  let ok: boolean;
  if (stored.v === 1) {
    ok = constantTimeEqual(await legacyHash(pin), stored.hash);
    if (ok) await writePin(pin); // ترقيةٌ صامتة إلى v2
  } else {
    ok = constantTimeEqual(await derive(pin, fromHex(stored.salt)), stored.hash);
  }

  if (ok) clearThrottle();
  else penalize(now);
  return ok;
}

export class LockThrottledError extends Error {
  constructor(public waitMs: number) {
    super("too many attempts");
    this.name = "LockThrottledError";
  }
}

export function isUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function markUnlocked(): void {
  try {
    sessionStorage.setItem(UNLOCK_KEY, "1");
  } catch {
    /* ignore */
  }
}
