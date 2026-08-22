import { describe, expect, it } from "vitest";
import type { Habit, JournalEntry, PrayerLog, ReadingLog } from "./types";
import { summarizeWeeklyActivity, weeklyDates } from "./weeklyActivity";

const asOf = new Date(2026, 7, 22, 12);

const journal = (date: string): JournalEntry => ({ id: `j-${date}`, date, content: "ملاحظة" });
const reading = (date: string, pagesRead = 8): ReadingLog => ({
  id: `r-${date}`,
  bookId: "book-1",
  date,
  pagesRead,
});
const habit = (logs: string[]): Habit => ({
  id: "habit-1",
  name: "مشي",
  icon: "🚶",
  color: "#6f8063",
  logs,
});

describe("summarizeWeeklyActivity — مصادر اليوم كلها تدخل تلقائياً", () => {
  it("يجمع الصلاة والقرآن والمذكرة والقراءة والعادة الجديدة", () => {
    const week = weeklyDates(asOf);
    const prayerLog: PrayerLog = {
      date: week[2],
      prayers: { الفجر: "منفردة", الظهر: "جماعة", العصر: "لم" },
    };
    const summary = summarizeWeeklyActivity({
      transactions: [],
      journalEntries: [journal(week[1])],
      readingLogs: [reading(week[3])],
      prayerLogs: [prayerLog],
      habits: [habit([week[4], week[5]])],
      quranActivity: [week[0], week[6]],
    }, asOf);

    expect(summary.prayerCount).toBe(2);
    expect(summary.prayerDays).toBe(1);
    expect(summary.journalDays).toBe(1);
    expect(summary.readingDays).toBe(1);
    expect(summary.quranDays).toBe(2);
    expect(summary.habitCompletions).toBe(2);
    expect(summary.activeDays).toBe(7);
  });

  it("لا يحسب عادةً مجمّدة ولا يكرر السجل المكرر لليوم نفسه", () => {
    const week = weeklyDates(asOf);
    const summary = summarizeWeeklyActivity({
      transactions: [],
      journalEntries: [],
      readingLogs: [],
      prayerLogs: [],
      habits: [habit([week[2], week[2]])],
      frozenHabits: ["habit-1"],
      quranActivity: [],
    }, asOf);

    expect(summary.habitCompletions).toBe(0);
    expect(summary.habitDays).toBe(0);
    expect(summary.activeDays).toBe(0);
  });
});
