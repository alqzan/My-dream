import { beforeEach, describe, expect, it, vi } from "vitest";

const { nativeMode, nativeValues, rejectKeys } = vi.hoisted(() => ({
  nativeMode: { value: true },
  nativeValues: new Map<string, string>(),
  rejectKeys: { value: false },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => nativeMode.value },
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    keys: async () => {
      if (rejectKeys.value) throw new Error("Preferences unavailable");
      return { keys: [...nativeValues.keys()] };
    },
    get: async ({ key }: { key: string }) => ({ value: nativeValues.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => { nativeValues.set(key, value); },
    remove: async ({ key }: { key: string }) => { nativeValues.delete(key); },
  },
}));

import { __resetPrefsForTests, initializePrefs, prefGet, prefRemove, prefSet } from "./prefs";

function storage(values: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(values));
  return {
    get length() { return data.size; },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
    clear: () => data.clear(),
  };
}

beforeEach(() => {
  __resetPrefsForTests();
  nativeValues.clear();
  nativeMode.value = true;
  rejectKeys.value = false;
  vi.stubGlobal("localStorage", storage());
});

describe("native Preferences migration", () => {
  it("preserves empty sync-space and PIN values as present values", async () => {
    vi.stubGlobal("localStorage", storage({ "madar-sync-space": "", "madar-lock-pin": "" }));

    await initializePrefs();

    expect(prefGet("madar-sync-space")).toBe("");
    expect(prefGet("madar-lock-pin")).toBe("");
    expect(nativeValues.has("madar-sync-space")).toBe(true);
    expect(nativeValues.has("madar-lock-pin")).toBe(true);
  });

  it("keeps absent sync-space and PIN keys absent", async () => {
    await initializePrefs();

    expect(prefGet("madar-sync-space")).toBeNull();
    expect(prefGet("madar-lock-pin")).toBeNull();
    expect(nativeValues.has("madar-sync-space")).toBe(false);
    expect(nativeValues.has("madar-lock-pin")).toBe(false);
  });

  it("does not replace an existing native empty value with a legacy value", async () => {
    nativeValues.set("madar-sync-space", "");
    vi.stubGlobal("localStorage", storage({ "madar-sync-space": "legacy-key" }));

    await initializePrefs();

    expect(prefGet("madar-sync-space")).toBe("");
    expect(nativeValues.get("madar-sync-space")).toBe("");
  });

  it("migrates only Madar-owned keys", async () => {
    vi.stubGlobal("localStorage", storage({ "other-app-setting": "keep-local", "madar-setting": "migrate" }));

    await initializePrefs();

    expect(nativeValues.get("madar-setting")).toBe("migrate");
    expect(nativeValues.has("other-app-setting")).toBe(false);
    expect(localStorage.getItem("other-app-setting")).toBe("keep-local");
  });

  it("rejects initialization instead of hydrating with incomplete native preferences", async () => {
    rejectKeys.value = true;
    vi.stubGlobal("localStorage", storage({ "madar-sync-space": "legacy" }));

    await expect(initializePrefs()).rejects.toThrow("Preferences unavailable");
    expect(prefGet("madar-sync-space")).toBeNull();
  });

  it("keeps boot guard writes synchronous in localStorage", async () => {
    const local = storage();
    vi.stubGlobal("localStorage", local);
    await initializePrefs();

    prefSet("madar-boot-attempts", "2");

    expect(local.getItem("madar-boot-attempts")).toBe("2");
    expect(nativeValues.has("madar-boot-attempts")).toBe(false);
  });

  it("writes a synchronous shadow for native preferences", async () => {
    const local = storage();
    vi.stubGlobal("localStorage", local);
    await initializePrefs();

    prefSet("madar-journal-draft", "latest draft");

    const shadow = local.getItem("madar-pref-shadow:madar-journal-draft");
    expect(shadow).toBe(JSON.stringify({ value: "latest draft" }));
  });

  it("recovers the synchronous shadow over an older native value on next boot", async () => {
    nativeValues.set("madar-journal-draft", "older draft");
    vi.stubGlobal("localStorage", storage({
      "madar-pref-shadow:madar-journal-draft": JSON.stringify({ value: "latest draft" }),
    }));
    await initializePrefs();

    expect(prefGet("madar-journal-draft")).toBe("latest draft");
    expect(nativeValues.get("madar-journal-draft")).toBe("latest draft");
    expect(localStorage.getItem("madar-pref-shadow:madar-journal-draft")).toBeNull();
  });

  it("does not resurrect a removed key from a legacy localStorage copy", async () => {
    nativeValues.set("madar-sync-space", "old native key");
    vi.stubGlobal("localStorage", storage({ "madar-sync-space": "legacy key" }));
    prefRemove("madar-sync-space");

    await initializePrefs();

    expect(prefGet("madar-sync-space")).toBeNull();
    expect(nativeValues.has("madar-sync-space")).toBe(false);
  });

  it("does not resurrect a tombstoned key after process restart", async () => {
    nativeValues.set("madar-sync-space", "old native key");
    vi.stubGlobal("localStorage", storage({
      "madar-sync-space": "stale legacy key",
      "madar-pref-shadow:madar-sync-space": JSON.stringify({ remove: true }),
    }));

    await initializePrefs();

    expect(prefGet("madar-sync-space")).toBeNull();
    expect(nativeValues.has("madar-sync-space")).toBe(false);
    expect(localStorage.getItem("madar-sync-space")).toBeNull();
  });
});

describe("browser Preferences behavior", () => {
  it("continues to read and write localStorage synchronously", () => {
    nativeMode.value = false;
    const local = storage();
    vi.stubGlobal("localStorage", local);

    prefSet("sample", "value");

    expect(prefGet("sample")).toBe("value");
    expect(nativeValues.size).toBe(0);
  });
});

describe("corrupt shadow values", () => {
  it("skips an unparseable shadow instead of failing startup", async () => {
    nativeValues.set("madar-sync-space", "native-value");
    vi.stubGlobal("localStorage", storage({
      "madar-pref-shadow:madar-sync-space": "{not json",
      "madar-pref-shadow:madar-theme-preferences": JSON.stringify({ value: "dark" }),
    }));

    await expect(initializePrefs()).resolves.toBeUndefined();

    expect(prefGet("madar-sync-space")).toBe("native-value");
    expect(prefGet("madar-theme-preferences")).toBe("dark");
    expect(localStorage.getItem("madar-pref-shadow:madar-sync-space")).toBeNull();
  });
});
