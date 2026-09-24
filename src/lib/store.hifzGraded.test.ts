import { describe, it, expect, vi, beforeEach } from "vitest";

// المتجرُ المحفوظ يكلّم IndexedDB عبر idb-keyval؛ نُبدله ليُقلع في Node بلا متصفّح.
const idb = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => { idb.set(k, v); },
  del: async (k: string) => { idb.delete(k); },
}));

import { useAppStore } from "./store";
import { today } from "./utils";
import { pageRange } from "./quran/meta";

const plan = { startId: 1, unit: "page" as const, amount: 2, createdAt: "2026-01-01" };

beforeEach(() => {
  useAppStore.setState({ quranHifz: { plan, frontierId: 0, sessions: [], reviews: [], mistakes: [] } });
});

describe("recordGraded — قيدٌ لكلّ جزءٍ بتقييمه", () => {
  const p1 = pageRange(1), p2 = pageRange(2);

  it("الحفظ: جلسةٌ لكلّ جزء متّصلةً من الجبهة، والجبهةُ آخرُها", () => {
    useAppStore.getState().recordGraded("memorize", [
      { fromId: p2.start, toId: p2.end, rating: 2 },
      { fromId: p1.start, toId: p1.end, rating: 3 },
    ]);
    const h = useAppStore.getState().quranHifz;
    expect(h.frontierId).toBe(p2.end);
    // الأحدثُ أوّلاً كسائر السجلّ، ولا ثغرة بين الجزأين
    expect(h.sessions.map((x) => [x.fromId, x.toId, x.rating])).toEqual([
      [p2.start, p2.end, 2], [p1.start, p1.end, 3],
    ]);
    expect(h.sessions.every((x) => x.date === today())).toBe(true);
    expect(h.sessions[0].at!).toBeGreaterThan(h.sessions[1].at!);
  });

  it("المراجعة: قيدٌ لكلّ جزء ولا تمسّ الجبهة؛ والاختبار يضبط دوريّته", () => {
    useAppStore.setState({ quranHifz: { plan, frontierId: p2.end, sessions: [], reviews: [], mistakes: [] } });
    useAppStore.getState().recordGraded("review", [
      { fromId: p1.start, toId: p1.end, rating: 3 },
      { fromId: p2.start, toId: p2.end, rating: 1 },
    ]);
    let h = useAppStore.getState().quranHifz;
    expect(h.frontierId).toBe(p2.end);
    expect(h.reviews.map((x) => x.rating)).toEqual([1, 3]);
    expect(h.lastTestDate).toBeUndefined();

    useAppStore.getState().recordGraded("test", [{ fromId: p1.start, toId: p1.end, rating: 3 }]);
    h = useAppStore.getState().quranHifz;
    expect(h.reviews).toHaveLength(3);
    expect(h.lastTestDate).toBe(today());
  });
});
