import { describe, it, expect } from "vitest";
import { parseDayOneJson } from "./dayOneParser";

describe("parseDayOneJson — stable identity", () => {
  it("gives a UUID-less entry a stable id that repeats across imports", () => {
    const json = JSON.stringify({
      entries: [{ creationDate: "2026-04-01T09:00:00Z", text: "بلا معرّف" }],
    });

    const a = parseDayOneJson(json).entries[0];
    const b = parseDayOneJson(json).entries[0];

    expect(a.id).toBe(b.id);          // same content → same id → dedupes on re-import
    expect(a.id).toMatch(/^do-syn-/); // synthetic key, not a random uid
    expect(a.dayOneUUID).toBe(a.id.slice(3)); // store dedups on this same key
  });

  it("keeps deriving the id from the real UUID when present", () => {
    const json = JSON.stringify({
      entries: [{ uuid: "real-1", creationDate: "2026-04-01T09:00:00Z", text: "معرّف حقيقي" }],
    });
    const e = parseDayOneJson(json).entries[0];
    expect(e.id).toBe("do-real-1");
    expect(e.dayOneUUID).toBe("real-1");
  });

  it("distinguishes two UUID-less entries with different content", () => {
    const e = parseDayOneJson(JSON.stringify({
      entries: [
        { creationDate: "2026-04-01T09:00:00Z", text: "أول" },
        { creationDate: "2026-04-01T09:00:00Z", text: "ثاني" },
      ],
    })).entries;
    expect(e[0].id).not.toBe(e[1].id);
  });
});
