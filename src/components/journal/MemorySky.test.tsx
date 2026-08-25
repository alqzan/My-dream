import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemorySky } from "./MemorySky";
import { toIndicDigits } from "@/lib/utils";
import type { JournalEntry } from "@/lib/types";

// أرشيفٌ موزّع على عدّة أشهر/سنوات (لتشكيل مجرات السنوات).
function makeEntries(n: number): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (let i = 0; i < n; i++) {
    const year = 2024 + (i % 3);
    const month = (i % 12) + 1;
    const day = (i % 28) + 1;
    out.push({ id: `e${i}`, date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, content: `مذكرة ${i}` });
  }
  return out;
}

const EMPTY_TEXT = "سماؤك ما زالت خالية";
function render(entries: JournalEntry[]) {
  return renderToStaticMarkup(<MemorySky entries={entries} memories={[]} onOpen={() => {}} />);
}

describe("MemorySky — هرم المجرات والنجوم والكواكب", () => {
  it("shows year galaxies (not the empty state) for 334 memories", () => {
    const n = 334;
    const html = render(makeEntries(n));
    expect(html).not.toContain(EMPTY_TEXT);
    expect(html).toContain("مجرة");
    expect(html).toContain(toIndicDigits(String(n)) + " ذكرى");
    expect(html).toMatch(/مجرة ٢٠٢٤|مجرة ٢٠٢٥|مجرة ٢٠٢٦/);
  });

  it("shows galaxies for 1000 memories", () => {
    const html = render(makeEntries(1000));
    expect(html).not.toContain(EMPTY_TEXT);
    expect(html).toContain("مجرة");
    expect(html).toContain("١٠٠٠ ذكرى");
  });

  it("keeps the year-first hierarchy for a small archive", () => {
    const html = render(makeEntries(10));
    expect(html).not.toContain(EMPTY_TEXT);
    expect(html).toContain("مجرة");
    expect(html).toContain("السنة مجرّة");
    expect(html).toContain("الشهر نجم");
    expect(html).toContain("اليوم كوكب");
  });

  it("shows the empty state only when there are truly no memories", () => {
    const html = render([]);
    expect(html).toContain(EMPTY_TEXT);
  });
});
