import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemorySky } from "./MemorySky";
import { SKY_CLUSTER_THRESHOLD } from "@/lib/memorySky";
import type { JournalEntry } from "@/lib/types";

// أرشيفٌ كبير موزّع على عدّة أشهر/سنوات (لتشكيل كوكبات).
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

describe("MemorySky — الكوكبات تظهر عند الأرشيف الكبير", () => {
  it("shows constellations (not the empty state) for 334 memories", () => {
    const n = 334;
    expect(n).toBeGreaterThan(SKY_CLUSTER_THRESHOLD);
    const html = render(makeEntries(n));
    expect(html).not.toContain(EMPTY_TEXT); // البقّ الأصلي: كانت «السماء الخالية» تُغطّيها
    expect(html).toContain("كوكبة"); // عدّاد الكوكبات في الترويسة
    expect(html).toContain(`${n} ذكرى`); // مجموع الذكريات
    expect(html).toMatch(/يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو/); // اسمُ شهرٍ في aria-label الكوكبة
  });

  it("shows constellations for 1000 memories", () => {
    const html = render(makeEntries(1000));
    expect(html).not.toContain(EMPTY_TEXT);
    expect(html).toContain("كوكبة");
    expect(html).toContain("1000 ذكرى");
  });

  it("renders individual stars below the threshold", () => {
    const html = render(makeEntries(10));
    expect(html).not.toContain(EMPTY_TEXT);
    expect(html).toContain("نجمة"); // «١٠ نجمة · المس نجمةً…»
  });

  it("shows the empty state only when there are truly no memories", () => {
    const html = render([]);
    expect(html).toContain(EMPTY_TEXT);
  });
});
