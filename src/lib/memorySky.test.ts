import { describe, it, expect } from "vitest";
import {
  skyView,
  clusterByMonth,
  clusterByYear,
  clusterByDay,
  entryVoice,
  silentDates,
  SKY_CLUSTER_THRESHOLD,
} from "./memorySky";
import type { JournalEntry } from "./types";

// يولّد n مذكرة موزّعة على أشهرٍ حقيقية عبر ~3 سنوات.
function makeEntries(n: number): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (let i = 0; i < n; i++) {
    const year = 2024 + (i % 3);
    const month = (i % 12) + 1;
    const day = (i % 27) + 1;
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    out.push({ id: `e${i}`, date, content: `مذكرة ${i}` });
  }
  return out;
}

describe("skyView — adaptive stars vs constellations", () => {
  it("keeps individual stars below the threshold", () => {
    const v = skyView(makeEntries(50));
    expect(v.mode).toBe("stars");
    if (v.mode === "stars") expect(v.entries).toHaveLength(50);
  });

  it("switches to constellations above the threshold", () => {
    const v = skyView(makeEntries(SKY_CLUSTER_THRESHOLD + 1));
    expect(v.mode).toBe("constellations");
  });

  it("clusters a 334-memory archive without losing any", () => {
    const entries = makeEntries(334);
    const v = skyView(entries);
    expect(v.mode).toBe("constellations");
    if (v.mode === "constellations") {
      const total = v.clusters.reduce((s, c) => s + c.count, 0);
      expect(total).toBe(334);
      // كوكباتٌ مرتّبة من الأحدث للأقدم.
      for (let i = 1; i < v.clusters.length; i++) {
        expect(v.clusters[i - 1].key >= v.clusters[i].key).toBe(true);
      }
      // كلُّ كوكبةٍ لها اسمٌ وعدد صحيح.
      expect(v.clusters.every((c) => c.label && c.count === c.entries.length)).toBe(true);
    }
  });

  it("clusters a 1000-memory archive without losing any", () => {
    const entries = makeEntries(1000);
    const v = skyView(entries);
    expect(v.mode).toBe("constellations");
    if (v.mode === "constellations") {
      expect(v.clusters.reduce((s, c) => s + c.count, 0)).toBe(1000);
    }
  });
});

describe("clusterByMonth", () => {
  it("groups by YYYY-MM and skips malformed dates", () => {
    const entries: JournalEntry[] = [
      { id: "a", date: "2026-01-05", content: "" },
      { id: "b", date: "2026-01-20", content: "" },
      { id: "c", date: "2026-02-01", content: "" },
      { id: "d", date: "bad-date", content: "" },
    ];
    const clusters = clusterByMonth(entries);
    expect(clusters).toHaveLength(2); // Jan + Feb, malformed dropped
    const jan = clusters.find((c) => c.key === "2026-01");
    expect(jan?.count).toBe(2);
  });
});

describe("year galaxy / day planet hierarchy", () => {
  it("groups every valid entry into a year galaxy with month stars", () => {
    const entries: JournalEntry[] = [
      { id: "a", date: "2025-12-31", content: "" },
      { id: "b", date: "2026-01-01", content: "" },
      { id: "c", date: "2026-02-01", content: "" },
      { id: "bad", date: "nope", content: "" },
      { id: "bad-prefix", date: "2027oops", content: "" },
    ];
    const years = clusterByYear(entries);
    expect(years.map((y) => y.year)).toEqual([2026, 2025]);
    expect(years.reduce((sum, y) => sum + y.count, 0)).toBe(3);
    expect(years[0].months.map((m) => m.key)).toEqual(["2026-02", "2026-01"]);
  });

  it("creates one day planet while preserving multiple entries inside it", () => {
    const entries: JournalEntry[] = [
      { id: "a", date: "2026-08-25", content: "أ" },
      { id: "b", date: "2026-08-25", content: "ب" },
      { id: "c", date: "2026-08-24", content: "ج" },
    ];
    const days = clusterByDay(entries);
    expect(days.map((d) => d.date)).toEqual(["2026-08-25", "2026-08-24"]);
    expect(days[0].count).toBe(2);
    expect(days[0].entries.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("entryVoice / silentDates", () => {
  const e = (over: Partial<JournalEntry>): JournalEntry =>
    ({ id: over.date ?? "x", date: "2026-07-10", content: "", ...over } as JournalEntry);

  it("counts a title or content as text", () => {
    expect(entryVoice(e({ content: "يومٌ جميل" }))).toBe("text");
    expect(entryVoice(e({ content: "   ", title: "عنوان" }))).toBe("text");
  });
  it("marks photo/audio-only entries as media", () => {
    expect(entryVoice(e({ content: "", photos: ["a"] }))).toBe("media");
    expect(entryVoice(e({ content: "\n ", audio: "b" }))).toBe("media");
  });
  it("marks a fully empty entry as empty", () => {
    expect(entryVoice(e({ content: "" }))).toBe("empty");
  });

  it("lists the days with no entry, newest first", () => {
    const entries = [e({ date: "2026-07-01" }), e({ date: "2026-07-04" })];
    expect(silentDates(entries, "2026-07-01", "2026-07-05")).toEqual([
      "2026-07-05", "2026-07-03", "2026-07-02",
    ]);
  });
  it("respects the limit and rejects a bad range", () => {
    expect(silentDates([], "2026-07-01", "2026-07-31", 3)).toHaveLength(3);
    expect(silentDates([], "2026-07-05", "2026-07-01")).toEqual([]);
    expect(silentDates([], "bogus", "2026-07-01")).toEqual([]);
  });
  it("crosses a month boundary", () => {
    expect(silentDates([e({ date: "2026-07-01" })], "2026-06-29", "2026-07-01")).toEqual([
      "2026-06-30", "2026-06-29",
    ]);
  });
});
