import { describe, it, expect } from "vitest";
import {
  lastDays, windowStats, pctOf, barHeights, yearPetals, yearAverage, yearInventory, WINDOW_DAYS,
} from "./hasila";
import type { PrayerLog, JournalEntry, ReadingLog, Habit, Transaction, Book } from "./types";

const full = (date: string): PrayerLog =>
  ({ date, prayers: { الفجر: "جماعة", الظهر: "جماعة", العصر: "جماعة", المغرب: "جماعة", العشاء: "جماعة" } });

const EMPTY = { prayerLogs: [], journalEntries: [], readingLogs: [], habits: [], transactions: [] };

describe("نافذةُ الثلاثين", () => {
  it("ثلاثون مفتاحاً تنتهي باليوم، الأقدمُ أوّلاً", () => {
    const d = lastDays("2026-08-19");
    expect(d).toHaveLength(WINDOW_DAYS);
    expect(d[29]).toBe("2026-08-19");
    expect(d[0]).toBe("2026-07-21");
  });

  it("نافذةٌ فارغةٌ تُنتج أصفاراً لا NaN", () => {
    const w = windowStats("2026-08-19", EMPTY);
    expect(w.prayedTotal).toBe(0);
    expect(w.spendTotal).toBe(0);
    expect(w.habitsCap).toBe(0);
    expect(w.prayed).toHaveLength(30);
  });

  it("تجمع الصلاةَ والجماعةَ والكتابةَ والصفحاتِ والعاداتِ والصرف", () => {
    const habits: Habit[] = [
      { id: "h1", name: "أ", icon: "", color: "", logs: ["2026-08-19", "2026-08-18"] },
      { id: "h2", name: "ب", icon: "", color: "", logs: ["2026-08-19"] },
    ];
    const w = windowStats("2026-08-19", {
      prayerLogs: [full("2026-08-19"), { date: "2026-08-18", prayers: { الفجر: "منفردة", الظهر: "فائتة" } }],
      journalEntries: [{ id: "j", date: "2026-08-19", content: "x" } as JournalEntry],
      readingLogs: [{ id: "r", bookId: "b", date: "2026-08-19", pagesRead: 14, minutesRead: 25 } as ReadingLog],
      habits,
      transactions: [{ id: "t", date: "2026-08-19", amount: 50, category: "c", note: "" } as Transaction],
    });
    expect(w.prayedTotal).toBe(6); // ٥ + ١ (الفائتة لا تُعَدّ)
    expect(w.jamaah).toBe(5);
    expect(w.wroteDays).toBe(1);
    expect(w.pagesTotal).toBe(14);
    expect(w.habitsTotal).toBe(3);
    expect(w.habitsCap).toBe(60);
    expect(w.spendTotal).toBe(50);
  });

  it("المعاملةُ المؤجّلة تُحتسب صفراً في الصرف — لم تُدفع", () => {
    const w = windowStats("2026-08-19", {
      ...EMPTY,
      transactions: [
        { id: "a", date: "2026-08-19", amount: 1200, category: "c", note: "", deferred: true } as Transaction,
        { id: "b", date: "2026-08-19", amount: 100, category: "c", note: "" } as Transaction,
      ],
    });
    expect(w.spendTotal).toBe(100);
  });
});

describe("النسبةُ والأعمدة", () => {
  it("مقامٌ صفرٌ يُقرأ صفراً لا NaN", () => {
    expect(pctOf(5, 0)).toBe(0);
    expect(pctOf(0, 0)).toBe(0);
    expect(pctOf(3, 4)).toBe(75);
  });

  it("اليومُ الخالي يبقى خطّاً مرئيّاً لا يختفي", () => {
    const h = barHeights([0, 5, 10]);
    expect(h[0]).toBe("3%");
    expect(h[2]).toBe("100%");
  });

  it("أعمدةٌ كلُّها أصفار لا تقسم على صفر", () => {
    expect(barHeights([0, 0, 0])).toEqual(["3%", "3%", "3%"]);
    expect(barHeights([])).toEqual([]);
  });
});

describe("سنةُ الالتزام", () => {
  it("اثنتا عشرة بتلةً تنتهي بالشهر الجاري", () => {
    const p = yearPetals([], "2026-08-19");
    expect(p).toHaveLength(12);
    expect(p[11].now).toBe(true);
    expect(p[11].key).toBe("2026-08");
    expect(p[0].key).toBe("2025-09");
  });

  it("الشهرُ الجاري يُقاس بأيامه المنقضية لا بأيامه كلِّها", () => {
    // يومان كاملان من ١٩ يوماً منقضياً = ١٠/٩٥ ≈ ١١٪
    const p = yearPetals([full("2026-08-01"), full("2026-08-02")], "2026-08-19");
    expect(p[11].value).toBe(11);
  });

  it("شهرٌ كاملُ الالتزام = ١٠٠٪", () => {
    const logs = Array.from({ length: 19 }, (_, i) => full(`2026-08-${String(i + 1).padStart(2, "0")}`));
    expect(yearPetals(logs, "2026-08-19")[11].value).toBe(100);
  });

  it("معدَّلُ السنة يحسب الأشهرَ الماضية وحدَها", () => {
    const p = yearPetals([], "2026-08-19");
    expect(p.every((x) => x.past)).toBe(true); // كلُّها مضت أو جارية
    expect(yearAverage(p)).toBe(0);
    expect(yearAverage([])).toBe(0);
  });
});

describe("جَردُ السنة", () => {
  it("يعدّ ما يخصّ السنةَ المطلوبة وحدَها", () => {
    const rows = yearInventory(2026, {
      journalEntries: [
        { id: "a", date: "2026-01-05", content: "" } as JournalEntry,
        { id: "b", date: "2026-01-05", content: "" } as JournalEntry, // اليومُ نفسُه لا يُعَدّ مرّتين
        { id: "c", date: "2025-12-31", content: "" } as JournalEntry,
      ],
      readingLogs: [
        { id: "r", bookId: "b", date: "2026-02-01", pagesRead: 30, minutesRead: 40 } as ReadingLog,
        { id: "r2", bookId: "b", date: "2025-02-01", pagesRead: 99 } as ReadingLog,
      ],
      books: [
        { id: "b1", title: "", author: "", totalPages: 1, currentPage: 1, status: "أنهيت", finishDate: "2026-03-01" } as Book,
        { id: "b2", title: "", author: "", totalPages: 1, currentPage: 1, status: "أنهيت", finishDate: "2025-03-01" } as Book,
      ],
      prayerLogs: [full("2026-04-01"), full("2025-04-01")],
    });
    const by = (l: string) => rows.find((r) => r.label.includes(l))!.value;
    expect(by("يومًا لها أثر")).toBe(1);
    expect(by("صفحةً")).toBe(30);
    expect(by("دقيقةً")).toBe(40);
    expect(by("كتابًا")).toBe(1);
    expect(by("جماعة")).toBe(5);
  });

  it("سنةٌ بلا شيءٍ تُرجع خمسةَ أصفارٍ لا فراغاً", () => {
    const rows = yearInventory(2026, {
      journalEntries: [], readingLogs: [], books: [], prayerLogs: [],
    });
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.value === 0)).toBe(true);
  });
});
