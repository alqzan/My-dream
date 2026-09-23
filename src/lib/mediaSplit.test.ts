import { describe, expect, it } from "vitest";
import { MEDIA_KEY_PREFIX, MEDIA_MIN_CHARS, MEDIA_PLACEHOLDER, createMediaSplitter, mediaContentKey } from "./mediaSplit";

const photo = (seed: string) => `data:image/webp;base64,${seed.repeat(MEDIA_MIN_CHARS)}`;

function memoryKV() {
  const data = new Map<string, string>();
  let writes = 0;
  let failWrites = false;
  return {
    data,
    get writes() { return writes; },
    set failWrites(v: boolean) { failWrites = v; },
    kv: {
      get: async (k: string) => data.get(k),
      set: async (k: string, v: string) => {
        if (failWrites) throw Object.assign(new Error("boom"), { name: "UnknownError" });
        writes += 1; data.set(k, v);
      },
    },
  };
}

const state = () => ({
  state: {
    journal: [{ id: "j1", content: "نص", photos: [photo("A"), photo("B")], audio: photo("C") }],
    note: "data:short",
  },
  version: 19,
});

describe("createMediaSplitter", () => {
  it("keeps media out of the blob and restores it losslessly", async () => {
    const mem = memoryKV();
    const writer = createMediaSplitter(mem.kv);
    const json = writer.serialize(state());
    await writer.writePending();
    expect(json.length).toBeLessThan(1000);
    expect(json).toContain(MEDIA_PLACEHOLDER);
    expect(json).toContain("data:short");
    expect(mem.data.size).toBe(3);

    const reader = createMediaSplitter(mem.kv);
    expect(await reader.restore(JSON.parse(json))).toEqual(state());
  });

  it("writes each medium once across saves", async () => {
    const mem = memoryKV();
    const s = createMediaSplitter(mem.kv);
    const value = state();
    s.serialize(value); await s.writePending();
    value.state.journal[0].content = "تعديل";
    s.serialize(value); await s.writePending();
    expect(mem.writes).toBe(3);
  });

  it("does not rewrite media restored at boot", async () => {
    const mem = memoryKV();
    const first = createMediaSplitter(mem.kv);
    const json = first.serialize(state()); await first.writePending();
    const boot = createMediaSplitter(mem.kv);
    const restored = await boot.restore(JSON.parse(json));
    boot.serialize(restored); await boot.writePending();
    expect(mem.writes).toBe(3);
  });

  it("retries media whose write failed on the next save", async () => {
    const mem = memoryKV();
    const s = createMediaSplitter(mem.kv);
    mem.failWrites = true;
    s.serialize(state());
    await expect(s.writePending()).rejects.toThrow("boom");
    mem.failWrites = false;
    s.serialize(state()); await s.writePending();
    expect(mem.data.size).toBe(3);
  });

  it("inlines unwritten media when their own write failed", async () => {
    const mem = memoryKV();
    const s = createMediaSplitter(mem.kv);
    mem.failWrites = true;
    const json = s.serialize(state());
    await expect(s.writePending()).rejects.toThrow("boom");
    expect(s.pendingCount()).toBe(3);
    expect(JSON.parse(s.inlinePending(json))).toEqual(state());
  });

  it("keeps an unreadable reference instead of erasing the medium", async () => {
    const mem = memoryKV();
    const s = createMediaSplitter(mem.kv);
    const json = s.serialize(state()); await s.writePending();
    mem.data.delete(MEDIA_KEY_PREFIX + mediaContentKey(photo("B")));
    const restored = await createMediaSplitter(mem.kv).restore(JSON.parse(json));
    expect(restored.state.journal[0].photos[0]).toBe(photo("A"));
    expect(restored.state.journal[0].photos[1]).toBe(MEDIA_PLACEHOLDER + mediaContentKey(photo("B")));
  });

  it("reads a legacy blob with inline media unchanged", async () => {
    const mem = memoryKV();
    const legacy = JSON.parse(JSON.stringify(state()));
    expect(await createMediaSplitter(mem.kv).restore(legacy)).toEqual(state());
  });
});
