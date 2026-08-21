import { describe, it, expect } from "vitest";
import { mergeDayEntries, duplicateDays, chronological, sectionHeading } from "./mergeDay";
import { entryPhotos, entryAudios } from "./utils";
import type { JournalEntry } from "./types";

const D = "2025-08-10";
function e(p: Partial<JournalEntry> & { id: string }): JournalEntry {
  return { date: D, content: "", ...p };
}

describe("mergeDayEntries — لا يدمج ما لا يصحّ دمجه", () => {
  it("مذكرةٌ واحدة أو صفر ⇒ لا دمج", () => {
    expect(mergeDayEntries([])).toBeNull();
    expect(mergeDayEntries([e({ id: "a" })])).toBeNull();
  });

  it("يومان مختلفان ⇒ لا دمج (الدمج عبر يومين ضياعُ تاريخ)", () => {
    const merged = mergeDayEntries([e({ id: "a" }), e({ id: "b", date: "2025-08-11" })]);
    expect(merged).toBeNull();
  });
});

describe("mergeDayEntries — بلا فقد", () => {
  const entries = [
    e({ id: "noon", time: "12:05", content: "نصُّ الظهر", tags: ["عمل"], photos: ["p2"] }),
    e({ id: "morning", time: "07:10", title: "صباح", content: "نصُّ الصباح", tags: ["مشي"], photos: ["p1"], mood: 4 }),
    e({ id: "night", time: "21:40", content: "نصُّ الليل", tags: ["عمل", "قراءة"], audios: ["a1"], mood: 2, starred: true }),
  ];

  it("يحمل معرّف أبكر مذكرات اليوم فلا تنكسر الإشارات إليه", () => {
    expect(mergeDayEntries(entries)!.id).toBe("morning");
  });

  it("يضمّ النصوص بالترتيب الزمنيّ تحت عناوين تحمل الأوقات", () => {
    const { content } = mergeDayEntries(entries)!;
    expect(content).toContain("### 07:10 · صباح");
    expect(content).toContain("### 12:05");
    expect(content).toContain("### 21:40");
    // كلّ نصٍّ حاضرٌ حرفياً، وبترتيب اليوم من أوّله لآخره.
    for (const t of ["نصُّ الصباح", "نصُّ الظهر", "نصُّ الليل"]) expect(content).toContain(t);
    expect(content.indexOf("نصُّ الصباح")).toBeLessThan(content.indexOf("نصُّ الظهر"));
    expect(content.indexOf("نصُّ الظهر")).toBeLessThan(content.indexOf("نصُّ الليل"));
  });

  it("يوحّد الوسوم والوسائط بلا تكرار", () => {
    const m = mergeDayEntries(entries)!;
    expect(m.tags).toEqual(["مشي", "عمل", "قراءة"]);
    expect(entryPhotos(m)).toEqual(["p1", "p2"]);
    expect(entryAudios(m)).toEqual(["a1"]);
  });

  it("يأخذ آخر شعورٍ في اليوم، ويُنجّم المدموجة إن نُجّمت إحداها", () => {
    const m = mergeDayEntries(entries)!;
    expect(m.mood).toBe(2); // شعور 21:40 لا شعور 07:10
    expect(m.starred).toBe(true);
  });

  it("يُسقط `photo`/`audio` المفردين القديمين فلا تتضاعف الأولى", () => {
    const m = mergeDayEntries([
      e({ id: "a", time: "08:00", photo: "p1", audio: "a1" }),
      e({ id: "b", time: "09:00", photo: "p2" }),
    ])!;
    expect(m.photo).toBeUndefined();
    expect(m.audio).toBeUndefined();
    expect(entryPhotos(m)).toEqual(["p1", "p2"]);
    expect(entryAudios(m)).toEqual(["a1"]);
  });

  it("يضمّ مراجع الهاش أيضاً فلا تيتم وسائط الجهاز الآخر", () => {
    const m = mergeDayEntries([
      e({ id: "a", time: "08:00", photoRefs: ["h1"], audioRefs: ["s1"] }),
      e({ id: "b", time: "09:00", photoRefs: ["h2", "h1"] }),
    ])!;
    expect(m.photoRefs).toEqual(["h1", "h2"]);
    expect(m.audioRefs).toEqual(["s1"]);
  });

  it("يحفظ تحرير الصور لكل مصدر عند دمج يومين من الكتابة", () => {
    const m = mergeDayEntries([
      e({ id: "a", time: "08:00", photoRefs: ["h1"], photoEdits: { "photos:h1": { rotation: 90 } } }),
      e({ id: "b", time: "09:00", photoRefs: ["h2"], photoEdits: { "photos:h2": { scale: 1.4 } } }),
    ])!;
    expect(m.photoEdits).toEqual({
      "photos:h1": { rotation: 90 },
      "photos:h2": { scale: 1.4 },
    });
  });
});

describe("mergeDayEntries — بلا غموض", () => {
  it("يسجّل كل مصدرٍ ببصمته (الوقت والعنوان وطول النصّ وعدد الوسائط)", () => {
    const m = mergeDayEntries(
      [
        e({ id: "morning", time: "07:10", title: "صباح", content: "أربعة", photos: ["p1", "p2"] }),
        e({ id: "night", time: "21:40", content: "ليل", audios: ["a1"] }),
      ],
      1234
    )!;
    expect(m.mergedFrom).toEqual([
      { id: "morning", time: "07:10", title: "صباح", chars: 5, photos: 2, audios: 0, dayOneUUID: undefined, mergedAt: 1234 },
      { id: "night", time: "21:40", title: undefined, chars: 3, photos: 0, audios: 1, dayOneUUID: undefined, mergedAt: 1234 },
    ]);
  });

  it("مجموعُ الأطوال المسجّلة يطابق ما دخل فعلاً — لا اقتطاع", () => {
    const sources = [
      e({ id: "a", time: "08:00", content: "أ".repeat(50) }),
      e({ id: "b", time: "09:00", content: "ب".repeat(120) }),
    ];
    const m = mergeDayEntries(sources)!;
    const recorded = m.mergedFrom!.reduce((s, x) => s + x.chars, 0);
    expect(recorded).toBe(170);
    // ونصُّ كلٍّ منهما حاضرٌ بطوله كاملاً داخل المدموجة.
    for (const s of sources) expect(m.content).toContain(s.content);
  });

  it("دمجُ مدموجةٍ يُفرد سجلّاتها ولا يُعشّشها", () => {
    const first = mergeDayEntries([
      e({ id: "a", time: "08:00", content: "أ" }),
      e({ id: "b", time: "09:00", content: "ب" }),
    ])!;
    const second = mergeDayEntries([first, e({ id: "c", time: "10:00", content: "ج" })])!;
    expect(second.mergedFrom!.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(second.content).toContain("أ");
    expect(second.content).toContain("ب");
    expect(second.content).toContain("ج");
  });

  it("يحفظ معرّف Day One لكلّ مصدر فلا يعيده الاستيراد مذكرةً جديدة", () => {
    const m = mergeDayEntries([
      e({ id: "a", time: "08:00", dayOneUUID: "U1" }),
      e({ id: "b", time: "09:00", dayOneUUID: "U2" }),
    ])!;
    expect(m.mergedFrom!.map((s) => s.dayOneUUID)).toEqual(["U1", "U2"]);
  });
});

describe("chronological / sectionHeading", () => {
  it("يرتّب تصاعدياً ويضع ما لا وقت له في الذيل", () => {
    const out = chronological([
      e({ id: "untimed" }),
      e({ id: "late", time: "23:00" }),
      e({ id: "early", time: "06:00" }),
    ]);
    expect(out.map((x) => x.id)).toEqual(["early", "late", "untimed"]);
  });

  it("عنوانُ قسمٍ بلا وقتٍ ولا عنوان يبقى مفهوماً", () => {
    expect(sectionHeading(e({ id: "x" }))).toBe("### بلا وقت");
  });

  it("منتصفُ الليل ليس وقتاً، ورموزُ العنوان تُنظَّف", () => {
    expect(sectionHeading(e({ id: "x", time: "00:00", title: "بسوي \\.\\.\\." })))
      .toBe("### بسوي ...");
    expect(sectionHeading(e({ id: "y", time: "00:00" }))).toBe("### بلا وقت");
  });
});

describe("duplicateDays", () => {
  it("يُرجع أيام التكرار فقط، الأحدث أولاً، ومحتواها مرتّبٌ زمنياً", () => {
    const days = duplicateDays([
      e({ id: "a", date: "2025-08-10", time: "12:00" }),
      e({ id: "b", date: "2025-08-10", time: "07:00" }),
      e({ id: "c", date: "2025-08-09" }),
      e({ id: "d", date: "2025-08-12", time: "09:00" }),
      e({ id: "f", date: "2025-08-12", time: "08:00" }),
    ]);
    expect(days.map((d) => d.date)).toEqual(["2025-08-12", "2025-08-10"]);
    expect(days[1].entries.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("أرشيفٌ بلا تكرار ⇒ لا شيء", () => {
    expect(duplicateDays([e({ id: "a", date: "2025-01-01" })])).toEqual([]);
  });
});
