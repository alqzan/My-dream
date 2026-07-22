import { describe, it, expect, vi, beforeEach } from "vitest";

// The persisted store talks to IndexedDB via idb-keyval; stub it so the store
// boots in plain Node without a browser.
const idb = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => { idb.set(k, v); },
  del: async (k: string) => { idb.delete(k); },
}));

import { useAppStore } from "./store";
import { photoHash } from "./mediaHash";
import type { JournalEntry } from "./types";

const doEntry = (uuid: string, o: Partial<JournalEntry> = {}): JournalEntry => ({
  id: `do-${uuid}`, date: "2026-01-01", content: "c", source: "dayOne", dayOneUUID: uuid, ...o,
});

const flush = () => new Promise((r) => setTimeout(r, 30));
const P1 = "data:image/png;base64,AAAA";
const P2 = "data:image/png;base64,BBBB";

beforeEach(() => {
  useAppStore.setState({ journalEntries: [], deleted: {} });
});

describe("importDayOneEntries — delete then re-import stays visible after sync", () => {
  it("lifts the tombstone the delete left, so the cloud merge can't drop it", () => {
    useAppStore.setState({ journalEntries: [doEntry("u1")] });
    useAppStore.getState().deleteDayOneImports();
    // Precondition: deleting recorded a tombstone for the entry's id.
    expect(useAppStore.getState().deleted?.["do-u1"]).toBeGreaterThan(0);

    const touched = useAppStore.getState().importDayOneEntries([doEntry("u1")]);
    const st = useAppStore.getState();

    expect(touched).toBe(1);
    expect(st.journalEntries.find((x) => x.id === "do-u1")).toBeTruthy();
    expect(st.deleted?.["do-u1"]).toBeUndefined(); // tombstone lifted → survives sync
  });
});

describe("importDayOneEntries — completes partially-missing media", () => {
  it("adds the missing photos to an entry that already has one", () => {
    useAppStore.setState({ journalEntries: [doEntry("u2", { photos: ["p1"], photo: "p1" })] });

    const touched = useAppStore
      .getState()
      .importDayOneEntries([doEntry("u2", { photos: ["p1", "p2", "p3"], photo: "p1" })]);

    const e = useAppStore.getState().journalEntries.find((x) => x.id === "do-u2")!;
    expect(touched).toBe(1);
    expect(e.photos).toEqual(["p1", "p2", "p3"]);
  });

  it("fills media onto an entry that had none (legacy behavior still works)", () => {
    useAppStore.setState({ journalEntries: [doEntry("u4", {})] });
    useAppStore.getState().importDayOneEntries([doEntry("u4", { photos: ["p1"], photo: "p1" })]);
    const e = useAppStore.getState().journalEntries.find((x) => x.id === "do-u4")!;
    expect(e.photos).toEqual(["p1"]);
  });

  it("does nothing when the entry already holds the full set (no churn)", () => {
    useAppStore.setState({ journalEntries: [doEntry("u3", { photos: ["p1", "p2"], photo: "p1" })] });
    const touched = useAppStore
      .getState()
      .importDayOneEntries([doEntry("u3", { photos: ["p1", "p2"], photo: "p1" })]);
    expect(touched).toBe(0);
  });
});

describe("updateJournalEntry — records media tombstones on single-photo delete", () => {
  it("tombstones the removed photo's hash (and not the kept one)", async () => {
    useAppStore.setState({
      journalEntries: [doEntry("m1", { photos: [P1, P2], photo: P1 })],
      deletedMedia: {},
    });
    useAppStore.getState().updateJournalEntry("do-m1", { photos: [P1], photo: P1 });
    await flush();

    const dm = useAppStore.getState().deletedMedia ?? {};
    expect(dm[await photoHash(P2)]).toBeGreaterThan(0); // removed → tombstoned
    expect(dm[await photoHash(P1)]).toBeUndefined(); // kept → not tombstoned
  });

  it("lifts the tombstone when the same photo is re-added", async () => {
    useAppStore.setState({
      journalEntries: [doEntry("m2", { photos: [P1, P2], photo: P1 })],
      deletedMedia: {},
    });
    useAppStore.getState().updateJournalEntry("do-m2", { photos: [P1], photo: P1 }); // delete P2
    await flush();
    expect((useAppStore.getState().deletedMedia ?? {})[await photoHash(P2)]).toBeGreaterThan(0);

    useAppStore.getState().updateJournalEntry("do-m2", { photos: [P1, P2], photo: P1 }); // re-add P2
    await flush();
    expect((useAppStore.getState().deletedMedia ?? {})[await photoHash(P2)]).toBeUndefined();
  });
});
