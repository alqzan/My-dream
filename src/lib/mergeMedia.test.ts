import { describe, it, expect } from "vitest";
import { mergeEntryMedia, stripTombstonedMediaRefs } from "./utils";
import { mediaTombKey } from "./mediaHash";
import { parseMadarImportFile, type MadarBridgeRecord, type MadarBridgeMedia, type MadarBridgeManifest } from "./madarBridge";
import type { JournalEntry } from "./types";

type E = JournalEntry & { photoRefs?: string[]; audioRefs?: string[] };
const entry = (o: Partial<E> & { id: string }): E => ({ date: "2026-01-01", content: "", ...o });

describe("mergeEntryMedia — no ref is ever dropped, no deletion resurrected", () => {
  it("fills photos onto a base that has none", () => {
    const base = entry({ id: "E1", content: "text only" });
    const other = entry({ id: "E1", photos: ["p1", "p2"], photo: "p1" });
    expect(mergeEntryMedia(base, other).photos).toEqual(["p1", "p2"]);
  });

  it("does NOT resurrect a photo the user removed on the base copy", () => {
    // base deleted p2 (single-photo delete is a real editor action); other lags.
    const base = entry({ id: "E1", photos: ["p1", "p3"], photo: "p1", content: "base" });
    const other = entry({ id: "E1", photos: ["p1", "p2", "p3"], photo: "p1" });
    const out = mergeEntryMedia(base, other);
    expect(out.photos).toEqual(["p1", "p3"]); // base's set is kept as-is
  });

  it("unions pending photoRefs from BOTH copies (they are content hashes)", () => {
    const base = entry({ id: "E1", photos: ["p1"], photo: "p1", photoRefs: ["h1"] });
    const other = entry({ id: "E1", photoRefs: ["h2"] });
    const out = mergeEntryMedia(base, other) as E;
    // Without the union, h2 would be dropped and its R2 object orphaned.
    expect(out.photoRefs).toEqual(["h1", "h2"]);
    expect(out.photos).toEqual(["p1"]); // base's real photo still shown
  });

  it("preserves a ref held only by the LOSING copy", () => {
    // base wins the photo set (has bytes), other carries only an unresolved ref.
    const base = entry({ id: "E1", photos: ["p1", "p2"], photo: "p1" });
    const other = entry({ id: "E1", photoRefs: ["pending"] });
    const out = mergeEntryMedia(base, other) as E;
    expect(out.photos).toEqual(["p1", "p2"]);
    expect(out.photoRefs).toEqual(["pending"]); // survives the merge
  });

  it("dedupes identical refs across copies", () => {
    const base = entry({ id: "E1", photoRefs: ["h1", "h2"] });
    const other = entry({ id: "E1", photoRefs: ["h2", "h3"] });
    expect((mergeEntryMedia(base, other) as E).photoRefs).toEqual(["h1", "h2", "h3"]);
  });

  it("unions audio refs regardless of which audio set is kept", () => {
    const base = entry({ id: "E1", audios: ["a1"], audio: "a1", audioRefs: ["ah1"] });
    const other = entry({ id: "E1", audios: ["a1", "a2"], audio: "a1", audioRefs: ["ah2"] });
    const out = mergeEntryMedia(base, other) as E;
    expect(out.audios).toEqual(["a1"]); // base kept (conservative)
    expect(out.audioRefs).toEqual(["ah1", "ah2"]); // but no ref is lost
  });

  it("leaves an entry with no media untouched (no empty ref arrays)", () => {
    const base = entry({ id: "E1", content: "text only" });
    const out = mergeEntryMedia(base, entry({ id: "E1", content: "x" })) as E;
    expect(out.photoRefs).toBeUndefined();
    expect(out.audioRefs).toBeUndefined();
    expect(out.photos).toBeUndefined();
  });
});

// ===================== مستورد الذكريات: videoRefs.posterHash /
// attachmentRefs.previewHash / audioMetadataRefs — لا تُفقد عند الدمج =====
//
// الهويّة **لا تعتمد على الهاش أبداً** (posterHash/previewHash غائبٌ تماماً
// على نسخةٍ metadataOnly لم تُرفع بعد على أيّ جهاز) بل على حقولٍ وصفية
// مستقرّة تُعرَف محلياً قبل الرفع: type+duration للفيديو، kind+filename
// للـPDF، type+duration+filename للصوت — راجع mergeRefList في utils.ts.
describe("mergeEntryMedia — معاينة فيديو/PDF وبيانات صوت لا تضيع عبر جهازين", () => {
  it("يُبقي فيديو الجهاز الآخر (posterHash) حين لا يحمله الـbase إطلاقاً", () => {
    const base = entry({ id: "E1", content: "نص" });
    const other = entry({ id: "E1", videoRefs: [{ type: "video/quicktime", duration: 8, posterHash: "p1" }] });
    const out = mergeEntryMedia(base, other);
    expect(out.videoRefs).toEqual([{ type: "video/quicktime", duration: 8, posterHash: "p1" }]);
  });

  it("metadataOnly (بلا هاش) ثم uploaded (بهاش) لنفس الفيديو ينتجان مرجعاً واحداً فقط", () => {
    // نفس الفيديو تماماً (type+duration مطابقان — معروفان محلياً قبل الرفع)؛
    // جهازٌ أ رآه قبل الرفع (بلا posterHash)، وجهازٌ ب بعد الرفع (بهاش).
    const base = entry({ id: "E1", videoRefs: [{ type: "video/quicktime", duration: 8 }] });
    const other = entry({ id: "E1", videoRefs: [{ type: "video/quicktime", duration: 8, posterHash: "p1" }] });
    const out = mergeEntryMedia(base, other);
    expect(out.videoRefs).toHaveLength(1); // لا تكرار
    expect(out.videoRefs).toEqual([{ type: "video/quicktime", duration: 8, posterHash: "p1" }]);
  });

  it("لا يكرّر فيديو نفسه حين يحمله الطرفان بالضبط", () => {
    const v = { type: "video/mp4", duration: 5 };
    const base = entry({ id: "E1", videoRefs: [v] });
    const other = entry({ id: "E1", videoRefs: [{ ...v }] });
    expect(mergeEntryMedia(base, other).videoRefs).toEqual([v]);
  });

  it("يفرّق بين فيديوين مختلفين (type/duration مختلفان) فلا يدمجهما خطأً", () => {
    const base = entry({ id: "E1", videoRefs: [{ type: "video/mp4", duration: 5 }] });
    const other = entry({ id: "E1", videoRefs: [{ type: "video/mp4", duration: 20 }] });
    expect(mergeEntryMedia(base, other).videoRefs).toHaveLength(2);
  });

  it("metadataOnly (بلا previewHash) ثم uploaded (بهاش) لنفس ملف PDF ينتجان مرجعاً واحداً فقط", () => {
    // نفس اسم الملف (معروفٌ محلياً قبل الرفع) — previewHash يظهر بعد الرفع فقط.
    const base = entry({ id: "E1", attachmentRefs: [{ kind: "pdf", filename: "عقد.pdf", status: "metadataOnly" }] });
    const other = entry({
      id: "E1",
      attachmentRefs: [{ kind: "pdf", filename: "عقد.pdf", previewHash: "prev1", status: "uploaded" }],
    });
    const out = mergeEntryMedia(base, other);
    expect(out.attachmentRefs).toHaveLength(1); // لا تكرار
    expect(out.attachmentRefs).toEqual([
      { kind: "pdf", filename: "عقد.pdf", previewHash: "prev1", status: "uploaded" },
    ]);
  });

  it("يوحّد audioMetadataRefs بنفس منطق metadataOnly→uploaded (type+duration+filename مطابقة)", () => {
    const base = entry({
      id: "E1",
      audioMetadataRefs: [{ type: "audio/mp4", duration: 3, filename: "note.m4a", status: "metadataOnly" }],
    });
    const other = entry({
      id: "E1",
      audioMetadataRefs: [{ type: "audio/mp4", duration: 3, filename: "note.m4a", status: "uploaded" }],
    });
    const out = mergeEntryMedia(base, other);
    expect(out.audioMetadataRefs).toHaveLength(1); // لا تكرار
    expect(out.audioMetadataRefs).toEqual([
      { type: "audio/mp4", duration: 3, filename: "note.m4a", status: "uploaded" },
    ]);
  });

  it("audioMetadataRefs بأسماء ملفاتٍ مختلفة تبقى عنصرين (ملاحظتان صوتيتان حقيقيتان)", () => {
    const base = entry({ id: "E1", audioMetadataRefs: [{ duration: 3, filename: "a.m4a", status: "metadataOnly" }] });
    const other = entry({ id: "E1", audioMetadataRefs: [{ duration: 3, filename: "b.m4a", status: "metadataOnly" }] });
    expect(mergeEntryMedia(base, other).audioMetadataRefs).toHaveLength(2);
  });
});

// ===================== الهويّة الثابتة sourceMediaID (media.id) — تفوق
// الحقول الوصفية القابلة للالتباس (النوع/المدة/الاسم قد تتطابق بين وسيلتين
// مختلفتين فعلاً، أو يكذب contentType — راجع تعليق originalContentype في
// madarBridge.ts) =====
describe("mergeEntryMedia — sourceMediaID يحسم الهويّة بدل الحقول الوصفية القابلة للالتباس", () => {
  it("نفس sourceMediaID يوحّد رغم اختلاف كل الحقول الوصفية الأخرى", () => {
    const base = entry({ id: "E1", videoRefs: [{ type: "image/jpeg", duration: 1, sourceMediaID: "m1" }] });
    const other = entry({ id: "E1", videoRefs: [{ type: "video/quicktime", duration: 9, posterHash: "p1", sourceMediaID: "m1" }] });
    const out = mergeEntryMedia(base, other);
    expect(out.videoRefs).toHaveLength(1);
    // النسخة الأغنى (النوع الصحيح video/quicktime + posterHash) هي الفائزة.
    expect(out.videoRefs).toEqual([{ type: "video/quicktime", duration: 9, posterHash: "p1", sourceMediaID: "m1" }]);
  });

  it("sourceMediaID مختلف = وسيطان مختلفان رغم تطابق النوع والمدة تماماً", () => {
    const base = entry({ id: "E1", videoRefs: [{ type: "video/mp4", duration: 5, sourceMediaID: "m1" }] });
    const other = entry({ id: "E1", videoRefs: [{ type: "video/mp4", duration: 5, sourceMediaID: "m2" }] });
    expect(mergeEntryMedia(base, other).videoRefs).toHaveLength(2);
  });

  it("PDF: sourceMediaID مختلف = ملفّان رغم نفس الاسم بالضبط", () => {
    const base = entry({ id: "E1", attachmentRefs: [{ kind: "pdf", filename: "عقد.pdf", status: "uploaded", sourceMediaID: "m1" }] });
    const other = entry({ id: "E1", attachmentRefs: [{ kind: "pdf", filename: "عقد.pdf", status: "uploaded", sourceMediaID: "m2" }] });
    expect(mergeEntryMedia(base, other).attachmentRefs).toHaveLength(2);
  });

  it("صوت: sourceMediaID مختلف = ملاحظتان رغم تطابق كل البيانات الوصفية", () => {
    const base = entry({ id: "E1", audioMetadataRefs: [{ type: "audio/mp4", duration: 3, filename: "note.m4a", status: "uploaded", sourceMediaID: "m1" }] });
    const other = entry({ id: "E1", audioMetadataRefs: [{ type: "audio/mp4", duration: 3, filename: "note.m4a", status: "uploaded", sourceMediaID: "m2" }] });
    expect(mergeEntryMedia(base, other).audioMetadataRefs).toHaveLength(2);
  });

  it("عنصرٌ بـsourceMediaID وآخر بلا sourceMediaID لا يندمجان (فضاءا هويّةٍ منفصلان — لا التباس)", () => {
    const base = entry({ id: "E1", videoRefs: [{ type: "video/mp4", duration: 5 }] }); // مرجعٌ قديم بلا الحقل
    const other = entry({ id: "E1", videoRefs: [{ type: "video/mp4", duration: 5, sourceMediaID: "m1" }] });
    expect(mergeEntryMedia(base, other).videoRefs).toHaveLength(2);
  });
});

// ===================== المسار الكامل: parseMadarImportFile ثم الدمج =====
// يثبت أنّ sourceMediaID (=media.id الحقيقي من مانيفست .madarimport) يحسم
// الهويّة صحيحاً حتى حين يكون contentType مضلِّلاً فعلياً (فيديو رُفع كلقطة
// غلافٍ jpeg) — لا كائناتٍ يدويةً مصطنعة، بل مخرجات المحلّل الحقيقية.
describe("parseMadarImportFile ثم mergeEntryMedia — sourceMediaID عبر الأنبوب الكامل", () => {
  const HASH = "a".repeat(32);

  function record(o: Partial<MadarBridgeRecord> & { id: string; dayOneUUID: string }): MadarBridgeRecord {
    return { createdAt: "2026-01-01T09:00:00Z", text: "نص", tags: [], starred: false, mediaIDs: [], ...o };
  }
  function media(o: Partial<MadarBridgeMedia> & { id: string; recordID: string }): MadarBridgeMedia {
    return { kind: "video", status: "metadataOnly", ...o };
  }
  function summaryOf(records: MadarBridgeRecord[], media_: MadarBridgeMedia[]) {
    const recordIds = new Set(records.map((r) => r.id));
    const referenced = media_.filter((m) => recordIds.has(m.recordID)).length;
    const tally = (s: MadarBridgeMedia["status"]) => media_.filter((m) => m.status === s).length;
    return {
      recordCount: records.length, referencedMediaCount: referenced,
      uploadedMediaCount: tally("uploaded"), metadataOnlyCount: tally("metadataOnly"),
      missingMediaCount: tally("missing"), failedMediaCount: tally("failed"),
      originalByteCount: 0, uploadedByteCount: 0,
      sourceReferencedMediaCount: media_.length, skippedByPolicyCount: 0,
    };
  }
  function madarFile(records: MadarBridgeRecord[], media_: MadarBridgeMedia[]): Blob {
    const manifest: MadarBridgeManifest = {
      schemaVersion: 1, importID: "imp-1", createdAt: "2026-01-01T00:00:00Z",
      sourceFingerprint: "fp-1", sourceArchiveName: "Day One.zip", policy: "balanced",
      records, media: media_, summary: summaryOf(records, media_),
    };
    return new Blob([JSON.stringify(manifest)], { type: "application/json" });
  }

  it("metadataOnly ثم uploaded (poster jpeg) لنفس الفيديو عبر ملفَّين حقيقيَّين ينتجان مرجعاً واحداً", async () => {
    const dayOneUUID = "V1";
    // الجولة الأولى: الماك اكتشف الفيديو محلياً قبل أن يرفع شيئاً.
    const first = await parseMadarImportFile(
      madarFile(
        [record({ id: "r1", dayOneUUID, mediaIDs: ["m1"] })],
        [media({ id: "m1", recordID: "r1", kind: "video", originalContentType: "video/quicktime", durationSeconds: 6 })]
      )
    );
    // الجولة الثانية (نفس media.id — الماك يحافظ عليه عبر إعادة المعالجة):
    // رُفعت الآن لقطة غلافٍ jpeg — contentType يصف تلك اللقطة لا الفيديو.
    const second = await parseMadarImportFile(
      madarFile(
        [record({ id: "r1", dayOneUUID, mediaIDs: ["m1"] })],
        [media({
          id: "m1", recordID: "r1", kind: "video", status: "uploaded", cloudKind: "photos", cloudHash: HASH,
          contentType: "image/jpeg", originalContentType: "video/quicktime", uploadedByteCount: 2048, durationSeconds: 6,
        })]
      )
    );

    const merged = mergeEntryMedia(first.entries[0], second.entries[0]);
    expect(merged.videoRefs).toHaveLength(1); // لا تكرار رغم اختلاف contentType/status
    expect(merged.videoRefs).toEqual([
      { type: "video/quicktime", duration: 6, posterHash: HASH, sourceMediaID: "m1" },
    ]);
  });
});

describe("stripTombstonedMediaRefs — حذف صورةٍ يُسقط posterHash/previewHash المطابقين، لا الإشارة كاملةً", () => {
  it("يُسقط posterHash المحذوف من videoRefs ويُبقي بقية الحقول", () => {
    const e = entry({ id: "E1", videoRefs: [{ type: "video/mp4", duration: 4, posterHash: "hp1" }] });
    const tomb = new Set([mediaTombKey("E1", "photos", "hp1")]);
    const out = stripTombstonedMediaRefs(e, tomb);
    expect(out.videoRefs).toEqual([{ type: "video/mp4", duration: 4 }]);
  });

  it("لا يمسّ posterHash لمذكرةٍ أخرى (الشاهد خاصٌّ بـentryId)", () => {
    const e = entry({ id: "E2", videoRefs: [{ posterHash: "hp1" }] });
    const tomb = new Set([mediaTombKey("E1", "photos", "hp1")]); // شاهدٌ لمذكرةٍ أخرى
    const out = stripTombstonedMediaRefs(e, tomb);
    expect(out.videoRefs).toEqual([{ posterHash: "hp1" }]);
  });

  it("يُسقط previewHash المحذوف من attachmentRefs", () => {
    const e = entry({ id: "E1", attachmentRefs: [{ kind: "pdf", previewHash: "hv1", status: "uploaded" }] });
    const tomb = new Set([mediaTombKey("E1", "photos", "hv1")]);
    const out = stripTombstonedMediaRefs(e, tomb);
    expect(out.attachmentRefs).toEqual([{ kind: "pdf", status: "uploaded" }]);
  });
});
