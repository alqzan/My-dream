import { describe, it, expect } from "vitest";
import { groupJournalByDay } from "./journalTimeline";
import type { JournalEntry } from "./types";

function e(id: string, date: string, time?: string): JournalEntry {
  return { id, date, content: id, time };
}

describe("groupJournalByDay", () => {
  it("يجمّع شهراً ثمّ يوماً بترتيب المصدر", () => {
    const groups = groupJournalByDay([
      e("a", "2025-08-10"),
      e("b", "2025-08-10"),
      e("c", "2025-08-03"),
      e("d", "2025-07-30"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["2025-08", "2025-07"]);
    expect(groups[0].label).toBe("أغسطس 2025");
    expect(groups[0].count).toBe(3);
    expect(groups[0].days.map((d) => d.date)).toEqual(["2025-08-10", "2025-08-03"]);
    expect(groups[0].days[0].entries.map((x) => x.id).sort()).toEqual(["a", "b"]);
    expect(groups[1].count).toBe(1);
  });

  it("يرتّب مذكرات اليوم بالأحدث وقتاً أولاً", () => {
    const [month] = groupJournalByDay([
      e("morning", "2025-08-10", "07:10"),
      e("evening", "2025-08-10", "21:40"),
      e("noon", "2025-08-10", "12:05"),
    ]);
    expect(month.days[0].entries.map((x) => x.id)).toEqual(["evening", "noon", "morning"]);
  });

  it("يضع ما لا وقت له في ذيل اليوم لا في صدره", () => {
    const [month] = groupJournalByDay([
      e("untimed", "2025-08-10"),
      e("timed", "2025-08-10", "06:00"),
    ]);
    expect(month.days[0].entries.map((x) => x.id)).toEqual(["timed", "untimed"]);
  });

  it("لا يخلط يوماً مكرّراً غير متجاور في مجموعةٍ واحدة", () => {
    // المصدر مرتَّبٌ مسبقاً؛ لو وصل غيرَ مرتَّب فالتجميع يحترم ترتيبه كما هو
    // (لا يُعيد ترتيب التواريخ) — فيظهر اليوم مجموعتين، وهذا سلوكٌ مقصود.
    const [month] = groupJournalByDay([
      e("a", "2025-08-10"),
      e("b", "2025-08-09"),
      e("c", "2025-08-10"),
    ]);
    expect(month.days.map((d) => d.date)).toEqual(["2025-08-10", "2025-08-09", "2025-08-10"]);
  });

  it("أرشيفٌ فارغ ⇒ لا مجموعات", () => {
    expect(groupJournalByDay([])).toEqual([]);
  });
});
