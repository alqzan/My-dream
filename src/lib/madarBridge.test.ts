// حارس جسر «مستورد الذكريات» (.madarimport) — بلا Firebase (كـdayOneParser.test.ts
// وmerge.test.ts)، فيُختبر في Node صرفاً. يغطّي كل بوابات التحقّق المطلوبة قبل
// أن يُسمح لمحتوى الملف بالوصول لأي مسار كتابة: الهوية، البنية، الملخّص،
// الحجم، النوع، بصمة المحتوى (checksum)، ومسارات الحاوية الآمنة.
import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  parseMadarImportFile,
  MadarImportError,
  checksumOfEntries,
  MADAR_IMPORT_MAGIC,
  MADAR_IMPORT_FORMAT_VERSION,
  MADAR_IMPORT_MAX_BYTES,
  type MadarImportEntry,
  type MadarImportManifest,
} from "./madarBridge";

const HASH_A = "a".repeat(32);
const HASH_B = "b".repeat(32);

function entry(o: Partial<MadarImportEntry> & { uuid: string }): MadarImportEntry {
  return { date: "2026-01-01", content: "نصّ المذكرة.", ...o };
}

function summaryOf(entries: MadarImportEntry[]) {
  return {
    entryCount: entries.length,
    photoCount: entries.reduce((n, e) => n + (e.photoRefs?.length ?? 0), 0),
    audioCount: entries.reduce((n, e) => n + (e.audioRefs?.length ?? 0), 0),
    videoCount: entries.reduce((n, e) => n + (e.videoRefs?.length ?? 0), 0),
    pdfCount: entries.reduce((n, e) => n + (e.pdfRefs?.length ?? 0), 0),
  };
}

async function buildManifest(
  entries: MadarImportEntry[],
  overrides: Partial<MadarImportManifest> = {}
): Promise<MadarImportManifest> {
  return {
    magic: MADAR_IMPORT_MAGIC,
    formatVersion: MADAR_IMPORT_FORMAT_VERSION,
    generatedBy: { app: "madar-memory-importer", version: "1.0.0" },
    createdAt: "2026-03-01T00:00:00.000Z",
    summary: summaryOf(entries),
    entriesChecksum: await checksumOfEntries(entries),
    entries,
    ...overrides,
  };
}

function zipOf(files: Record<string, Uint8Array>): Blob {
  return new Blob([zipSync(files)]);
}

function manifestZip(manifest: unknown): Blob {
  return zipOf({ "manifest.json": strToU8(JSON.stringify(manifest)) });
}

describe("parseMadarImportFile — ملفٌّ صحيح", () => {
  it("يقبل ملفاً صحيحاً ويحوّل مدخلاته إلى JournalEntry بهويّة Day One الثابتة", async () => {
    const entries = [
      entry({ uuid: "U1", title: "عنوان", tags: ["سفر"], photoRefs: [HASH_A], audioRefs: [HASH_B] }),
      entry({ uuid: "U2", content: "مدخلة أخرى", location: { lat: 24.7, lng: 46.6, place: "الرياض" } }),
    ];
    const manifest = await buildManifest(entries);
    const r = await parseMadarImportFile(manifestZip(manifest));

    expect(r.entries).toHaveLength(2);
    expect(r.entries[0].id).toBe("do-U1");
    expect(r.entries[0].source).toBe("dayOne");
    expect(r.entries[0].dayOneUUID).toBe("U1");
    expect(r.entries[0].photoRefs).toEqual([HASH_A]);
    expect(r.entries[0].audioRefs).toEqual([HASH_B]);
    expect(r.entries[1].location).toEqual({ lat: 24.7, lng: 46.6, place: "الرياض" });
    expect(r.photoHashes).toEqual([HASH_A]);
    expect(r.audioHashes).toEqual([HASH_B]);
    expect(r.failed).toBe(0);
  });

  it("ملفٌّ بلا مدخلات ينجح بصفر", async () => {
    const manifest = await buildManifest([]);
    const r = await parseMadarImportFile(manifestZip(manifest));
    expect(r.entries).toHaveLength(0);
  });

  it("إعادة تحليل الملف نفسه تنتج معرّفات متطابقة (لا تكرار UUIDs عبر إعادات التشغيل)", async () => {
    const manifest = await buildManifest([entry({ uuid: "U1" })]);
    const zip = manifestZip(manifest);
    const a = await parseMadarImportFile(zip);
    const b = await parseMadarImportFile(zip);
    expect(a.entries[0].id).toBe(b.entries[0].id);
  });
});

describe("parseMadarImportFile — هويّة خاطئة", () => {
  it("يرفض magic غير مطابق برمز identity", async () => {
    const manifest = await buildManifest([entry({ uuid: "U1" })], { magic: "someone-else" });
    await expect(parseMadarImportFile(manifestZip(manifest))).rejects.toMatchObject({
      code: "identity",
    });
  });

  it("يرفض formatVersion غير مدعومة", async () => {
    const manifest = await buildManifest([entry({ uuid: "U1" })], { formatVersion: 99 });
    await expect(parseMadarImportFile(manifestZip(manifest))).rejects.toMatchObject({
      code: "identity",
    });
  });
});

describe("parseMadarImportFile — ملخّص مزوَّر", () => {
  it("يرفض summary.entryCount لا يطابق عدد entries الفعلي", async () => {
    const entries = [entry({ uuid: "U1" }), entry({ uuid: "U2" })];
    const manifest = await buildManifest(entries);
    manifest.summary = { ...manifest.summary, entryCount: 1 }; // مزوَّر بعد حساب checksum الصحيح
    await expect(parseMadarImportFile(manifestZip(manifest))).rejects.toMatchObject({
      code: "summary",
    });
  });

  it("يرفض photoCount مزوَّراً حتى لو كان entryCount صحيحاً", async () => {
    const entries = [entry({ uuid: "U1", photoRefs: [HASH_A] })];
    const manifest = await buildManifest(entries);
    manifest.summary = { ...manifest.summary, photoCount: 5 };
    await expect(parseMadarImportFile(manifestZip(manifest))).rejects.toMatchObject({
      code: "summary",
    });
  });
});

describe("parseMadarImportFile — بصمة محتوى غير مطابقة (hash)", () => {
  it("يرفض entriesChecksum لا يطابق entries الفعلية", async () => {
    const manifest = await buildManifest([entry({ uuid: "U1", content: "أصلي" })]);
    // الملف عُدِّل بعد التوليد: النص تغيّر لكن البصمة بقيت قديمة.
    manifest.entries = [{ ...manifest.entries[0], content: "مُعدَّل بعد الإصدار" }];
    await expect(parseMadarImportFile(manifestZip(manifest))).rejects.toMatchObject({
      code: "hash",
    });
  });
});

describe("parseMadarImportFile — الحجم", () => {
  it("يرفض ملفاً أكبر من 50MB بلا حتى محاولة قراءته", async () => {
    const oversized = {
      size: MADAR_IMPORT_MAX_BYTES + 1,
      arrayBuffer: async () => {
        throw new Error("لا يجب استدعاء arrayBuffer على ملفٍ رُفض بالحجم");
      },
    } as unknown as Blob;
    await expect(parseMadarImportFile(oversized)).rejects.toMatchObject({ code: "size" });
  });

  it("يرفض ملفاً فارغاً", async () => {
    const empty = { size: 0, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Blob;
    await expect(parseMadarImportFile(empty)).rejects.toMatchObject({ code: "size" });
  });
});

describe("parseMadarImportFile — النوع", () => {
  it("يرفض ملفاً لا يحمل توقيع ZIP", async () => {
    const notZip = new Blob(["{\"not\":\"a zip\"}"]);
    await expect(parseMadarImportFile(notZip)).rejects.toMatchObject({ code: "type" });
  });
});

describe("parseMadarImportFile — مسارات الحاوية الآمنة", () => {
  it("يرفض ملفاً بمسارٍ متفرّع داخل الحاوية (لا تصعيد/لا مجلدات)", async () => {
    const manifest = await buildManifest([entry({ uuid: "U1" })]);
    const zip = zipOf({ "sub/manifest.json": strToU8(JSON.stringify(manifest)) });
    await expect(parseMadarImportFile(zip)).rejects.toMatchObject({ code: "path" });
  });

  it("يرفض حاويةً تحوي ملفاً إضافياً غير manifest.json", async () => {
    const manifest = await buildManifest([entry({ uuid: "U1" })]);
    const zip = zipOf({
      "manifest.json": strToU8(JSON.stringify(manifest)),
      "extra.txt": strToU8("مفاجأة"),
    });
    await expect(parseMadarImportFile(zip)).rejects.toMatchObject({ code: "structure" });
  });
});

describe("parseMadarImportFile — بنية غير صالحة", () => {
  it("manifest.json ليس JSON صالحاً", async () => {
    const zip = zipOf({ "manifest.json": strToU8("{ليس json") });
    await expect(parseMadarImportFile(zip)).rejects.toMatchObject({ code: "structure" });
  });

  it("حقلٌ جذريّ ناقص (summary)", async () => {
    const manifest = await buildManifest([entry({ uuid: "U1" })]);
    const bad = { ...manifest } as Record<string, unknown>;
    delete bad.summary;
    await expect(parseMadarImportFile(manifestZip(bad))).rejects.toMatchObject({ code: "structure" });
  });
});

describe("parseMadarImportFile — تساهلٌ فرديّ لمدخلة فاسدة (failed)", () => {
  it("يستبعد مدخلةً بتاريخٍ غير صالح دون إسقاط الملف كله", async () => {
    const good = entry({ uuid: "U1" });
    const bad = entry({ uuid: "U2", date: "not-a-date" });
    // نبني الملخّص والبصمة اعتماداً على المدخلتين كما هما (الملف نفسه سليم البنية).
    const manifest = await buildManifest([good, bad]);
    const r = await parseMadarImportFile(manifestZip(manifest));
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].dayOneUUID).toBe("U1");
    expect(r.failed).toBe(1);
  });

  it("يستبعد مدخلةً بمرجع هاشٍ بصيغة خاطئة", async () => {
    const bad = entry({ uuid: "U3", photoRefs: ["not-a-hash"] });
    const manifest = await buildManifest([bad]);
    const r = await parseMadarImportFile(manifestZip(manifest));
    expect(r.entries).toHaveLength(0);
    expect(r.failed).toBe(1);
  });
});

describe("MadarImportError", () => {
  it("يحمل الرمز والرسالة", () => {
    const e = new MadarImportError("identity", "رسالة");
    expect(e.code).toBe("identity");
    expect(e.message).toBe("رسالة");
    expect(e.name).toBe("MadarImportError");
  });
});
