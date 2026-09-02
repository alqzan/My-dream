import { describe, it, expect } from "vitest";
import { shelfSeats } from "./mihbara";
import type { Book } from "./types";

// اختباراتُ مسار المعرفة (درجاتُه · الفوائدُ بلا تطبيق · اسمُ المصدر) حُذفت مع
// دوالِّها بعد قرار حذف الباب؛ تاريخُها في `git`.

const book = (id: string, title: string, extra: Partial<Book> = {}): Book =>
  ({ id, title, author: "", totalPages: 100, currentPage: 0, status: "أقرأ", ...extra });

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
