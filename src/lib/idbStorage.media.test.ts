import { beforeEach, describe, expect, it, vi } from "vitest";

// كلُّ ما تحت `idbStorage` يمرّ بـ`idb-keyval`؛ نستبدله بخريطةٍ في الذاكرة لنرى
// ما يُكتب فعلاً في كلّ مفتاح.
const data = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => data.get(k),
  set: async (k: string, v: unknown) => { data.set(k, v); },
  del: async (k: string) => { data.delete(k); },
}));

const photo = `data:image/webp;base64,${"Q".repeat(200_000)}`;

beforeEach(() => { data.clear(); vi.resetModules(); });

describe("persisted store blob", () => {
  it("writes media to their own keys and restores them on read", async () => {
    const { persistJSONStorage, flushPersistedStrict } = await import("./idbStorage");
    const storage = persistJSONStorage<{ journal: { photos: string[] }[] }>();
    await storage.setItem("my-dream-store", { state: { journal: [{ photos: [photo] }] }, version: 19 });
    await flushPersistedStrict();

    const blob = data.get("my-dream-store") as string;
    expect(blob.length).toBeLessThan(500);
    expect(blob).not.toContain("data:image");
    expect([...data.keys()].filter((k) => k.startsWith("madar-media:"))).toHaveLength(1);

    vi.resetModules();
    const fresh = await import("./idbStorage");
    const read = await fresh.persistJSONStorage<{ journal: { photos: string[] }[] }>().getItem("my-dream-store");
    expect(read?.state.journal[0].photos[0]).toBe(photo);
  });
});
