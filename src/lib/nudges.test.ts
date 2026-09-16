import { describe, it, expect } from "vitest";
import {
  buildNudge, distanceOf, momentOf, pick, quranPlace, readRituals, seedOf, spanLabel,
  EVENING_HOUR, MAX_OPEN_LINES, type NudgeInput,
} from "./nudges";
import { EMPTY_HIFZ, EMPTY_KHATMA } from "./types";

const base: NudgeInput = {
  journalEntries: [],
  readingLogs: [],
  habits: [],
  frozenHabits: [],
  quranWird: [],
  quranHifz: EMPTY_HIFZ,
  quranReflections: [],
  quranKhatma: EMPTY_KHATMA,
};

const TODAY = "2026-09-16";

describe("لحظتا التذكير", () => {
  it("قبل السادسة افتتاحٌ وبعدها حصاد", () => {
    expect(momentOf(6)).toBe("morning");
    expect(momentOf(EVENING_HOUR - 1)).toBe("morning");
    expect(momentOf(EVENING_HOUR)).toBe("evening");
    expect(momentOf(23)).toBe("evening");
  });

  it("ساعةٌ مشوّهة لا تُسقط الحساب", () => {
    expect(momentOf(Number.NaN)).toBe("morning");
  });
});

describe("مدّةُ الانقطاع بلسانٍ عربيّ", () => {
  it("تتدرّج من «أمس» إلى الأشهر", () => {
    expect(spanLabel(0)).toBe("اليوم");
    expect(spanLabel(1)).toBe("أمس");
    expect(spanLabel(5)).toContain("قبل");
    expect(spanLabel(21)).toContain("أسابيع");
    expect(spanLabel(58)).toContain("أسابيع"); // دون الستين تبقى أسابيع
    expect(spanLabel(60)).toContain("شهرين");
  });

  it("لا رقمَ سالبٌ ولا مشوّه", () => {
    expect(spanLabel(-4)).toBe("اليوم");
    expect(spanLabel(Number.NaN)).toBe("اليوم");
  });
});

describe("الانتقاءُ المتبدّل", () => {
  it("يثبت داخل اليوم ويتبدّل بتبدّله", () => {
    const pool = ["أ", "ب", "ج", "د", "هـ"] as const;
    const a1 = pick(pool, seedOf("2026-09-16", "quran"));
    const a2 = pick(pool, seedOf("2026-09-16", "quran"));
    expect(a1).toBe(a2); // لا يتراقص بين رسمتين

    // على مدى أسبوعين يجب أن يظهر أكثر من صياغة — وإلّا فالبذرةُ لا تعمل.
    const seen = new Set<string>();
    for (let d = 1; d <= 14; d++) {
      seen.add(pick(pool, seedOf(`2026-09-${String(d).padStart(2, "0")}`, "quran")));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("سطران في اليوم نفسه لا يلزم أن يتّفقا على الرقم نفسه", () => {
    expect(seedOf("2026-09-16", "quran")).not.toBe(seedOf("2026-09-16", "journal"));
  });
});

describe("قراءةُ الحالة", () => {
  it("«لم يبدأ قطّ» غيرُ «انقطع» — والفرقُ يغيّر الصياغة", () => {
    const rituals = readRituals(base, TODAY);
    const quran = rituals.find((r) => r.key === "quran")!;
    expect(quran.lastDate).toBeNull();
    expect(quran.gap).toBeNull();
    expect(distanceOf(quran)).toBe("fresh");
  });

  it("الفجوةُ تُقاس بالأيام من آخر أثر", () => {
    const input: NudgeInput = { ...base, quranWird: ["2026-09-10"] };
    const quran = readRituals(input, TODAY).find((r) => r.key === "quran")!;
    expect(quran.gap).toBe(6);
    expect(distanceOf(quran)).toBe("away");
  });

  it("تاريخٌ قادمٌ من جهازٍ ساعتُه أمامنا لا يُخفي انقطاعاً قائماً", () => {
    const input: NudgeInput = { ...base, quranWird: ["2026-09-10", "2026-12-01"] };
    const quran = readRituals(input, TODAY).find((r) => r.key === "quran")!;
    expect(quran.lastDate).toBe("2026-09-10");
    expect(quran.doneToday).toBe(false);
  });

  it("الطقسُ المجمّد يخرج من التذكير", () => {
    const input: NudgeInput = { ...base, frozenHabits: ["core:journal"] };
    const journal = readRituals(input, TODAY).find((r) => r.key === "journal")!;
    expect(journal.frozen).toBe(true);
    const nudge = buildNudge(input, { todayStr: TODAY, hour: 8 })!;
    expect(nudge.lines.some((l) => l.key === "journal")).toBe(false);
  });

  it("العاداتُ لا تُعدّ منجزةً إلّا إذا سُجّلت كلُّها", () => {
    const input: NudgeInput = {
      ...base,
      habits: [
        { id: "h1", name: "مشي", icon: "🚶", color: "#000", logs: [TODAY] },
        { id: "h2", name: "ماء", icon: "💧", color: "#000", logs: [] },
      ],
    };
    const habits = readRituals(input, TODAY).find((r) => r.key === "habits")!;
    expect(habits.doneToday).toBe(false);
  });
});

describe("موضعُك في المصحف", () => {
  it("الصفحةُ تغلب الجزء حين تُسجَّل", () => {
    expect(quranPlace({ quranKhatma: { ...EMPTY_KHATMA, juz: 7, page: 141 }, quranHifz: EMPTY_HIFZ }))
      .toContain("141");
  });

  it("بلا ختمةٍ ولا حفظٍ لا يُخترع موضع", () => {
    expect(quranPlace({ quranKhatma: EMPTY_KHATMA, quranHifz: EMPTY_HIFZ })).toBe("");
  });

  it("جبهةُ الحفظ تُقرأ باسم السورة لا برقمها", () => {
    const place = quranPlace({ quranKhatma: EMPTY_KHATMA, quranHifz: { ...EMPTY_HIFZ, frontierId: 5 } });
    expect(place).toContain("الفاتحة");
  });
});

describe("افتتاحُ اليوم", () => {
  it("الأبعدُ أوّلاً — ما نُسي شهراً قبل ما نُسي ساعة", () => {
    const input: NudgeInput = {
      ...base,
      quranWird: ["2026-07-10"], // قرابة شهرين
      journalEntries: [{ id: "j1", date: "2026-09-15", content: "أمس" }],
      readingLogs: [{ id: "r1", date: "2026-09-14", bookId: "b1", pagesRead: 10 }],
    };
    const nudge = buildNudge(input, { todayStr: TODAY, hour: 7 })!;
    expect(nudge.moment).toBe("morning");
    expect(nudge.lines[0].key).toBe("quran");
  });

  it("بابٌ لم يُفتح قطّ يأتي بعد خيطٍ انقطع، لا قبله", () => {
    const input: NudgeInput = {
      ...base,
      quranWird: ["2026-09-12"], // انقطاعُ أربعة أيام
      // المذكرات والقراءة والعادات: لم تبدأ قطّ
    };
    const nudge = buildNudge(input, { todayStr: TODAY, hour: 7 })!;
    expect(nudge.lines[0].key).toBe("quran");
  });

  it("لا يتجاوز ثلاثة أسطر", () => {
    const nudge = buildNudge(base, { todayStr: TODAY, hour: 7 })!;
    expect(nudge.lines.length).toBeLessThanOrEqual(MAX_OPEN_LINES);
  });

  it("سطرُ القرآن يحمل موضعَك معه — تذكيرٌ بلا موضعٍ تذكيرٌ فارغ", () => {
    const input: NudgeInput = {
      ...base,
      quranWird: ["2026-07-10"],
      quranKhatma: { ...EMPTY_KHATMA, juz: 7, page: 141 },
    };
    const nudge = buildNudge(input, { todayStr: TODAY, hour: 7 })!;
    const quran = nudge.lines.find((l) => l.key === "quran")!;
    expect(quran.place).toContain("141");
  });

  it("حين لا يبقى بابٌ مفتوح لا يُخترع عتب", () => {
    const input: NudgeInput = {
      ...base,
      quranWird: [TODAY],
      journalEntries: [{ id: "j1", date: TODAY, content: "اليوم" }],
      readingLogs: [{ id: "r1", date: TODAY, bookId: "b1", pagesRead: 10 }],
    };
    const nudge = buildNudge(input, { todayStr: TODAY, hour: 9 })!;
    expect(nudge.lines.every((l) => l.done)).toBe(true);
  });
});

describe("طيُّ اليوم", () => {
  it("يذكر ما تمّ كلَّه، ولا يذكر من الباقي إلا واحداً — لا جرد", () => {
    const input: NudgeInput = {
      ...base,
      quranWird: [TODAY],
      journalEntries: [{ id: "j1", date: "2026-09-01", content: "قديمة" }],
      readingLogs: [{ id: "r1", date: "2026-09-14", bookId: "b1", pagesRead: 10 }],
      habits: [{ id: "h1", name: "مشي", icon: "🚶", color: "#000", logs: [] }],
    };
    const nudge = buildNudge(input, { todayStr: TODAY, hour: 21 })!;
    expect(nudge.moment).toBe("evening");
    expect(nudge.lines.filter((l) => !l.done && l.key !== "prayers").length).toBe(1);
    expect(nudge.lines.some((l) => l.key === "quran" && l.done)).toBe(true);
  });

  it("الصلواتُ خبرٌ في الحصاد، وصفرُها لا يُكتب «صفر»", () => {
    const zero = buildNudge(base, { todayStr: TODAY, hour: 20, extras: { prayed: 0 } })!;
    const line = zero.lines.find((l) => l.key === "prayers")!;
    expect(line.done).toBe(false);
    expect(line.text).not.toMatch(/0|٠/);

    const full = buildNudge(base, { todayStr: TODAY, hour: 20, extras: { prayed: 5 } })!;
    expect(full.lines.find((l) => l.key === "prayers")!.done).toBe(true);
  });

  it("المالُ ليس في التذكير — له بطاقتُه", () => {
    const nudge = buildNudge(base, { todayStr: TODAY, hour: 20, extras: { prayed: 3 } })!;
    expect(nudge.lines.some((l) => l.key === "money")).toBe(false);
  });
});

describe("الصياغةُ لا تلوم", () => {
  const BLAME = ["فاتك", "قصّرت", "قصرت", "ضيّعت", "أهملت", "تأخرت", "خسرت"];
  it("لا كلمةَ عتبٍ في أيّ صياغةٍ على مدى شهرين من الحالات", () => {
    for (let gapDays = 0; gapDays < 70; gapDays += 1) {
      const last = new Date(2026, 8, 16 - gapDays);
      const key = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
      for (const hour of [7, 20]) {
        const nudge = buildNudge({ ...base, quranWird: [key] }, { todayStr: TODAY, hour });
        for (const line of nudge?.lines ?? []) {
          for (const word of BLAME) expect(line.text).not.toContain(word);
        }
      }
    }
  });
});
