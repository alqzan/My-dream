// ===================== تفضيلاتُ الجهاز — واجهةُ منصّة =====================
// الواجهة متزامنة حتى تبقى قراءاتُ الثيم والقفل والمزامنة كما هي. في Capacitor
// تُحمّل Preferences إلى ذاكرة قبل إظهار التطبيق (`initializePrefs`) ثم تُكتب
// التغييرات إلى الذاكرة فوراً وتُرسل إلى التخزين الأصلي في الخلفية.

import { Capacitor } from "@capacitor/core";

type NativePreferences = typeof import("@capacitor/preferences").Preferences;

const BOOT_GUARD_KEYS = new Set([
  "madar-boot-attempts",
  "madar-boot-phase",
  "madar-boot-crash-phase",
  "madar-safe-mode",
  "madar-boot-store-bytes",
  "madar-store-rescue",
]);
const APP_KEY_PREFIX = "madar-";
const SHADOW_PREFIX = "madar-pref-shadow:";

let cache = new Map<string, string>();
let initialized = false;
let initPromise: Promise<void> | null = null;
let preferences: NativePreferences | null = null;
const pendingWrites = new Map<string, string | null>();
let writeQueue: Promise<void> = Promise.resolve();
const failedNativeWrites = new Set<string>();

function localStore(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

function sessionStore(): Storage | null {
  try {
    return (globalThis as { sessionStorage?: Storage }).sessionStorage ?? null;
  } catch {
    return null;
  }
}

type ShadowValue = { value: string } | { remove: true };

function shadowKey(key: string): string {
  return `${SHADOW_PREFIX}${encodeURIComponent(key)}`;
}

function writeShadow(key: string, value: ShadowValue): void {
  try { localStore()?.setItem(shadowKey(key), JSON.stringify(value)); } catch { /* quota may be full */ }
}

function clearShadowIfMatches(key: string, value: string | null): void {
  try {
    const local = localStore();
    if (!local) return;
    const stored = local.getItem(shadowKey(key));
    if (!stored) return;
    const shadow = JSON.parse(stored) as ShadowValue;
    const matches = value === null
      ? "remove" in shadow && shadow.remove
      : "value" in shadow && shadow.value === value;
    if (matches) local.removeItem(shadowKey(key));
  } catch { /* leave an unparseable shadow for inspection/recovery */ }
}

function native(): boolean {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

function enqueueNativeWrite(key: string, value: string | null): void {
  if (!preferences) {
    pendingWrites.set(key, value);
    return;
  }
  writeQueue = writeQueue.then(async () => {
    if (!preferences) return;
    if (value === null) await preferences.remove({ key });
    else await preferences.set({ key, value });
    clearShadowIfMatches(key, value);
    failedNativeWrites.delete(key);
  }).catch(() => {
    // التفضيلات ليست بيانات المتجر؛ فشل الكتابة لا يجب أن يسقط الشاشة.
    failedNativeWrites.add(key);
  });
}

/**
 * تُستدعى قبل ترطيب المتجر أو رسم أيّ قارئ للتفضيلات. تنقل القيم الموجودة في
 * localStorage على أصل WKWebView مرةً واحدة، مع إبقاء قيمة السلسلة الفارغة
 * مختلفةً عن المفتاح الغائب.
 */
export function initializePrefs(): Promise<void> {
  if (!native()) {
    initialized = true;
    return Promise.resolve();
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const plugin = await import("@capacitor/preferences");
      preferences = plugin.Preferences;
      const listed = await preferences.keys();
      const keys = listed.keys ?? [];
      const entries = await Promise.all(keys.map(async (key) => {
        const result = await preferences!.get({ key });
        return [key, result.value] as const;
      }));
      cache = new Map(entries.filter((entry): entry is readonly [string, string] => entry[1] !== null));

      const local = localStore();
      if (local) {
        const reconciledShadowKeys = new Set<string>();
        // Synchronous localStorage shadows recover the latest write if iOS
        // force-quits before its asynchronous Preferences operation completes.
        for (let i = 0; i < local.length; i++) {
          const storageKey = local.key(i);
          if (!storageKey?.startsWith(SHADOW_PREFIX)) continue;
          let key: string;
          try { key = decodeURIComponent(storageKey.slice(SHADOW_PREFIX.length)); } catch { continue; }
          if (!key.startsWith(APP_KEY_PREFIX) || BOOT_GUARD_KEYS.has(key)) continue;
          const raw = local.getItem(storageKey);
          if (raw === null) continue;
          let shadow: ShadowValue;
          try {
            shadow = JSON.parse(raw) as ShadowValue;
          } catch {
            // ظلٌّ تالف لا يحمل قيمةً تُستردّ؛ القيمةُ الأصلية تبقى هي المرجع.
            // رميُه هنا كان يُسقط الإقلاع كلَّه إلى «تعذّر فتح بيانات التطبيق».
            try { local.removeItem(storageKey); i--; } catch { /* retry next boot */ }
            continue;
          }
          if (!shadow || typeof shadow !== "object") continue;
          if ("remove" in shadow && shadow.remove) {
            await preferences.remove({ key });
            cache.delete(key);
          } else if ("value" in shadow && typeof shadow.value === "string") {
            await preferences.set({ key, value: shadow.value });
            cache.set(key, shadow.value);
          } else {
            continue;
          }
          reconciledShadowKeys.add(key);
          try {
            local.removeItem(storageKey);
            i--;
          } catch { /* native value is durable; a later boot can retry cleanup */ }
        }

        for (let i = 0; i < local.length; i++) {
          const key = local.key(i);
          if (!key || key.startsWith(SHADOW_PREFIX) || !key.startsWith(APP_KEY_PREFIX) || BOOT_GUARD_KEYS.has(key)) continue;
          const legacy = local.getItem(key);
          if (legacy === null) continue;
          if (reconciledShadowKeys.has(key)) {
            try {
              local.removeItem(key);
              i--;
            } catch { /* shadow already won; retry legacy cleanup next boot */ }
            continue;
          }
          if (pendingWrites.has(key)) {
            local.removeItem(key);
            i--;
            continue;
          }
          // Existing native value wins even when it is the empty string.
          if (!cache.has(key)) {
            await preferences.set({ key, value: legacy });
            cache.set(key, legacy);
          }
          // Keep the legacy copy unless native storage accepted the value.
          try {
            local.removeItem(key);
            i--;
          } catch { /* native value is durable; a later boot can retry cleanup */ }
        }
      }
    } catch (error) {
      // Do not hydrate using an incomplete snapshot. The app bootstrap catches
      // this rejection and displays its startup failure state.
      throw error;
    } finally {
      initialized = true;
      const queued = [...pendingWrites];
      pendingWrites.clear();
      for (const [key, value] of queued) {
        if (value === null) cache.delete(key);
        else cache.set(key, value);
        enqueueNativeWrite(key, value);
      }
    }
  })();
  return initPromise;
}

/** انتظر الكتابات الأصلية المعلّقة عند مسار سيغادر التطبيق (مثل إعادة التحميل). */
export async function flushPrefs(): Promise<boolean> {
  if (native()) await initializePrefs();
  await writeQueue;
  return failedNativeWrites.size === 0;
}

/** مفاتيح التفضيلات الموجودة؛ يستعملها تنظيف تفضيلات المجموعات القديمة. */
export function prefKeys(prefix = ""): string[] {
  const keys = new Set<string>();
  if (native()) {
    for (const key of cache.keys()) keys.add(key);
    const local = localStore();
    if (local) {
      for (let i = 0; i < local.length; i++) {
        const key = local.key(i);
        if (key) keys.add(key);
      }
    }
  } else {
    const local = localStore();
    if (local) {
      for (let i = 0; i < local.length; i++) {
        const key = local.key(i);
        if (key) keys.add(key);
      }
    }
  }
  return [...keys].filter((key) => key.startsWith(prefix));
}

export function prefGet(key: string): string | null {
  try {
    if (native() && BOOT_GUARD_KEYS.has(key)) return localStore()?.getItem(key) ?? null;
    if (native() && initialized) return cache.get(key) ?? null;
    return localStore()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function prefSet(key: string, value: string): void {
  try {
    if (native() && BOOT_GUARD_KEYS.has(key)) {
      localStore()?.setItem(key, value);
      return;
    }
    if (native()) {
      cache.set(key, value);
      writeShadow(key, { value });
      enqueueNativeWrite(key, value);
      return;
    }
    localStore()?.setItem(key, value);
  } catch {
    /* ممتلئٌ أو محظور — التفضيلُ ليس بياناتٍ تُسقط الشاشة */
  }
}

export function prefRemove(key: string): void {
  try {
    if (native() && BOOT_GUARD_KEYS.has(key)) {
      localStore()?.removeItem(key);
      return;
    }
    if (native()) {
      cache.delete(key);
      writeShadow(key, { remove: true });
      enqueueNativeWrite(key, null);
      return;
    }
    localStore()?.removeItem(key);
  } catch {
    /* المثل */
  }
}

/** قراءةٌ وكتابةٌ لقيمةٍ JSON. القيمةُ التالفة تُعامَل معاملةَ الغياب. */
export function prefGetJSON<T>(key: string): T | null {
  const raw = prefGet(key);
  if (raw == null) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function prefSetJSON(key: string, value: unknown): void {
  try { prefSet(key, JSON.stringify(value)); } catch { /* قيمةٌ لا تُسلسل */ }
}

/** جلسةُ التبويب وحدها؛ لا تُرحّل إلى Preferences. */
export function sessionGet(key: string): string | null {
  try { return sessionStore()?.getItem(key) ?? null; } catch { return null; }
}

export function sessionSet(key: string, value: string): void {
  try { sessionStore()?.setItem(key, value); } catch { /* ignore */ }
}

export function sessionRemove(key: string): void {
  try { sessionStore()?.removeItem(key); } catch { /* ignore */ }
}

/** للاختبارات وحدها. */
export function __resetPrefsForTests(): void {
  cache = new Map();
  initialized = false;
  initPromise = null;
  preferences = null;
  pendingWrites.clear();
  writeQueue = Promise.resolve();
  failedNativeWrites.clear();
}
