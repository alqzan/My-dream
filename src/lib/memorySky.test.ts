import { describe, it, expect } from "vitest";
import { skyView, clusterByMonth, SKY_CLUSTER_THRESHOLD } from "./memorySky";
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
