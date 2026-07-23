import { describe, it, expect } from "vitest";
import {
  nextInterval, foldInterval, MASTERY_LADDER,
  pageSchedules, duePages, dueQueue, todaySession,
} from "./schedule";
import { pageRange } from "./meta";
import type { HifzState, HifzSession, HifzReviewLog, HifzRating } from "../types";

function hz(o: Partial<HifzState> = {}): HifzState {
  return { plan: { startId: 1, unit: "page", amount: 1, createdAt: "2026-01-01" }, frontierId: 0, sessions: [], reviews: [], reviewCursorId: 0, mistakes: [], ...o };
}
let n = 0;
const sess = (fromId: number, toId: number, date: string, rating?: HifzRating): HifzSession =>
  ({ id: `s${n++}`, fromId, toId, date, rating });
const rev = (fromId: number, toId: number, date: string, rating?: HifzRating): HifzReviewLog =>
  ({ id: `r${n++}`, fromId, toId, date, rating });

describe("nextInterval — due per rating", () => {
  it("rating 1 (needs mastery) → tomorrow (1 day) regardless of history", () => {
    expect(nextInterval(0, 1)).toBe(1);
    expect(nextInterval(60, 1)).toBe(1); // even a long-mastered page resets on error
  });
  it("rating 2 (good) → 3 days", () => {
    expect(nextInterval(0, 2)).toBe(3);
    expect(nextInterval(30, 2)).toBe(3);
  });
  it("rating 3 (mastered) climbs the ladder 7 → 14 → 30 → 60, then caps", () => {
    expect(nextInterval(0, 3)).toBe(7); // first mastery
    expect(nextInterval(7, 3)).toBe(14);
    expect(nextInterval(14, 3)).toBe(30);
    expect(nextInterval(30, 3)).toBe(60);
    expect(nextInterval(60, 3)).toBe(60); // caps at the top
  });
  it("first mastery after a non-ladder interval starts at 7", () => {
    expect(nextInterval(3, 3)).toBe(7); // was 'good' (3d) → now mastered
    expect(nextInterval(1, 3)).toBe(7); // was 'needs' (1d) → now mastered
  });
});

describe("foldInterval — the ladder over a rating history", () => {
  it("progresses 1/3/7/14/30/60 across consecutive mastery", () => {
    expect(foldInterval([3, 3, 3, 3])).toBe(60);
    expect([...MASTERY_LADDER]).toEqual([7, 14, 30, 60]);
  });
  it("an error resets the mastery ladder to a short interval", () => {
    expect(foldInterval([3, 3, 1])).toBe(1); // error → tomorrow
    expect(foldInterval([3, 3, 1, 3])).toBe(7); // then mastery restarts at 7
  });
  it("good then mastered: 3 → 7", () => {
    expect(foldInterval([2, 3])).toBe(7);
  });
});

describe("pageSchedules — per-page due dates derived from history", () => {
  it("a never-reviewed memorized page is due for its first review", () => {
    // memorized page 1 via an unrated session; no rating yet.
    const p1 = pageRange(1);
    const s = hz({ frontierId: p1.end, sessions: [sess(1, p1.end, "2026-01-01")] });
    const sched = pageSchedules(s, "2026-01-10");
    expect(sched).toHaveLength(1);
    expect(sched[0].due).toBe(true);
    expect(sched[0].intervalDays).toBe(0);
    expect(sched[0].lastReviewed).toBeNull();
  });

  it("a page mastered today is NOT due until 7 days pass", () => {
    const p1 = pageRange(1);
    const s = hz({ frontierId: p1.end, sessions: [sess(1, p1.end, "2026-01-01", 3)] });
    expect(pageSchedules(s, "2026-01-05")[0].due).toBe(false); // 4 days < 7
    expect(pageSchedules(s, "2026-01-08")[0].due).toBe(true); // 7 days → due
    expect(pageSchedules(s, "2026-01-08")[0].dueDate).toBe("2026-01-08");
  });

  it("counts lapses (rating-1 events) across a page's history", () => {
    const p1 = pageRange(1);
    const s = hz({
      frontierId: p1.end,
      sessions: [sess(1, p1.end, "2026-01-01", 3)],
      reviews: [rev(1, p1.end, "2026-01-08", 1), rev(1, p1.end, "2026-01-09", 1)],
    });
    expect(pageSchedules(s, "2026-01-20")[0].lapses).toBe(2);
  });

  it("overdue days grow with time past the due date", () => {
    const p1 = pageRange(1);
    const s = hz({ frontierId: p1.end, sessions: [sess(1, p1.end, "2026-01-01", 2)] }); // good → due 01-04
    const sched = pageSchedules(s, "2026-01-10")[0];
    expect(sched.overdueDays).toBe(6); // 01-04 → 01-10
    expect(sched.due).toBe(true);
  });
});

describe("duePages / dueQueue — prioritization and daily cap", () => {
  it("most-overdue pages come first", () => {
    // page 1 mastered long ago (very overdue), page 2 good recently (less overdue)
    const p1 = pageRange(1), p2 = pageRange(2);
    const s = hz({
      frontierId: p2.end,
      sessions: [sess(p1.start, p1.end, "2026-01-01", 2), sess(p2.start, p2.end, "2026-02-01", 2)],
    });
    const due = duePages(s, "2026-03-01");
    expect(due[0].page).toBe(1); // 2026-01-04 due → most overdue
    expect(due.map((d) => d.page)).toContain(2);
  });

  it("dueQueue caps to the daily goal and reports the hidden overflow", () => {
    // 5 memorized pages, none reviewed → all due; cap at 2.
    const p5 = pageRange(5);
    const s = hz({ frontierId: p5.end, sessions: [sess(1, p5.end, "2026-01-01")] });
    const q = dueQueue(s, "2026-01-10", 2);
    expect(q.total).toBe(5);
    expect(q.pages).toHaveLength(2);
    expect(q.hidden).toBe(3);
  });

  it("due portions never exceed the frontier", () => {
    const p3 = pageRange(3);
    const s = hz({ frontierId: p3.start + 1, sessions: [sess(1, p3.start + 1, "2026-01-01")] });
    for (const d of duePages(s, "2026-01-10")) {
      expect(d.portion.toId).toBeLessThanOrEqual(s.frontierId);
    }
  });
});

describe("todaySession — the unified 'today' aggregate", () => {
  it("summarizes new memorization, recent band, due count, and open mistakes", () => {
    const p2 = pageRange(2);
    const s = hz({
      frontierId: p2.end,
      sessions: [sess(1, p2.end, "2026-01-01")],
      mistakes: [{ id: "m1", ayahId: 3, wordIndex: null, hits: ["2026-01-01"], resolved: false, updatedAt: "2026-01-01" }],
    });
    const t = todaySession(s, "2026-01-10", 7);
    expect(t.newPortion).not.toBeNull(); // there is still Quran ahead to memorize
    expect(t.due.total).toBeGreaterThan(0); // never-reviewed pages are due
    expect(t.openMistakes).toBe(1);
    expect(t.estMinutes).toBeGreaterThan(0);
  });

  it("with no plan there is nothing due", () => {
    const s = hz({ plan: null, frontierId: 0 });
    const t = todaySession(s, "2026-01-10");
    expect(t.due.total).toBe(0);
    expect(t.newPortion).toBeNull();
  });
});
