// Device-local privacy lock. A 4-digit PIN gates opening the app. The PIN is
// never stored in the clear — only its SHA-256 hash lives in localStorage — and
// it never syncs anywhere (purely on-device). An unlock is remembered for the
// browsing session (sessionStorage) so it isn't re-asked on every navigation.
//
// There is deliberately no recovery path: the app holds no server account, so a
// forgotten PIN can only be cleared by clearing the site's data. This is the
// price of a lock that answers to no one but the device owner.

const PIN_KEY = "madar-lock-pin";
const UNLOCK_KEY = "madar-unlocked";

export const PIN_LENGTH = 4;

export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getPinHash(): string | null {
  try {
    return localStorage.getItem(PIN_KEY);
  } catch {
    return null;
  }
}

export function hasPin(): boolean {
  return !!getPinHash();
}

export async function setPin(pin: string): Promise<void> {
  try {
    localStorage.setItem(PIN_KEY, await hashPin(pin));
    markUnlocked();
  } catch {
    /* storage unavailable — ignore */
  }
}

export function clearPin(): void {
  try {
    localStorage.removeItem(PIN_KEY);
  } catch {
    /* ignore */
  }
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = getPinHash();
  if (!stored) return true;
  return (await hashPin(pin)) === stored;
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
