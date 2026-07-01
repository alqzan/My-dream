import { get, set, del } from "idb-keyval";
import type { StateStorage } from "zustand/middleware";

// IndexedDB-backed storage for the persisted store. localStorage caps at
// ~5MB and overflows once there are many journal entries + daily photos
// ("The quota has been exceeded"); IndexedDB allows hundreds of MB.
export const idbStorage: StateStorage = {
  getItem: async (name) => {
    const value = await get<string>(name);
    if (value != null) return value;
    // One-time migration: if nothing in IDB yet, pull any legacy value that
    // was previously saved in localStorage so existing data isn't lost.
    if (typeof window !== "undefined") {
      const legacy = window.localStorage.getItem(name);
      if (legacy != null) {
        await set(name, legacy);
        try { window.localStorage.removeItem(name); } catch { /* ignore */ }
        return legacy;
      }
    }
    return null;
  },
  setItem: async (name, value) => {
    await set(name, value);
  },
  removeItem: async (name) => {
    await del(name);
  },
};
