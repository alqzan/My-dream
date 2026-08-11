import { describe, it, expect } from "vitest";
import { mergeEntryMedia, stripTombstonedMediaRefs } from "./utils";
import { mediaTombKey } from "./mediaHash";
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
