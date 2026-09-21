import { beforeEach, describe, expect, it, vi } from "vitest";

const idb = new Map<string, string>();
let failWrites = false;
vi.mock("idb-keyval", () => ({
  get: async (key: string) => idb.get(key),
  set: async (key: string, value: string) => {
    if (failWrites) throw new Error("IndexedDB unavailable");
    idb.set(key, value);
  },
  del: async (key: string) => { idb.delete(key); },
}));

import { idbStorage } from "./idbStorage";

function localStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
}

beforeEach(() => {
  idb.clear();
  failWrites = false;
  vi.stubGlobal("window", { localStorage: localStore() });
});

describe("idbStorage recovery", () => {
  it("keeps the snapshot in the local fallback when IndexedDB rejects", async () => {
    failWrites = true;
    await idbStorage.setItem("my-dream-store", "latest");
    expect(await idbStorage.getItem("my-dream-store")).toBe("latest");
  });

  it("removes the fallback once IndexedDB is writable again", async () => {
    failWrites = true;
    await idbStorage.setItem("my-dream-store", "old");
    failWrites = false;
    await idbStorage.setItem("my-dream-store", "new");
    expect(await idbStorage.getItem("my-dream-store")).toBe("new");
    expect(idb.get("my-dream-store")).toBe("new");
  });
});
