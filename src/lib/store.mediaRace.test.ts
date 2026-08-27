import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// Hold media hashes so the test can deliberately complete a later edit before
// an earlier one. The store must serialize both edits for the same entry.
const { hashResolvers, mediaHashOfMock } = vi.hoisted(() => {
  const hashResolvers: Array<(hash: string | null) => void> = [];
  const mediaHashOfMock = vi.fn((_item: string) =>
    new Promise<string | null>((resolve) => hashResolvers.push(resolve))
  );
  return { hashResolvers, mediaHashOfMock };
});

vi.mock("./mediaHash", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mediaHash")>();
  return { ...actual, mediaHashOf: mediaHashOfMock };
});

const idb = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => { idb.set(k, v); },
  del: async (k: string) => { idb.delete(k); },
}));

let useAppStore: typeof import("./store").useAppStore;
let mediaTombKey: typeof import("./mediaHash").mediaTombKey;

beforeAll(async () => {
  ({ useAppStore } = await import("./store"));
  ({ mediaTombKey } = await import("./mediaHash"));
});

beforeEach(() => {
  hashResolvers.length = 0;
  mediaHashOfMock.mockClear();
  useAppStore.setState({ journalEntries: [], deletedMedia: {}, deleted: {} });
});

describe("updateJournalEntry — ترتيب شواهد الوسائط", () => {
  it("يحافظ على ترتيب حذف ثم إعادة إضافة حتى لو اكتمل الهاش اللاحق أولاً", async () => {
    const photo = "data:image/png;base64,RACE";
    const entryId = "race-entry";
    const hash = "f".repeat(32);
    const key = mediaTombKey(entryId, "photos", hash);
    useAppStore.setState({
      journalEntries: [{ id: entryId, date: "2026-01-01", content: "", photos: [photo], photo }],
    });

    useAppStore.getState().updateJournalEntry(entryId, { photos: [], photo: undefined });
    useAppStore.getState().updateJournalEntry(entryId, { photos: [photo], photo });

    // The first operation is allowed to start; the second must remain queued.
    await vi.waitFor(() => expect(hashResolvers).toHaveLength(1));
    hashResolvers[0](hash);
    await vi.waitFor(() => expect(hashResolvers).toHaveLength(2));

    // Complete the re-add hash before the remove hash's effects are observed.
    // A non-serialized implementation would leave the remove tombstone behind.
    hashResolvers[1](hash);
    await vi.waitFor(() => expect(useAppStore.getState().deletedMedia?.[key]).toBeUndefined());
    expect(useAppStore.getState().journalEntries[0].photos).toEqual([photo]);
  });
});
