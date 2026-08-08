import { describe, expect, it } from "vitest";
import { dedupeInboxItems } from "./inboxDedupe";

describe("dedupeInboxItems", () => {
  it("keeps a single item as-is", () => {
    const { unique, duplicateIds } = dedupeInboxItems([{ id: "a", text: "خصم 45 ريال" }]);
    expect(unique).toHaveLength(1);
    expect(duplicateIds).toHaveLength(0);
  });

  it("collapses two items with identical text, keeping the first", () => {
    const { unique, duplicateIds } = dedupeInboxItems([
      { id: "a", text: "خصم 45 ريال لدى مقهى" },
      { id: "b", text: "خصم 45 ريال لدى مقهى" },
    ]);
    expect(unique.map((i) => i.id)).toEqual(["a"]);
    expect(duplicateIds).toEqual(["b"]);
  });

  it("does not collapse items with different text (two real, different messages)", () => {
    const { unique, duplicateIds } = dedupeInboxItems([
      { id: "a", text: "خصم 45 ريال لدى مقهى" },
      { id: "b", text: "خصم 12 ريال لدى بقالة" },
    ]);
    expect(unique.map((i) => i.id)).toEqual(["a", "b"]);
    expect(duplicateIds).toHaveLength(0);
  });

  it("normalizes only whitespace, not digits/punctuation — a different amount is never treated as a duplicate", () => {
    const { unique, duplicateIds } = dedupeInboxItems([
      { id: "a", text: "خصم 45.00 ريال" },
      { id: "b", text: "خصم 45.01 ريال" },
    ]);
    expect(unique).toHaveLength(2);
    expect(duplicateIds).toHaveLength(0);
  });

  it("treats messages that differ only by whitespace as duplicates", () => {
    const { unique, duplicateIds } = dedupeInboxItems([
      { id: "a", text: "خصم   45 ريال" },
      { id: "b", text: "خصم 45 ريال" },
    ]);
    expect(unique.map((i) => i.id)).toEqual(["a"]);
    expect(duplicateIds).toEqual(["b"]);
  });

  it("collapses three or more exact repeats down to one, marking the rest as duplicates", () => {
    const { unique, duplicateIds } = dedupeInboxItems([
      { id: "a", text: "رمز التحقق 1234" },
      { id: "b", text: "رمز التحقق 1234" },
      { id: "c", text: "رمز التحقق 1234" },
    ]);
    expect(unique.map((i) => i.id)).toEqual(["a"]);
    expect(duplicateIds).toEqual(["b", "c"]);
  });

  it("never collapses empty/whitespace-only messages against each other", () => {
    const { unique, duplicateIds } = dedupeInboxItems([
      { id: "a", text: "" },
      { id: "b", text: "   " },
    ]);
    expect(unique.map((i) => i.id)).toEqual(["a", "b"]);
    expect(duplicateIds).toHaveLength(0);
  });

  it("returns empty results for an empty batch", () => {
    const { unique, duplicateIds } = dedupeInboxItems([]);
    expect(unique).toEqual([]);
    expect(duplicateIds).toEqual([]);
  });
});
