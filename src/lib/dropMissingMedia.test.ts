import { describe, it, expect } from "vitest";
import { dropMissingMedia } from "./utils";
import { mediaTombKey } from "./mediaHash";
import type { JournalEntry } from "./types";

const H = "a".repeat(32);
const OTHER = "b".repeat(32);

describe("dropMissingMedia — إسقاط مراجع الوسائط الضائعة", () => {
  it("يُسقط الهاش المكسور من photoRefs ويكتب شاهد حذفه ويُبقي ما سواه", () => {
    const e = { id: "e1", date: "2026-01-01", content: "نص", photoRefs: [H, OTHER] } as JournalEntry;
    const r = dropMissingMedia(e, new Set([H]), new Set());
    expect(r?.entry.photoRefs).toEqual([OTHER]);
    expect(r?.entry.content).toBe("نص");
    expect(r?.tombstones).toEqual([mediaTombKey("e1", "photos", H)]);
  });

  it("يُفرغ الحقل حين يكون المكسور وحده، ويُسقط المرفق بهاشه", () => {
    const e = {
      id: "e2", date: "2026-01-01", content: "",
      photoRefs: [H],
      attachmentRefs: [{ hash: H, type: "pdf" }],
    } as unknown as JournalEntry;
    const r = dropMissingMedia(e, new Set([H]), new Set());
    expect(r?.entry.photoRefs).toBeUndefined();
    expect(r?.entry.attachmentRefs).toBeUndefined();
    expect(r?.tombstones).toContain(mediaTombKey("e2", "attachments", H));
  });

  it("يُرجع null حين لا مرجع مطابقاً — لا تعديل بلا سبب", () => {
    const e = { id: "e3", date: "2026-01-01", content: "", photoRefs: [OTHER] } as JournalEntry;
    expect(dropMissingMedia(e, new Set([H]), new Set())).toBeNull();
  });

  it("الأصوات بمجموعتها لا بمجموعة الصور", () => {
    const e = { id: "e4", date: "2026-01-01", content: "", audioRefs: [H] } as JournalEntry;
    expect(dropMissingMedia(e, new Set([H]), new Set())).toBeNull();
    expect(dropMissingMedia(e, new Set(), new Set([H]))?.entry.audioRefs).toBeUndefined();
  });
});
