import { describe, it, expect } from "vitest";
import { aggregateDay } from "./dayAggregator";
import type { JournalEntry, ReadingLog } from "./types";

const D = "2026-07-20";
function base(over: Partial<Parameters<typeof aggregateDay>[1]> = {}) {
  return {
    transactions: [], journalEntries: [], readingLogs: [], books: [], habits: [], prayerLogs: [],
    ...over,
  };
}
const j = (date: string): JournalEntry => ({ id: `j${date}`, date, content: "x" });
const r = (date: string): ReadingLog => ({ id: `r${date}`, bookId: "b", date, pagesRead: 5 });

describe("aggregateDay — «اليوم المكتمل» يحترم القرآن والطقوس المجمّدة", () => {
  it("counts Quran activity as one of the required rituals", () => {
    // مذكرة + قراءة فقط، بلا نشاطٍ قرآني → غير مكتمل (القرآن مطلوب).
    const noQuran = aggregateDay(D, base({ journalEntries: [j(D)], readingLogs: [r(D)] }));
    expect(noQuran.complete).toBe(false);
    expect(noQuran.activeRitualCount).toBe(3);
    expect(noQuran.completionScore).toBe(2);

    // مع نشاطٍ قرآني → مكتمل.
    const withQuran = aggregateDay(D, base({ journalEntries: [j(D)], readingLogs: [r(D)], quranActive: true }));
    expect(withQuran.complete).toBe(true);
    expect(withQuran.activeRitualLabels).toEqual(["مذكرة", "قراءة", "وِرد"]);
  });

  it("a frozen ritual is not required and does not break completion", () => {
    // القراءة مجمّدة → يكفي مذكرة + وِرد للاكتمال.
    const day = aggregateDay(D, base({
      journalEntries: [j(D)], quranActive: true, frozenHabits: ["core:reading"],
    }));
    expect(day.activeRitualCount).toBe(2);
    expect(day.activeRitualLabels).toEqual(["مذكرة", "وِرد"]);
    expect(day.complete).toBe(true);
  });

  it("an empty day is not complete", () => {
    expect(aggregateDay(D, base()).complete).toBe(false);
  });
});
