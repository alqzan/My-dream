import { describe, expect, it } from "vitest";
import type { AppData } from "./types";
import { aiExportJson, buildAiExport } from "./aiExport";

function fixture(): AppData {
  return {
    categories: [{ id: "food", label: "طعام", icon: "", color: "" }],
    transactions: [
      { id: "tx-1", date: "2026-08-01", amount: 25, category: "food", note: "مطعم" },
      { id: "tx-2", date: "2026-02-01", amount: 90, category: "food", note: "قديم" },
    ],
    journalEntries: [
      {
        id: "j-1",
        date: "2026-08-03",
        title: "يوم",
        content: "نص",
        photo: "data:image/png;base64,secret",
        attachmentRefs: [{ kind: "pdf", filename: "مرفق.pdf", status: "uploaded", localData: "data:application/pdf;base64,secret" }],
      },
      { id: "j-2", date: "2026-02-03", content: "قديم" },
    ],
    prayerLogs: [
      { date: "2026-08-04", prayers: { الفجر: "جماعة" } },
      { date: "2026-02-04", prayers: { الفجر: "لم" } },
    ],
    quranReflections: [
      { id: "r-1", date: "2026-08-05", text: "تدبر", createdAt: "2026-08-05" },
      { id: "r-2", date: "2026-02-05", text: "قديم", createdAt: "2026-02-05" },
    ],
    quranWird: ["2026-08-06", "2026-02-06"],
    quranHifz: {
      plan: { startId: 1, unit: "page", amount: 1, createdAt: "2026-08-01" },
      frontierId: 10,
      sessions: [{ id: "s-1", date: "2026-08-07", fromId: 1, toId: 10 }],
      reviews: [],
      mistakes: [],
    },
    quranKhatma: { juz: 1, completed: 0, pageLog: [{ date: "2026-08-08", page: 20 }] },
  } as unknown as AppData;
}

describe("buildAiExport", () => {
  it("filters every selected section by month without touching the source data", () => {
    const data = fixture();
    const payload = buildAiExport(data, {
      period: { mode: "month", value: "2026-08" },
      sections: ["journal", "finance", "prayer", "quran"],
      generatedAt: "2026-08-20T00:00:00.000Z",
    });
    expect(payload.counts).toEqual({ journal: 1, finance: 1, prayer: 1, quran: 1 });
    expect((payload.data.journal as { entries: unknown[] }).entries).toHaveLength(1);
    expect((payload.data.finance as { transactions: unknown[] }).transactions).toHaveLength(1);
    expect((payload.data.prayer as { logs: unknown[] }).logs).toHaveLength(1);
    expect((payload.data.quran as { reflections: unknown[] }).reflections).toHaveLength(1);
    expect(data.journalEntries[0].photo).toContain("data:image");
  });

  it("supports an all-period export and keeps manual-only privacy metadata", () => {
    const payload = buildAiExport(fixture(), {
      period: { mode: "all" },
      sections: ["journal", "finance", "prayer", "quran"],
      generatedAt: "2026-08-20T00:00:00.000Z",
    });
    expect(payload.counts).toEqual({ journal: 2, finance: 2, prayer: 2, quran: 2 });
    expect(payload.privacy.upload).toBe("manual-only");
    expect(payload.privacy.mediaBytesIncluded).toBe(false);
    const json = aiExportJson(payload);
    expect(json).not.toContain("data:image");
    expect(json).not.toContain("data:application");
    expect(json).not.toContain("localData");
  });

  it("redacts finance amounts and notes when requested", () => {
    const payload = buildAiExport(fixture(), {
      period: { mode: "year", value: "2026" },
      sections: ["finance"],
      redactFinance: true,
    });
    const transactions = (payload.data.finance as { transactions: Record<string, unknown>[] }).transactions;
    expect(transactions[0]).not.toHaveProperty("amount");
    expect(transactions[0]).not.toHaveProperty("note");
    expect(payload.privacy.financeRedacted).toBe(true);
  });
});

