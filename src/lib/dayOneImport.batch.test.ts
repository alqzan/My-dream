import { describe, it, expect, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { streamDayOneZipImport, type BatchImportProgress } from "./dayOneParser";
import type { JournalEntry } from "./types";

// compressImageSmart needs a browser canvas — not available in the node test
// env — so we exercise the batching/streaming logic with AUDIO media (encoded
// by a pure-JS path). Image handling shares the exact same batching code.

function dayOneZip(): Blob {
  const json = {
    entries: [
      { uuid: "a", creationDate: "2026-03-01T10:00:00Z", text: "أول", audios: [{ md5: "KEY1", format: "m4a" }] },
      { uuid: "b", creationDate: "2026-03-02T10:00:00Z", text: "ثاني" },
      { uuid: "c", creationDate: "2026-03-03T10:00:00Z", text: "ثالث" },
      { uuid: "d", creationDate: "2026-03-04T10:00:00Z", text: "رابع", audios: [{ md5: "MISSING", format: "m4a" }] },
    ],
  };
  const zipped = zipSync({
    "journal.json": strToU8(JSON.stringify(json)),
    "audios/KEY1.m4a": new Uint8Array([1, 2, 3, 4, 5]),
    // MISSING has no file → its entry still flushes, media counted as not-imported.
  });
  return new Blob([zipped], { type: "application/zip" });
}

describe("streamDayOneZipImport — batched, bounded, resumable", () => {
  it("flushes all entries in batches and attaches streamed media", async () => {
    const batches: JournalEntry[][] = [];
    const progress: BatchImportProgress[] = [];
    const res = await streamDayOneZipImport(dayOneZip(), {
      batchSize: 2,
      onBatch: (e) => { batches.push(e); },
      onProgress: (p) => { progress.push(p); },
    });

    const all = batches.flat();
    expect(all).toHaveLength(4);                    // every entry reached the caller
    expect(res.cancelled).toBe(false);
    expect(batches.every((b) => b.length <= 2)).toBe(true); // batch size respected

    const a = all.find((e) => e.id === "do-a")!;
    expect(a.audio).toMatch(/^data:audio\//);       // streamed audio attached
    expect(res.audiosReferenced).toBe(2);           // a + d referenced audio
    expect(res.audiosImported).toBe(1);             // only KEY1 existed → 1 imported
    expect(progress.at(-1)?.entriesDone).toBe(4);
  });

  it("stops early when cancelled but keeps what was already flushed", async () => {
    const batches: JournalEntry[][] = [];
    const res = await streamDayOneZipImport(dayOneZip(), {
      batchSize: 2,
      shouldCancel: () => true,          // cancel at the first media file
      onBatch: (e) => { batches.push(e); },
    });
    expect(res.cancelled).toBe(true);
    // The no-media entries (b, c) were finalized before media streaming, so they
    // persist; the cancel only stops further media processing.
    const ids = batches.flat().map((e) => e.id);
    expect(ids).toContain("do-b");
    expect(ids).toContain("do-c");
  });

  it("awaits each onBatch before the next (backpressure)", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await streamDayOneZipImport(dayOneZip(), {
      batchSize: 1,
      onBatch: async () => {
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
      },
    });
    expect(maxInFlight).toBe(1); // never two batches persisting at once
  });
});
