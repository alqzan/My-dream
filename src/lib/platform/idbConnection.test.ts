import { beforeEach, describe, expect, it, vi } from "vitest";
import { get, set } from "idb-keyval";
import { createResilientStore } from "./idbConnection";

// محاكاةٌ دنيا لـIndexedDB: كلُّ `open` يعطي اتّصالاً جديداً على البيانات نفسِها،
// و`kill()` يُميت الاتّصالات القائمة **دون** `onclose` — كما يفعل Safari/iOS.
const data = new Map<IDBValidKey, unknown>();
let opens = 0;
let alive: { dead: boolean }[] = [];

function request<T>(result: () => T) {
  const req: Record<string, unknown> = {};
  queueMicrotask(() => {
    req.result = result();
    (req.onsuccess as (() => void) | undefined)?.();
  });
  return req;
}

function fakeIndexedDB() {
  return {
    open: () => {
      opens += 1;
      const state = { dead: false };
      alive.push(state);
      const db = {
        close: () => { state.dead = true; },
        transaction: () => {
          if (state.dead) {
            throw Object.assign(new Error("The database connection is closing."), { name: "InvalidStateError" });
          }
          return {
            objectStore: () => {
              const tx: Record<string, unknown> = {};
              return {
                get: (k: IDBValidKey) => request(() => data.get(k)),
                put: (v: unknown, k: IDBValidKey) => {
                  data.set(k, v);
                  queueMicrotask(() => (tx.oncomplete as (() => void) | undefined)?.());
                },
                transaction: tx,
              };
            },
          };
        },
      };
      return request(() => db);
    },
  };
}

const kill = () => { for (const s of alive) s.dead = true; };

beforeEach(() => {
  data.clear();
  opens = 0;
  alive = [];
  vi.stubGlobal("indexedDB", fakeIndexedDB());
});

describe("createResilientStore", () => {
  it("reuses one connection while it is alive", async () => {
    const store = createResilientStore();
    await set("a", 1, store);
    expect(await get("a", store)).toBe(1);
    expect(opens).toBe(1);
  });

  it("reopens after Safari silently closes the connection (InvalidStateError)", async () => {
    const store = createResilientStore();
    expect(await get("a", store)).toBeUndefined();
    kill();
    await set("a", "saved", store);
    expect(await get("a", store)).toBe("saved");
    expect(opens).toBe(2);
  });

  it("does not swallow unrelated errors", async () => {
    const store = createResilientStore();
    await expect(store("readonly", () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(opens).toBe(1);
  });
});
