import { describe, it, expect } from "vitest";
import {
  pathSteps, stepFill, looseBenefits, sourceLabel, benefitsOf, shelfSeats,
} from "./mihbara";
import type { Benefit, Book, KnowledgeSource } from "./types";

const src = (id: string, kind: KnowledgeSource["kind"], name: string, extra: Partial<KnowledgeSource> = {}): KnowledgeSource =>
  ({ id, kind, name, createdAt: "2026-01-01", ...extra });
const ben = (id: string, extra: Partial<Benefit> = {}): Benefit =>
  ({ id, text: "فائدة", createdAt: "2026-01-01", ...extra });
const book = (id: string, title: string, extra: Partial<Book> = {}): Book =>
  ({ id, title, author: "", totalPages: 100, currentPage: 0, status: "أقرأ", ...extra });

describe("درجاتُ المسار", () => {
  it("خمسُ درجاتٍ دائماً بالترتيب نفسِه", () => {
    const steps = pathSteps(0, [], []);
    expect(steps.map((s) => s.key)).toEqual(["capture", "source", "benefit", "question", "applied"]);
  });

  it("تعدّ المصادرَ والفوائدَ والأسئلةَ الباقية والمطبَّقة", () => {
    const sources = [src("s1", "كتاب", "أ"), src("s2", "مقال", "ب")];
    const benefits = [
      ben("b1", { question: "سؤال؟" }),
      ben("b2", { applied: true }),
      ben("b3", { question: "  ", applied: true }), // فراغٌ ليس سؤالاً
    ];
    const steps = pathSteps(12, sources, benefits);
    expect(steps.find((s) => s.key === "capture")!.value).toBe(12);
    expect(steps.find((s) => s.key === "source")!.value).toBe(2);
    expect(steps.find((s) => s.key === "benefit")!.value).toBe(3);
    expect(steps.find((s) => s.key === "question")!.value).toBe(1);
    expect(steps.find((s) => s.key === "applied")!.value).toBe(2);
  });

  it("الدرجةُ الصفرية تبقى مرئيةً ولا تختفي", () => {
    const steps = pathSteps(10, [], []);
    const zero = steps.find((s) => s.key === "applied")!;
    expect(stepFill(zero, steps)).toBe("6%");
    const top = steps.find((s) => s.key === "capture")!;
    expect(stepFill(top, steps)).toBe("68%");
  });

  it("مسارٌ فارغٌ تماماً لا يقسم على صفر", () => {
    const steps = pathSteps(0, [], []);
    for (const s of steps) expect(stepFill(s, steps)).toBe("6%");
  });
});

describe("الفوائدُ بلا تطبيق", () => {
  it("تُرجع ما لم يُطبَّق وحدَه", () => {
    const list = [ben("a"), ben("b", { applied: true }), ben("c", { applied: false })];
    expect(looseBenefits(list).map((b) => b.id)).toEqual(["a", "c"]);
  });
});

describe("اسمُ المصدر", () => {
  const sources = [src("s1", "درس", "شرح الأربعين")];
  const books = [book("bk1", "صيد الخاطر")];

  it("يقرأ من المصادر ومن الكتب معاً", () => {
    expect(sourceLabel("s1", sources, books)).toBe("درس · شرح الأربعين");
    expect(sourceLabel("bk1", sources, books)).toBe("كتاب · صيد الخاطر");
  });

  it("بلا مصدرٍ أو بمصدرٍ محذوف — لا يرمي ولا يُخفي الفائدة", () => {
    expect(sourceLabel(undefined, sources, books)).toBe("بلا مصدرٍ بعد");
    expect(sourceLabel("ghost", sources, books)).toBe("مصدرٌ محذوف");
  });

  it("عدُّ فوائد المصدر", () => {
    const list = [ben("a", { sourceId: "s1" }), ben("b", { sourceId: "s1" }), ben("c")];
    expect(benefitsOf("s1", list)).toBe(2);
    expect(benefitsOf("s2", list)).toBe(0);
  });
});

describe("مقاعدُ الرفّ", () => {
  const books = [
    book("1", "أ", { status: "أنهيت", finishDate: "2026-02-11" }),
    book("2", "ب", { status: "أنهيت", finishDate: "2026-07-22" }),
    book("3", "ج", { status: "أنهيت", finishDate: "2025-12-01" }), // سنةٌ أخرى
    book("4", "د", { status: "أقرأ" }),
  ];

  it("تعدّ المختوم في سنته وحدَها", () => {
    expect(shelfSeats(books, 2026, 12)).toEqual({ filled: 2, goal: 12 });
    expect(shelfSeats(books, 2025, 12)).toEqual({ filled: 1, goal: 12 });
  });

  it("كتابٌ مختومٌ بلا تاريخِ ختمٍ لا يُحتسب في سنةٍ لا يخصّها", () => {
    const odd = [book("x", "س", { status: "أنهيت" })];
    expect(shelfSeats(odd, 2026, 5).filled).toBe(0);
  });

  it("هدفٌ سالبٌ يُقرأ صفراً", () => {
    expect(shelfSeats(books, 2026, -3).goal).toBe(0);
  });
});
