import { describe, it, expect } from "vitest";
import { entryPhotoSources, entryAudioSources, hasPhoto } from "./mediaSources";
import type { JournalEntry } from "./types";

const A = "a".repeat(32);
const B = "b".repeat(32);
const C = "c".repeat(32);

const entry = (extra: Record<string, unknown>): JournalEntry =>
  ({ id: "e1", date: "2026-01-01", content: "x", ...extra }) as JournalEntry;

describe("entryPhotoSources — إعادة تركيب الترتيب بعد ترطيبٍ جزئي", () => {
  it("بلا مراجع: كل الصور حاضرة، بترتيبها", () => {
    const out = entryPhotoSources(entry({ photos: ["data:1", "data:2"] }));
    expect(out).toEqual([{ inline: "data:1" }, { inline: "data:2" }]);
  });

  it("الحقل القديم `photo` المفرد يُقرأ أيضاً", () => {
    expect(entryPhotoSources(entry({ photo: "data:one" }))).toEqual([{ inline: "data:one" }]);
  });

  it("**الحالة الحرجة**: الوسط وحده تجاوز الميزانية فبقي مرجعاً — يعود لموضعه", () => {
    // hydrateCloudPhotos: refs=[A,B,C]، رُطِّب A وC فقط.
    // photos = بايتات A ثم C (بترتيب المراجع)، photoRefs = [B]، photoOrder = [A,B,C].
    const out = entryPhotoSources(
      entry({ photos: ["bytes:A", "bytes:C"], photoRefs: [B], photoOrder: [A, B, C] })
    );
    expect(out).toEqual([{ inline: "bytes:A" }, { hash: B, kind: "photos" }, { inline: "bytes:C" }]);
  });

  it("لم يُرطَّب شيء: الثلاثة مراجع بترتيبها الأصلي", () => {
    const out = entryPhotoSources(entry({ photoRefs: [A, B, C], photoOrder: [A, B, C] }));
    expect(out).toEqual([{ hash: A, kind: "photos" }, { hash: B, kind: "photos" }, { hash: C, kind: "photos" }]);
  });

  it("بايتاتٌ محلية لا يغطّيها مرجع (صورةٌ لم تُرفع بعد) تلحق في آخر القائمة", () => {
    // keepUncovered في الترطيب يُبقيها بعد المُرطَّبة.
    const out = entryPhotoSources(
      entry({ photos: ["bytes:A", "data:local"], photoRefs: [B], photoOrder: [A, B] })
    );
    expect(out).toEqual([{ inline: "bytes:A" }, { hash: B, kind: "photos" }, { inline: "data:local" }]);
  });

  it("مذكرةٌ من السحابة لم تُرطَّب بعد (بلا photoOrder): المراجع أولاً", () => {
    const out = entryPhotoSources(entry({ photoRefs: [A, B] }));
    expect(out).toEqual([{ hash: A, kind: "photos" }, { hash: B, kind: "photos" }]);
  });

  it("مذكرةٌ بلا وسائط: قائمة فارغة", () => {
    expect(entryPhotoSources(entry({}))).toEqual([]);
    expect(hasPhoto(entry({}))).toBe(false);
  });

  it("hasPhoto يرى المرجع لا البايتات — سؤالُ وجودٍ بلا قراءة", () => {
    expect(hasPhoto(entry({ photoRefs: [A], photoOrder: [A] }))).toBe(true);
    expect(hasPhoto(entry({ photos: ["data:1"] }))).toBe(true);
  });

  it("لا يضيع مصدرٌ أبداً: العدد = المُرطَّب + المتبقّي مرجعاً", () => {
    const out = entryPhotoSources(
      entry({ photos: ["bytes:A"], photoRefs: [B, C], photoOrder: [A, B, C] })
    );
    expect(out).toHaveLength(3);
    expect(out.filter((s) => s.hash).map((s) => s.hash)).toEqual([B, C]);
  });
});

describe("entryAudioSources — نفس القاعدة للصوت", () => {
  it("يعيد تركيب ترتيب المقاطع الصوتية", () => {
    const out = entryAudioSources(
      entry({ audios: ["bytes:A"], audioRefs: [B], audioOrder: [A, B] })
    );
    expect(out).toEqual([{ inline: "bytes:A" }, { hash: B, kind: "audios" }]);
  });

  it("الحقل القديم `audio` المفرد", () => {
    expect(entryAudioSources(entry({ audio: "data:snd" }))).toEqual([{ inline: "data:snd" }]);
  });
});
