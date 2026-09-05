import { describe, it, expect } from "vitest";
import {
  nextInterval, foldMemory, nextEase, pageRisk, MASTERY_LADDER, EASE_RANGE,
  reviewConsistency, adaptiveReviewCap,
  pageSchedules, duePages, dueQueue, nextDueDays, quranWeeklyReport,
} from "./schedule";
import { INTENSITY } from "./intensity";
import { pageRange } from "./meta";
import type { HifzState, HifzSession, HifzReviewLog, HifzRating } from "../types";

function hz(o: Partial<HifzState> = {}): HifzState {
  return { plan: { startId: 1, unit: "page", amount: 1, createdAt: "2026-01-01" }, frontierId: 0, sessions: [], reviews: [], mistakes: [], ...o };
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

describe("nextInterval — معامل الرسوخ ومكافأة التأخّر", () => {
  it("المعامل يشدّ المدة على المتعثّر ويرخيها على الراسخ", () => {
    expect(nextInterval(0, 3, INTENSITY.balanced, { ease: 0.6 })).toBe(4); // 7 × 0.6
    expect(nextInterval(0, 3, INTENSITY.balanced, { ease: 1.4 })).toBe(10); // 7 × 1.4
    expect(nextInterval(0, 2, INTENSITY.balanced, { ease: 0.6 })).toBe(2); // 3 × 0.6
  });

  it("التعثّر لا يُضرب بالمعامل — العودة بعد الخطأ قصيرةٌ للجميع", () => {
    expect(nextInterval(60, 1, INTENSITY.balanced, { ease: 1.4 })).toBe(1);
    expect(nextInterval(60, 1, INTENSITY.balanced, { ease: 0.6 })).toBe(1);
  });

  it("درجةُ السلّم تُعرَف ولو كانت المدة السابقة مضروبةً بمعامل", () => {
    // 16 يوماً بمعامل 1.12 = درجةُ الأربعةَ عشر → التالية ثلاثون (×1.12)
    expect(nextInterval(16, 3, INTENSITY.balanced, { ease: 1.12 })).toBe(34);
  });

  it("مكافأة التأخّر: صمودٌ أطولُ من المجدول يُمدّد لا يُهدَر", () => {
    expect(nextInterval(7, 3)).toBe(14); // في موعده
    expect(nextInterval(7, 3, INTENSITY.balanced, { elapsedDays: 40 })).toBe(28); // بحدّ ضِعف الدرجة
    expect(nextInterval(7, 3, INTENSITY.balanced, { elapsedDays: 20 })).toBe(20); // ما انقضى فعلاً
  });

  it("لا تتجاوز مدةٌ سقفَ السلّم مضروباً في أقصى الرسوخ", () => {
    const ceiling = Math.round(MASTERY_LADDER[MASTERY_LADDER.length - 1] * EASE_RANGE.max);
    expect(nextInterval(60, 3, INTENSITY.balanced, { ease: 1.4, elapsedDays: 400 })).toBe(ceiling);
  });
});

describe("nextEase — المعامل يُشتقّ من سجلّ الوجه", () => {
  it("التعثّر يخصم والإتقان يزيد، ضمن الحدّين", () => {
    expect(nextEase(1, 1)).toBe(0.82);
    expect(nextEase(1, 2)).toBe(0.95);
    expect(nextEase(1, 3)).toBe(1.06);
    expect(nextEase(EASE_RANGE.min, 1)).toBe(EASE_RANGE.min); // لا ينزل عن الحدّ
    expect(nextEase(EASE_RANGE.max, 3)).toBe(EASE_RANGE.max); // ولا يعلو عليه
  });
});

describe("foldMemory — طيّ سجلّ الوجه إلى مدّةٍ ومعامل", () => {
  const on = (rating: HifzRating, date: string) => ({ rating, date });

  it("السلّم الأساس كما هو موثّق حين يكون المعامل محايداً", () => {
    expect([...MASTERY_LADDER]).toEqual([7, 14, 30, 60]);
    expect(foldMemory([on(3, "2026-01-01")]).intervalDays).toBe(7);
  });

  it("الإتقان المتّصل يتباعد أبعدَ من سقف السلّم القديم", () => {
    const m = foldMemory([
      on(3, "2026-01-01"), on(3, "2026-01-08"), on(3, "2026-01-20"), on(3, "2026-02-10"),
    ]);
    expect(m.intervalDays).toBe(76); // كان يقف عند 60 لكلّ وجهٍ سواء
    expect(m.ease).toBe(1.26);
    expect(m.lapses).toBe(0);
  });

  it("الخطأ يُعيد إلى الغد ويخصم من المعامل", () => {
    const m = foldMemory([on(3, "2026-01-01"), on(3, "2026-01-08"), on(1, "2026-01-20")]);
    expect(m.intervalDays).toBe(1);
    expect(m.ease).toBeLessThan(1);
    expect(m.lapses).toBe(1);
  });

  it("وجهٌ كثير التعثّر يعود أسرعَ من وجهٍ نظيفٍ على الدرجة نفسها", () => {
    const shaky = foldMemory([
      on(1, "2026-01-01"), on(1, "2026-01-02"), on(1, "2026-01-03"), on(3, "2026-01-04"),
    ]);
    const clean = foldMemory([on(3, "2026-01-04")]);
    expect(shaky.intervalDays).toBeLessThan(clean.intervalDays);
    expect(shaky.ease).toBeLessThan(clean.ease);
  });
});

describe("pageRisk — الأخطرُ لا الأقدمُ فحسب", () => {
  it("التأخّر نسبةٌ إلى المدة لا عددَ أيام", () => {
    const short = pageRisk({ intervalDays: 7, overdueDays: 3, lapses: 0, mistakes: 0, lastReviewed: "2026-01-01" });
    const long = pageRisk({ intervalDays: 60, overdueDays: 3, lapses: 0, mistakes: 0, lastReviewed: "2026-01-01" });
    expect(short).toBeGreaterThan(long);
  });
  it("التعثّر ومواضع الخطأ المفتوحة تثقل الخطر", () => {
    const bare = pageRisk({ intervalDays: 7, overdueDays: 1, lapses: 0, mistakes: 0, lastReviewed: "2026-01-01" });
    const heavy = pageRisk({ intervalDays: 7, overdueDays: 1, lapses: 3, mistakes: 2, lastReviewed: "2026-01-01" });
    expect(heavy).toBeGreaterThan(bare);
  });
  it("ما لم يُراجَع قطّ له وزنٌ ثابت", () => {
    expect(pageRisk({ intervalDays: 0, overdueDays: 0, lapses: 0, mistakes: 0, lastReviewed: null })).toBe(2.5);
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

  it("does not let duplicate same-day reviews inflate the interval", () => {
    const p1 = pageRange(1);
    const s = hz({
      frontierId: p1.end,
      sessions: [sess(1, p1.end, "2026-01-01", 3)],
      reviews: [
        { ...rev(1, p1.end, "2026-01-08", 3), at: 100 },
        { ...rev(1, p1.end, "2026-01-08", 1), at: 200 },
      ],
    });
    const schedule = pageSchedules(s, "2026-01-09")[0];
    expect(schedule.lapses).toBe(1);
    expect(schedule.intervalDays).toBe(1);
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

describe("intensity drives the schedule", () => {
  it("the ladder and the short intervals follow the chosen intensity", () => {
    expect(nextInterval(0, 3, INTENSITY.light)).toBe(10);
    expect(nextInterval(10, 3, INTENSITY.light)).toBe(21);
    expect(nextInterval(0, 2, INTENSITY.light)).toBe(5);
    expect(nextInterval(60, 1, INTENSITY.light)).toBe(2);

    expect(nextInterval(0, 3, INTENSITY.intense)).toBe(5);
    expect(nextInterval(0, 2, INTENSITY.intense)).toBe(2);
  });

  it("a page mastered under 'light' stays undue longer than under 'balanced'", () => {
    const p1 = pageRange(1);
    const base = { frontierId: p1.end, sessions: [sess(1, p1.end, "2026-01-01", 3)] };
    const balanced = hz(base);
    const light = hz({ ...base, plan: { startId: 1, unit: "page", amount: 1, createdAt: "2026-01-01", intensity: "light" } });
    expect(pageSchedules(balanced, "2026-01-08")[0].due).toBe(true); // 7 يوماً
    expect(pageSchedules(light, "2026-01-08")[0].due).toBe(false); // 10 أيام (× معامل الرسوخ)
    expect(pageSchedules(light, "2026-01-12")[0].due).toBe(true);
  });

  it("سقفُ الشدّة هو الأساس، وشدّةٌ أعلى تعني سقفاً أعلى", () => {
    const p20 = pageRange(20);
    const base = { frontierId: p20.end, sessions: [sess(1, p20.end, "2026-01-01")] };
    const balanced = dueQueue(hz(base), "2026-01-10").cap;
    const intense = dueQueue(
      hz({ ...base, plan: { startId: 1, unit: "page", amount: 1, createdAt: "2026-01-01", intensity: "intense" } }),
      "2026-01-10",
    ).cap;
    expect(intense).toBeGreaterThan(balanced);
    expect(balanced).toBeLessThan(INTENSITY.balanced.dailyReviewPages); // مواظبةٌ ضعيفة ⇒ حملٌ ألطف
  });
});

describe("السقفُ اليوميّ يتكيّف مع المواظبة", () => {
  // أيام متتابعة من النشاط تنتهي باليوم المذكور (مراجعاتٌ بلا تقييم: نشاطٌ لا
  // يغيّر جدول الأوجه، فيبقى المقيس هو المواظبة وحدها).
  const daily = (days: number, endStr: string) =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date(`${endStr}T00:00:00`);
      d.setDate(d.getDate() - i);
      return rev(1, 5, d.toISOString().slice(0, 10));
    });

  it("المواظبة نسبةُ أيام النشاط في آخر أسبوعين", () => {
    const p5 = pageRange(5);
    const idle = hz({ frontierId: p5.end, sessions: [sess(1, p5.end, "2026-01-01")] });
    expect(reviewConsistency(idle, "2026-03-01")).toBe(0); // خارج النافذة
    const steady = hz({ frontierId: p5.end, sessions: [sess(1, p5.end, "2026-01-01")], reviews: daily(14, "2026-01-14") });
    expect(reviewConsistency(steady, "2026-01-14")).toBe(1);
  });

  it("المنقطعُ يعود إلى حملٍ ألطف والمواظبُ يُرفع سقفُه", () => {
    const p20 = pageRange(20);
    const back = hz({ frontierId: p20.end, sessions: [sess(1, p20.end, "2026-01-01")] });
    const steady = hz({
      frontierId: p20.end,
      sessions: [sess(1, p20.end, "2026-01-01")],
      reviews: daily(14, "2026-01-14"),
    });
    expect(adaptiveReviewCap(back, "2026-03-01")).toBe(5); // 7 × 0.7
    expect(adaptiveReviewCap(steady, "2026-01-14")).toBe(11); // 7 × 1.5
    expect(dueQueue(steady, "2026-01-14").pages.length).toBe(11);
  });

  it("لا ينزل السقف عن وجهين مهما ضعفت المواظبة", () => {
    const p20 = pageRange(20);
    const light = hz({
      frontierId: p20.end,
      sessions: [sess(1, p20.end, "2026-01-01")],
      plan: { startId: 1, unit: "page", amount: 1, createdAt: "2026-01-01", intensity: "light" },
    });
    expect(adaptiveReviewCap(light, "2026-03-01")).toBeGreaterThanOrEqual(2);
  });
});

describe("duePages — skipping the recent band", () => {
  it("pages covered by the recent-review band drop out of the due queue", () => {
    // 8 أوجه محفوظة بلا مراجعة ⇒ كلّها مستحقّة. نافذة «متوازن» = آخر 5 أوجه.
    const p8 = pageRange(8);
    const s = hz({ frontierId: p8.end, sessions: [sess(1, p8.end, "2026-01-01")] });
    const all = duePages(s, "2026-01-10").map((d) => d.page);
    const trimmed = duePages(s, "2026-01-10", true).map((d) => d.page);
    expect(all).toEqual(expect.arrayContaining([4, 5, 6, 7, 8]));
    expect(trimmed).toEqual([1, 2, 3]); // 4..8 تغطّيها المراجعة القريبة
  });
});

describe("nextDueDays — previewing the effect of a rating", () => {
  it("shows the interval a rating would produce for the portion's page", () => {
    const p1 = pageRange(1);
    const s = hz({ frontierId: p1.end, sessions: [sess(1, p1.end, "2026-01-01", 3)] }); // interval 7
    const portion = { fromId: p1.start, toId: p1.end };
    // يصعد السلّم (14) ومعامل الرسوخ يمدّه — والمعروض هو ما سيُسجَّل بالضبط.
    expect(nextDueDays(s, portion, 3, "2026-01-10")).toBe(16);
    expect(nextDueDays(s, portion, 1, "2026-01-10")).toBe(1); // الخطأ يُعيده لغد
  });

  it("مراجعةٌ متأخّرةٌ أُتقنت تُعطي مدةً أطول من مراجعةٍ في موعدها", () => {
    const p1 = pageRange(1);
    const s = hz({ frontierId: p1.end, sessions: [sess(1, p1.end, "2026-01-01", 3)] });
    const portion = { fromId: p1.start, toId: p1.end };
    const onTime = nextDueDays(s, portion, 3, "2026-01-08");
    const late = nextDueDays(s, portion, 3, "2026-02-20");
    expect(late).toBeGreaterThan(onTime);
  });
});

describe("quranWeeklyReport — last-7-days Quran tally", () => {
  it("counts sessions and reviews within the week only", () => {
    const p2 = pageRange(2);
    const s = hz({
      frontierId: p2.end,
      sessions: [sess(1, 20, "2026-01-28", 3), sess(21, 40, "2026-01-20", 3)], // one in week, one out
      reviews: [rev(1, p2.end, "2026-01-29", 2)],
    });
    const r = quranWeeklyReport(s, "2026-02-01");
    expect(r.sessions).toBe(1); // only 2026-01-28 is within 7 days of 2026-02-01
    expect(r.reviewedCount).toBe(1);
    expect(r.memorizedAyat).toBe(20);
    expect(r.hasActivity).toBe(true);
  });

  it("reports no activity for an empty week", () => {
    const p2 = pageRange(2);
    const s = hz({ frontierId: p2.end, sessions: [sess(1, 20, "2025-12-01", 3)] });
    const r = quranWeeklyReport(s, "2026-02-01");
    expect(r.hasActivity).toBe(false);
    expect(r.sessions).toBe(0);
  });

  it("surfaces the most-repeated open mistake", () => {
    const p2 = pageRange(2);
    const s = hz({
      frontierId: p2.end,
      mistakes: [
        { id: "m1", ayahId: 5, wordIndex: null, hits: ["2026-01-30", "2026-01-31"], resolved: false, updatedAt: "2026-01-31" },
        { id: "m2", ayahId: 9, wordIndex: null, hits: ["2026-01-30"], resolved: false, updatedAt: "2026-01-30" },
      ],
    });
    const r = quranWeeklyReport(s, "2026-02-01");
    expect(r.topMistake?.ayahId).toBe(5);
    expect(r.topMistake?.hits).toBe(2);
  });
});
