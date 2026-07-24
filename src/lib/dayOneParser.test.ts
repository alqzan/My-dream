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

  it("keeps same-day memories distinct — real UUIDs give distinct ids", () => {
    // Multiple memories on ONE day: each has its own Day One UUID → distinct id,
    // so nothing collapses them just for sharing a date.
    const e = parseDayOneJson(JSON.stringify({
      entries: [
        { uuid: "m1", creationDate: "2026-02-14T07:00:00Z", text: "صباح" },
        { uuid: "m2", creationDate: "2026-02-14T13:00:00Z", text: "ظهر" },
        { uuid: "m3", creationDate: "2026-02-14T22:00:00Z", text: "مساء" },
      ],
    })).entries;
    expect(new Set(e.map((x) => x.id)).size).toBe(3); // three distinct ids
    expect(e.every((x) => x.date === "2026-02-14")).toBe(true); // same day
  });

  it("UUID-less same-day entries differ by time even with identical text", () => {
    // The synthetic key uses the FULL timestamp, not just the day — two entries
    // on the same day at different times stay distinct.
    const e = parseDayOneJson(JSON.stringify({
      entries: [
        { creationDate: "2026-02-14T07:00:00Z", text: "نفس النص" },
        { creationDate: "2026-02-14T22:00:00Z", text: "نفس النص" },
      ],
    })).entries;
    expect(e[0].id).not.toBe(e[1].id);
  });
});
