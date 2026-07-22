import { describe, it, expect } from "vitest";
import { mergeEntryMedia } from "./utils";
import type { JournalEntry } from "./types";

type E = JournalEntry & { photoRefs?: string[]; audioRefs?: string[] };
const entry = (o: Partial<E> & { id: string }): E => ({ date: "2026-01-01", content: "", ...o });

describe("mergeEntryMedia — no ref is ever dropped, no deletion resurrected", () => {
  it("fills photos onto a base that has none", () => {
    const base = entry({ id: "E1", content: "text only" });
    const other = entry({ id: "E1", photos: ["p1", "p2"], photo: "p1" });
    expect(mergeEntryMedia(base, other).photos).toEqual(["p1", "p2"]);
  });

  it("does NOT resurrect a photo the user removed on the base copy", () => {
    // base deleted p2 (single-photo delete is a real editor action); other lags.
    const base = entry({ id: "E1", photos: ["p1", "p3"], photo: "p1", content: "base" });
    const other = entry({ id: "E1", photos: ["p1", "p2", "p3"], photo: "p1" });
    const out = mergeEntryMedia(base, other);
    expect(out.photos).toEqual(["p1", "p3"]); // base's set is kept as-is
  });

  it("unions pending photoRefs from BOTH copies (they are content hashes)", () => {
    const base = entry({ id: "E1", photos: ["p1"], photo: "p1", photoRefs: ["h1"] });
    const other = entry({ id: "E1", photoRefs: ["h2"] });
    const out = mergeEntryMedia(base, other) as E;
    // Without the union, h2 would be dropped and its R2 object orphaned.
    expect(out.photoRefs).toEqual(["h1", "h2"]);
    expect(out.photos).toEqual(["p1"]); // base's real photo still shown
  });

  it("preserves a ref held only by the LOSING copy", () => {
    // base wins the photo set (has bytes), other carries only an unresolved ref.
    const base = entry({ id: "E1", photos: ["p1", "p2"], photo: "p1" });
    const other = entry({ id: "E1", photoRefs: ["pending"] });
    const out = mergeEntryMedia(base, other) as E;
    expect(out.photos).toEqual(["p1", "p2"]);
    expect(out.photoRefs).toEqual(["pending"]); // survives the merge
  });

  it("dedupes identical refs across copies", () => {
    const base = entry({ id: "E1", photoRefs: ["h1", "h2"] });
    const other = entry({ id: "E1", photoRefs: ["h2", "h3"] });
    expect((mergeEntryMedia(base, other) as E).photoRefs).toEqual(["h1", "h2", "h3"]);
  });

  it("unions audio refs regardless of which audio set is kept", () => {
    const base = entry({ id: "E1", audios: ["a1"], audio: "a1", audioRefs: ["ah1"] });
    const other = entry({ id: "E1", audios: ["a1", "a2"], audio: "a1", audioRefs: ["ah2"] });
    const out = mergeEntryMedia(base, other) as E;
    expect(out.audios).toEqual(["a1"]); // base kept (conservative)
    expect(out.audioRefs).toEqual(["ah1", "ah2"]); // but no ref is lost
  });

  it("leaves an entry with no media untouched (no empty ref arrays)", () => {
    const base = entry({ id: "E1", content: "text only" });
    const out = mergeEntryMedia(base, entry({ id: "E1", content: "x" })) as E;
    expect(out.photoRefs).toBeUndefined();
    expect(out.audioRefs).toBeUndefined();
    expect(out.photos).toBeUndefined();
  });
});
