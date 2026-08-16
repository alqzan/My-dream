// حارس جسر «مستورد الذكريات» (.madarimport) — بلا Firebase (كـdayOneParser.test.ts
// وmerge.test.ts)، فيُختبر في Node صرفاً. البنية هنا JSON عادي مطابقٌ حرفياً
// لِما يُصدره MadarManifest.swift (لا ZIP، لا manifest.json، لا
// magic/formatVersion/entriesChecksum) — راجع تعليق أعلى madarBridge.ts.
import { describe, it, expect } from "vitest";
import {
  parseMadarImportFile,
  MadarImportError,
  buildMemoryImporterConnection,
  MADAR_CONNECTION_VERSION,
  type MadarBridgeRecord,
  type MadarBridgeMedia,
  type MadarBridgeSummary,
  type MadarBridgeManifest,
} from "./madarBridge";

const HASH_A = "a".repeat(32);
const HASH_B = "b".repeat(32);
const HASH_C = "c".repeat(32);
const HASH_D = "d".repeat(32);

function record(o: Partial<MadarBridgeRecord> & { id: string; dayOneUUID: string }): MadarBridgeRecord {
  return { createdAt: "2026-03-14T09:30:00Z", text: "نصّ المذكرة.", tags: [], starred: false, mediaIDs: [], ...o };
}

// وسيطٌ عامّ — status تُترك "uploaded" افتراضاً لكن **بلا** إيصالٍ كامل، كي لا
// تُخفي القيم الافتراضية اختباراتِ النقص عمداً (الاختبارات التي تحتاج وسيطاً
// uploaded صالحاً بالكامل تستخدم uploaded() أدناه).
function media(o: Partial<MadarBridgeMedia> & { id: string; recordID: string }): MadarBridgeMedia {
  return { kind: "photo", status: "uploaded", ...o };
}

// وسيطٌ uploaded مكتمل الإيصال (هاش + مساحة + حجم + نوع صالحين) — الحالة
// الأكثر شيوعاً في اختبارات المسار السعيد؛ raw override يبقى ممكناً.
function uploaded(o: Partial<MadarBridgeMedia> & { id: string; recordID: string }): MadarBridgeMedia {
  return media({ uploadedByteCount: 1024, contentType: "application/octet-stream", ...o });
}

function summaryOf(records: MadarBridgeRecord[], media_: MadarBridgeMedia[]): MadarBridgeSummary {
  const recordIds = new Set(records.map((r) => r.id));
  const referenced = media_.filter((m) => recordIds.has(m.recordID)).length;
  const tally = (s: MadarBridgeMedia["status"]) => media_.filter((m) => m.status === s).length;
  return {
    recordCount: records.length,
    referencedMediaCount: referenced,
    uploadedMediaCount: tally("uploaded"),
    metadataOnlyCount: tally("metadataOnly"),
    missingMediaCount: tally("missing"),
    failedMediaCount: tally("failed"),
    originalByteCount: media_.reduce((n, m) => n + (m.originalByteCount ?? 0), 0),
    uploadedByteCount: media_.reduce((n, m) => n + (m.uploadedByteCount ?? 0), 0),
    sourceReferencedMediaCount: media_.length,
    skippedByPolicyCount: 0,
  };
}

function manifest(
  records: MadarBridgeRecord[],
  media_: MadarBridgeMedia[],
  overrides: Partial<MadarBridgeManifest> = {}
): MadarBridgeManifest {
  return {
    schemaVersion: 1,
    importID: "imp-1",
    createdAt: "2026-03-01T00:00:00Z",
    sourceFingerprint: "fp-1",
    sourceArchiveName: "Day One.zip",
    policy: "balanced",
    records,
    media: media_,
    summary: summaryOf(records, media_),
    ...overrides,
  };
}

function jsonFile(obj: unknown): Blob {
  return new Blob([JSON.stringify(obj)], { type: "application/json" });
}

describe("parseMadarImportFile — ملفٌّ صحيح مطابقٌ لمخرجات MadarManifest.swift", () => {
  it("يقرأ records/media ويربطهما عبر mediaIDs -> media.id -> media.recordID", async () => {
    const records = [
      record({
        id: "r1", dayOneUUID: "U1", title: "عنوان", tags: ["سفر"],
        mediaIDs: ["m1"], timeZoneIdentifier: "Asia/Riyadh",
        location: { latitude: 24.7, longitude: 46.6, placeName: "الرياض" },
      }),
    ];
    const mediaItems = [uploaded({ id: "m1", recordID: "r1", kind: "photo", cloudKind: "photos", cloudHash: HASH_A })];
    const r = await parseMadarImportFile(jsonFile(manifest(records, mediaItems)));

    expect(r.entries).toHaveLength(1);
    const e = r.entries[0];
    expect(e.id).toBe("do-U1");
    expect(e.source).toBe("dayOne");
    expect(e.dayOneUUID).toBe("U1");
    expect(e.title).toBe("عنوان");
    expect(e.tags).toEqual(["سفر"]);
    expect(e.timeZone).toBe("Asia/Riyadh");
    expect(e.location).toEqual({ lat: 24.7, lng: 46.6, place: "الرياض" });
    expect(e.photoRefs).toEqual([HASH_A]);
    expect(r.photoHashes).toEqual([HASH_A]);
    expect(r.audioHashes).toEqual([]);
    expect(r.failed).toBe(0);
    expect(r.manifestMissingMedia).toBe(0);
  });

  it("record.createdAt/modifiedAt يتحوّلان إلى date/time وcapturedAt/modifiedAt", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", createdAt: "2026-03-14T09:30:00Z", modifiedAt: "2026-03-15T10:00:00Z" })];
    const r = await parseMadarImportFile(jsonFile(manifest(records, [])));
    const e = r.entries[0];
    expect(e.date).toBe("2026-03-14");
    expect(e.capturedAt).toBe("2026-03-14T09:30:00.000Z");
    expect(e.modifiedAt).toBe("2026-03-15T10:00:00.000Z");
  });

  it("سجلٌّ بلا وسائط ينجح بمصفوفة فارغة", async () => {
    const r = await parseMadarImportFile(jsonFile(manifest([record({ id: "r1", dayOneUUID: "U1" })], [])));
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].photoRefs).toBeUndefined();
  });

  it("ملفٌّ بلا سجلّات ينجح بصفر", async () => {
    const r = await parseMadarImportFile(jsonFile(manifest([], [])));
    expect(r.entries).toHaveLength(0);
  });

  it("يحفظ مرجع PDF الأصلي عندما تكون بايتاته مرفوعة، دون تحويله إلى صورة", async () => {
    const records = [record({ id: "r1", dayOneUUID: "PDF1", mediaIDs: ["pdf"] })];
    const mediaItems = [uploaded({
      id: "pdf", recordID: "r1", kind: "pdf", cloudKind: "photos", cloudHash: HASH_C,
      contentType: "application/pdf", originalContentType: "application/pdf",
      originalFilename: "عقد.pdf", originalByteCount: 4096, uploadedByteCount: 4096,
    })];
    const r = await parseMadarImportFile(jsonFile(manifest(records, mediaItems)));
    expect(r.entries[0].photoRefs).toBeUndefined();
    expect(r.entries[0].attachmentRefs).toEqual([{
      kind: "pdf", filename: "عقد.pdf", hash: HASH_C, contentType: "application/pdf",
      size: 4096, status: "uploaded", sourceMediaID: "pdf",
    }]);
    expect(r.photoHashes).toEqual([HASH_C]);
  });
});

describe("parseMadarImportFile — الوسائط: صورة+فيديو مع poster+PDF مع preview+صوت metadataOnly معاً", () => {
  it("مانيفستٌ واحد يحوي الأنواع الأربعة كاملةً على نفس المذكرة", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["ph", "vid", "pdf", "aud"] })];
    const mediaItems = [
      uploaded({ id: "ph", recordID: "r1", kind: "photo", cloudKind: "photos", cloudHash: HASH_A, contentType: "image/jpeg" }),
      uploaded({
        id: "vid", recordID: "r1", kind: "video", cloudKind: "photos", cloudHash: HASH_B,
        contentType: "image/jpeg", durationSeconds: 12.5,
      }),
      uploaded({
        id: "pdf", recordID: "r1", kind: "pdf", cloudKind: "photos", cloudHash: HASH_C,
        contentType: "image/jpeg", originalFilename: "عقد.pdf",
      }),
      // صوتٌ metadataOnly عمداً — بلا cloudHash، لكن لا يزال يجب أن يُنتج
      // audioMetadataRefs (المتطلَّب الصريح: حتى بلا cloudHash).
      media({
        id: "aud", recordID: "r1", kind: "audio", status: "metadataOnly",
        contentType: "audio/mp4", durationSeconds: 42, originalFilename: "ملاحظة.m4a",
      }),
    ];
    const r = await parseMadarImportFile(jsonFile(manifest(records, mediaItems)));
    const e = r.entries[0];

    // photoRefs يضمّ الصورة الحقيقية + معاينة الفيديو + معاينة PDF معاً — كي
    // تظهر الثلاث فوراً في معرض الصور القائم (hydrateCloudPhotos/
    // JournalEntryCard) بلا حاجة لواجهة عرضٍ مخصّصة جديدة.
    expect(e.photoRefs).toEqual([HASH_A, HASH_B, HASH_C]);
    // ...وتبقى أيضاً في حقولها النوعية الغنية بالمعلومات الوصفية، مع
    // sourceMediaID (=media.id) كهويّة دمجٍ ثابتة.
    expect(e.videoRefs).toEqual([{ type: "image/jpeg", duration: 12.5, posterHash: HASH_B, sourceMediaID: "vid" }]);
    expect(e.attachmentRefs).toEqual([
      { kind: "pdf", filename: "عقد.pdf", previewHash: HASH_C, status: "uploaded", sourceMediaID: "pdf" },
    ]);
    // صوتٌ metadataOnly: بلا audioRefs (لا بايتات)، لكن بمعلوماتٍ وصفية.
    expect(e.audioRefs).toBeUndefined();
    expect(e.audioMetadataRefs).toEqual([
      { type: "audio/mp4", duration: 42, filename: "ملاحظة.m4a", status: "metadataOnly", sourceMediaID: "aud" },
    ]);
    // كل هاشات "photos" الثلاثة (صورة+poster+preview) يجب التحقّق منها في R2.
    expect(r.photoHashes).toEqual(expect.arrayContaining([HASH_A, HASH_B, HASH_C]));
    expect(r.photoHashes).toHaveLength(3);
    expect(r.audioHashes).toEqual([]); // الصوت metadataOnly — لا هاش يُتحقّق منه بعد.
  });

  it("صوتٌ uploaded يُنتج audioRefs (تشغيل) وaudioMetadataRefs (وصف) معاً", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["aud"] })];
    const mediaItems = [
      uploaded({
        id: "aud", recordID: "r1", kind: "audio", cloudKind: "audios", cloudHash: HASH_D,
        contentType: "audio/mp4", durationSeconds: 8,
      }),
    ];
    const r = await parseMadarImportFile(jsonFile(manifest(records, mediaItems)));
    const e = r.entries[0];
    expect(e.audioRefs).toEqual([HASH_D]);
    expect(e.audioMetadataRefs).toEqual([{ type: "audio/mp4", duration: 8, status: "uploaded", sourceMediaID: "aud" }]);
    expect(r.audioHashes).toEqual([HASH_D]);
  });

  it("نوع الفيديو الدلاليّ من originalContentType لا contentType (المرفوع لقطة غلافٍ فقط)", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["vid"] })];
    const mediaItems = [
      uploaded({
        id: "vid", recordID: "r1", kind: "video", cloudKind: "photos", cloudHash: HASH_A,
        // البايتات المرفوعة فعلياً لقطة غلافٍ (jpeg) — النوع الحقيقي للفيديو
        // نفسه في originalContentType (نوع الملف المصدر على الجهاز).
        contentType: "image/jpeg", originalContentType: "video/quicktime", durationSeconds: 7,
      }),
    ];
    const r = await parseMadarImportFile(jsonFile(manifest(records, mediaItems)));
    const e = r.entries[0];
    expect(e.videoRefs).toEqual([
      { type: "video/quicktime", duration: 7, posterHash: HASH_A, sourceMediaID: "vid" },
    ]);
  });

  it("وسيطٌ status=missing/failed يُحسب في manifestMissingMedia لا في failed السجلّات", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["m1", "m2"] })];
    const mediaItems = [
      media({ id: "m1", recordID: "r1", kind: "photo", status: "missing" }),
      media({ id: "m2", recordID: "r1", kind: "photo", status: "failed" }),
    ];
    const r = await parseMadarImportFile(jsonFile(manifest(records, mediaItems)));
    expect(r.entries).toHaveLength(1); // السجلّ نفسه سليم
    expect(r.failed).toBe(0);
    expect(r.manifestMissingMedia).toBe(2);
  });
});

describe("parseMadarImportFile — تحقّقٌ صارم لربط records/media (رفضٌ لا تساهل)", () => {
  it("يرفض وسيطاً يتيماً — recordID لا يطابق أي سجلّ", async () => {
    const mediaItems = [uploaded({ id: "m1", recordID: "no-such-record", cloudHash: HASH_A, cloudKind: "photos" })];
    await expect(
      parseMadarImportFile(jsonFile(manifest([record({ id: "r1", dayOneUUID: "U1" })], mediaItems)))
    ).rejects.toMatchObject({ code: "media" });
  });

  it("يرفض mediaID في record.mediaIDs لا يطابق أي media.id", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["ghost"] })];
    await expect(parseMadarImportFile(jsonFile(manifest(records, [])))).rejects.toMatchObject({ code: "media" });
  });

  it("يرفض mediaID يشير لوسيطٍ مرتبطٍ بسجلٍّ آخر (recordID مختلف)", async () => {
    const records = [
      record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["m1"] }),
      record({ id: "r2", dayOneUUID: "U2" }),
    ];
    // m1 مرتبطٌ فعلياً بـr2 (recordID صحيح لسجلٍّ موجود) لكن r1 يستدعيه في
    // mediaIDs — تعارضٌ يجب رفضه، لا قبوله كأنه وسيط r1.
    const mediaItems = [uploaded({ id: "m1", recordID: "r2", cloudHash: HASH_A, cloudKind: "photos" })];
    await expect(parseMadarImportFile(jsonFile(manifest(records, mediaItems)))).rejects.toMatchObject({ code: "media" });
  });

  it("يرفض وسيطاً uploaded بلا cloudHash صالح (بدل تجاهله بصمت)", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["m1"] })];
    const mediaItems = [uploaded({ id: "m1", recordID: "r1", cloudKind: "photos" })]; // بلا cloudHash
    await expect(parseMadarImportFile(jsonFile(manifest(records, mediaItems)))).rejects.toMatchObject({ code: "media" });
  });

  it("يرفض وسيطاً uploaded بهاشٍ بصيغة خاطئة", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["m1"] })];
    const mediaItems = [uploaded({ id: "m1", recordID: "r1", cloudKind: "photos", cloudHash: "not-a-hash" })];
    await expect(parseMadarImportFile(jsonFile(manifest(records, mediaItems)))).rejects.toMatchObject({ code: "media" });
  });

  it("يرفض وسيطاً uploaded بلا cloudKind صالح", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["m1"] })];
    const mediaItems = [uploaded({ id: "m1", recordID: "r1", cloudHash: HASH_A })]; // بلا cloudKind
    await expect(parseMadarImportFile(jsonFile(manifest(records, mediaItems)))).rejects.toMatchObject({ code: "media" });
  });

  it("يرفض وسيطاً uploaded بإيصال حجمٍ ناقص (uploadedByteCount)", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["m1"] })];
    const mediaItems = [
      media({ id: "m1", recordID: "r1", cloudHash: HASH_A, cloudKind: "photos", contentType: "image/jpeg" }),
    ]; // بلا uploadedByteCount
    await expect(parseMadarImportFile(jsonFile(manifest(records, mediaItems)))).rejects.toMatchObject({ code: "media" });
  });

  it("يرفض وسيطاً uploaded بإيصال نوعٍ ناقص (contentType)", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["m1"] })];
    const mediaItems = [
      media({ id: "m1", recordID: "r1", cloudHash: HASH_A, cloudKind: "photos", uploadedByteCount: 1024 }),
    ]; // بلا contentType
    await expect(parseMadarImportFile(jsonFile(manifest(records, mediaItems)))).rejects.toMatchObject({ code: "media" });
  });

  it("يرفض media.id مكرراً", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["m1"] })];
    const mediaItems = [
      media({ id: "m1", recordID: "r1", status: "metadataOnly" }),
      media({ id: "m1", recordID: "r1", status: "metadataOnly" }), // نفس id مرّتين
    ];
    await expect(parseMadarImportFile(jsonFile(manifest(records, mediaItems)))).rejects.toMatchObject({ code: "media" });
  });

  it("يرفض record.id مكرراً", async () => {
    const records = [
      record({ id: "r1", dayOneUUID: "U1" }),
      record({ id: "r1", dayOneUUID: "U2" }), // نفس id مرّتين
    ];
    await expect(parseMadarImportFile(jsonFile(manifest(records, [])))).rejects.toMatchObject({ code: "media" });
  });

  it("يرفض وسيطاً recordID فيه صحيحٌ لكن غير مذكورٍ في mediaIDs الخاصة بذلك السجلّ", async () => {
    // r1 موجودٌ فعلاً، وm1.recordID="r1" صحيحٌ — لكن r1.mediaIDs لا يذكر m1
    // إطلاقاً (بقيت فارغة). وسيطٌ "معلّق" لا يعترف به السجلّ الذي يدّعي الانتماء إليه.
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: [] })];
    const mediaItems = [uploaded({ id: "m1", recordID: "r1", cloudHash: HASH_A, cloudKind: "photos" })];
    await expect(parseMadarImportFile(jsonFile(manifest(records, mediaItems)))).rejects.toMatchObject({ code: "media" });
  });

  it("يرفض mediaID مكرراً داخل mediaIDs لنفس السجلّ", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["m1", "m1"] })];
    const mediaItems = [uploaded({ id: "m1", recordID: "r1", cloudHash: HASH_A, cloudKind: "photos" })];
    await expect(parseMadarImportFile(jsonFile(manifest(records, mediaItems)))).rejects.toMatchObject({ code: "media" });
  });

  it("وسيطٌ metadataOnly/missing/failed لا يحتاج إيصالاً كاملاً (لا يُرفض)", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["m1", "m2", "m3"] })];
    const mediaItems = [
      media({ id: "m1", recordID: "r1", status: "metadataOnly" }),
      media({ id: "m2", recordID: "r1", status: "missing" }),
      media({ id: "m3", recordID: "r1", status: "failed" }),
    ];
    const r = await parseMadarImportFile(jsonFile(manifest(records, mediaItems)));
    expect(r.entries).toHaveLength(1);
  });
});

describe("parseMadarImportFile — نسخة غير مدعومة", () => {
  it("يرفض schemaVersion غير 1", async () => {
    const m = manifest([record({ id: "r1", dayOneUUID: "U1" })], [], { schemaVersion: 2 });
    await expect(parseMadarImportFile(jsonFile(m))).rejects.toMatchObject({ code: "version" });
  });
});

describe("parseMadarImportFile — ملخّص مزوَّر", () => {
  it("يرفض summary.recordCount لا يطابق عدد records الفعلي", async () => {
    const m = manifest([record({ id: "r1", dayOneUUID: "U1" }), record({ id: "r2", dayOneUUID: "U2" })], []);
    m.summary = { ...m.summary, recordCount: 1 };
    await expect(parseMadarImportFile(jsonFile(m))).rejects.toMatchObject({ code: "summary" });
  });

  it("يرفض uploadedMediaCount مزوَّراً", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["m1"] })];
    const mediaItems = [uploaded({ id: "m1", recordID: "r1", cloudHash: HASH_A, cloudKind: "photos" })];
    const m = manifest(records, mediaItems);
    m.summary = { ...m.summary, uploadedMediaCount: 99 };
    await expect(parseMadarImportFile(jsonFile(m))).rejects.toMatchObject({ code: "summary" });
  });
});

describe("parseMadarImportFile — الحجم", () => {
  it("يرفض ملفاً أكبر من 50MB بلا حتى محاولة قراءته", async () => {
    const oversized = {
      size: 50 * 1024 * 1024 + 1,
      text: async () => { throw new Error("لا يجب استدعاء text() على ملفٍ رُفض بالحجم"); },
    } as unknown as Blob;
    await expect(parseMadarImportFile(oversized)).rejects.toMatchObject({ code: "size" });
  });

  it("يرفض ملفاً فارغاً", async () => {
    const empty = { size: 0, text: async () => "" } as unknown as Blob;
    await expect(parseMadarImportFile(empty)).rejects.toMatchObject({ code: "size" });
  });
});

describe("parseMadarImportFile — النوع والبنية", () => {
  it("يرفض ملفاً ليس JSON صالحاً", async () => {
    await expect(parseMadarImportFile(new Blob(["ليس JSON"]))).rejects.toMatchObject({ code: "type" });
  });

  it("يرفض مصفوفةً جذرية (ليست كائناً)", async () => {
    await expect(parseMadarImportFile(jsonFile([1, 2, 3]))).rejects.toMatchObject({ code: "type" });
  });

  it("يرفض حقلاً جذرياً ناقصاً", async () => {
    const m = manifest([record({ id: "r1", dayOneUUID: "U1" })], []) as unknown as Record<string, unknown>;
    delete m.summary;
    await expect(parseMadarImportFile(jsonFile(m))).rejects.toMatchObject({ code: "structure" });
  });

  it("يرفض policy غير معروفة", async () => {
    const m = manifest([], [], { policy: "extreme" as unknown as MadarBridgeManifest["policy"] });
    await expect(parseMadarImportFile(jsonFile(m))).rejects.toMatchObject({ code: "structure" });
  });
});

describe("parseMadarImportFile — originalSourcePath (نصٌّ للعرض فقط)", () => {
  it("يقبل مساراً مطلقاً طبيعياً من جهاز المصدر (لا نرفض شكل المسار)", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["m1"] })];
    const mediaItems = [
      uploaded({
        id: "m1", recordID: "r1", cloudHash: HASH_A, cloudKind: "photos",
        originalSourcePath: "/Users/owner/Downloads/Day One.zip/photos/abc.jpeg",
      }),
    ];
    const r = await parseMadarImportFile(jsonFile(manifest(records, mediaItems)));
    expect(r.entries).toHaveLength(1);
  });

  it("يرفض originalSourcePath يحمل بايت NUL", async () => {
    const records = [record({ id: "r1", dayOneUUID: "U1", mediaIDs: ["m1"] })];
    const mediaItems = [media({ id: "m1", recordID: "r1", originalSourcePath: "evil\u0000.jpeg" })];
    await expect(parseMadarImportFile(jsonFile(manifest(records, mediaItems)))).rejects.toMatchObject({ code: "path" });
  });
});

describe("parseMadarImportFile — تساهلٌ فرديّ لسجلّ فاسد (failed)", () => {
  it("يستبعد سجلاً بتاريخٍ غير صالح دون إسقاط الملف كله", async () => {
    const records = [
      record({ id: "r1", dayOneUUID: "U1" }),
      record({ id: "r2", dayOneUUID: "U2", createdAt: "ليس تاريخاً" }),
    ];
    const r = await parseMadarImportFile(jsonFile(manifest(records, [])));
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].dayOneUUID).toBe("U1");
    expect(r.failed).toBe(1);
  });

  it("يستبعد سجلاً بلا dayOneUUID", async () => {
    const records = [record({ id: "r1", dayOneUUID: "" })];
    const r = await parseMadarImportFile(jsonFile(manifest(records, [])));
    expect(r.entries).toHaveLength(0);
    expect(r.failed).toBe(1);
  });
});

describe("MadarImportError", () => {
  it("يحمل الرمز والرسالة", () => {
    const e = new MadarImportError("media", "رسالة");
    expect(e.code).toBe("media");
    expect(e.message).toBe("رسالة");
    expect(e.name).toBe("MadarImportError");
  });
});

// ===================== إعداد الاتصال — يقرأه MadarGatewayClient.swift =====
describe("buildMemoryImporterConnection — الصيغة التي يفكّها JSONDecoder في تطبيق الماك", () => {
  it("يُخرج بالضبط {version, workerURL, mediaKey} بلا أي حقلٍ إضافي", () => {
    const payload = buildMemoryImporterConnection("https://worker.example", "secret-media-key");
    expect(payload).toEqual({ version: MADAR_CONNECTION_VERSION, workerURL: "https://worker.example", mediaKey: "secret-media-key" });
    expect(Object.keys(payload).sort()).toEqual(["mediaKey", "version", "workerURL"]);
  });

  it("version=1 (لا formatVersion، ولا syncSpace)", () => {
    const payload = buildMemoryImporterConnection("https://worker.example", "k") as Record<string, unknown>;
    expect(payload.version).toBe(1);
    expect(payload.formatVersion).toBeUndefined();
    expect(payload.syncSpace).toBeUndefined();
  });

  // تحاكي هذه الحالة ما يفعله MadarGatewayClient.swift فعلياً: JSONDecoder
  // صارمٌ بالاسم — أي انحرافٍ في تسمية المفاتيح (workerUrl بدل workerURL،
  // مثلاً) يفشل الفكّ صامتاً على جهاز المالك. نتحقّق هنا من البنية الحرفية
  // بدل الثقة بأن TypeScript يضمن ذلك (لا يضمنه — JSON.stringify لا يعرف شيئاً
  // عن Swift's CodingKeys).
  it("مطابقةٌ حرفية لأسماء المفاتيح التي يتوقّعها JSONDecoder في Swift", () => {
    const json = JSON.parse(JSON.stringify(buildMemoryImporterConnection("https://w", "k")));
    expect(json).toHaveProperty("workerURL");
    expect(json).not.toHaveProperty("workerUrl");
    expect(json).toHaveProperty("mediaKey");
    expect(json).toHaveProperty("version");
    expect(json).not.toHaveProperty("formatVersion");
  });
});
